import {
  createCustomSsoCleanupAdapter,
  createCustomSsoSessionKernelAdapter,
} from "@api/services/session/custom-sso-session-kernel.adapter";
import { createLoginWithOaUseCase } from "@api/use-cases/sso/login-with-oa/login-with-oa.use-case";
import { createLoginWithWechatUseCase } from "@api/use-cases/sso/login-with-wechat/login-with-wechat.use-case";
import { createLogoutSsoSessionUseCase } from "@api/use-cases/sso/logout-sso-session/logout-sso-session.use-case";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { createSessionKernel } from "@iam/api-core/session/kernel";
import { ClientManagementLevel, ClientStatus, UserStatus, UserType } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { sm3 } from "sm-crypto";

type RedisResult = [Error | null, unknown];
type RedisOperation = () => unknown | Promise<unknown>;

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly zsets = new Map<string, Array<{ member: string; score: number }>>();
  private readonly expires = new Map<string, number>();
  private timestamp = 1_700_000_000_000;
  failNextPayloadWrite = false;

  reset() {
    this.values.clear();
    this.zsets.clear();
    this.expires.clear();
    this.timestamp = 1_700_000_000_000;
    this.failNextPayloadWrite = false;
  }

  now() {
    return this.timestamp;
  }

  keysStartingWith(prefix: string) {
    return Array.from(this.values.keys()).filter(key => key.startsWith(prefix));
  }

  payloadKeys() {
    return this.keysStartingWith("custom-sso:local-session-payload:");
  }

  async set(key: string, value: string, mode?: string, ttl?: number) {
    if (this.failNextPayloadWrite && key.startsWith("custom-sso:local-session-payload:")) {
      this.failNextPayloadWrite = false;
      throw new Error("payload write failed");
    }
    this.values.set(key, value);
    if (mode === "EX" && typeof ttl === "number") {
      this.expires.set(key, this.timestamp + ttl * 1000);
    }
    if (mode === "PX" && typeof ttl === "number") {
      this.expires.set(key, this.timestamp + ttl);
    }
    return "OK";
  }

  async get(key: string) {
    return await this.exists(key) > 0 ? this.values.get(key) ?? null : null;
  }

  async getdel(key: string) {
    const value = await this.get(key);
    await this.del(key);
    return value;
  }

  async del(...keys: string[]) {
    let count = 0;
    for (const key of keys) {
      const deletedValue = this.values.delete(key);
      const deletedZset = this.zsets.delete(key);
      this.expires.delete(key);
      if (deletedValue || deletedZset) {
        count += 1;
      }
    }
    return count;
  }

  async exists(key: string) {
    if (this.isExpired(key)) {
      this.values.delete(key);
      this.zsets.delete(key);
      this.expires.delete(key);
      return 0;
    }
    return this.values.has(key) || this.zsets.has(key) ? 1 : 0;
  }

  async ttl(key: string) {
    if (await this.exists(key) === 0) {
      return -2;
    }
    const expiresAt = this.expires.get(key);
    if (expiresAt === undefined) {
      return -1;
    }
    return Math.ceil((expiresAt - this.timestamp) / 1000);
  }

  async expire(key: string, seconds: number) {
    if (await this.exists(key) === 0) {
      return 0;
    }
    this.expires.set(key, this.timestamp + seconds * 1000);
    return 1;
  }

  async pexpireat(key: string, expiresAt: number) {
    if (await this.exists(key) === 0) {
      return 0;
    }
    this.expires.set(key, expiresAt);
    return 1;
  }

  async zadd(key: string, score: number, member: string) {
    const existing = this.zsets.get(key) ?? [];
    this.zsets.set(key, [
      ...existing.filter(item => item.member !== member),
      { member, score },
    ]);
    return 1;
  }

  async zrange(key: string, start = 0, stop = -1) {
    if (this.isExpired(key)) {
      this.zsets.delete(key);
      this.expires.delete(key);
      return [];
    }
    const sorted = (this.zsets.get(key) ?? [])
      .sort((left, right) => left.score - right.score)
      .map(item => item.member);
    return stop === -1 ? sorted.slice(start) : sorted.slice(start, stop + 1);
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string) {
    const minScore = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const maxScore = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
    const existing = this.zsets.get(key) ?? [];
    const next = existing.filter(item => item.score < minScore || item.score > maxScore);
    this.zsets.set(key, next);
    return existing.length - next.length;
  }

  async zrem(key: string, member: string) {
    const existing = this.zsets.get(key) ?? [];
    const next = existing.filter(item => item.member !== member);
    this.zsets.set(key, next);
    return existing.length - next.length;
  }

  multi() {
    const operations: RedisOperation[] = [];

    const pipeline = {
      set: (key: string, value: string) => {
        operations.push(() => this.set(key, value));
        return pipeline;
      },
      pexpireat: (key: string, expiresAt: number) => {
        operations.push(() => this.pexpireat(key, expiresAt));
        return pipeline;
      },
      zadd: (key: string, score: number, member: string) => {
        operations.push(() => this.zadd(key, score, member));
        return pipeline;
      },
      expire: (key: string, seconds: number) => {
        operations.push(() => this.expire(key, seconds));
        return pipeline;
      },
      del: (...keys: string[]) => {
        operations.push(() => this.del(...keys));
        return pipeline;
      },
      zrem: (key: string, member: string) => {
        operations.push(() => this.zrem(key, member));
        return pipeline;
      },
      exec: async (): Promise<RedisResult[]> => {
        const results: RedisResult[] = [];
        for (const operation of operations) {
          results.push([null, await operation()]);
        }
        return results;
      },
    };

    return pipeline;
  }

  private isExpired(key: string) {
    const expiresAt = this.expires.get(key);
    return expiresAt !== undefined && expiresAt <= this.timestamp;
  }
}

const fakeRedis = new FakeRedis();
const auditLogs: unknown[] = [];
const logoutNotifications: unknown[] = [];
const logger = {
  child: mock(() => logger),
  debug: mock(() => undefined),
  error: mock(() => undefined),
  info: mock(() => undefined),
  warn: mock(() => undefined),
};

let fetchShouldFail = false;
let liveUserAvailable = true;
let profileAvailable = true;
let orcasShouldFail = false;

const userDetail = {
  id: 1001,
  username: "138550",
  wxId: null,
  name: "测试用户",
  mobile: "17721462865",
  userType: UserType.Formal,
  orderNum: 1,
  status: UserStatus.Enable,
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
  employments: [],
  roles: [],
  privileges: [],
};

const client = {
  id: 1,
  clientCode: "independent",
  clientName: "Independent",
  clientSecret: "secret",
  url: "https://app.example.com",
  status: ClientStatus.Enable,
  description: null,
  extAttributes: {
    callbackEndpoint: "https://app.example.com/sso/callback",
    logoutEndpoint: "https://app.example.com/sso/logout",
    managementLevel: ClientManagementLevel.Independent,
    requireOrcas: false,
    userExcluding: [],
    validRedirectUrls: ["https://app.example.com"],
  },
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
};

function getMockClientByCode(clientCode: string) {
  if (clientCode === "gateway" || clientCode === "gateway-orcas") {
    return {
      ...client,
      clientCode,
      extAttributes: {
        ...client.extAttributes,
        managementLevel: ClientManagementLevel.Gateway,
        requireOrcas: clientCode === "gateway-orcas",
        validRedirectUrls: ["https://gateway.example.com"],
      },
    };
  }

  return clientCode === client.clientCode ? client : null;
}

function createServices() {
  const clientService = {
    getClientByCode: mock(async (clientCode: string) => getMockClientByCode(clientCode)),
  };
  const auditLogWriter = {
    recordAuditLog: mock(async (event: unknown) => {
      auditLogs.push(event);
    }),
    recordAuditLogFromContext: mock(async () => undefined),
  };
  const cleanupAdapter = createCustomSsoCleanupAdapter({
    redis: fakeRedis as any,
    logger,
    fetch: globalThis.fetch.bind(globalThis),
  });
  const kernel = createSessionKernel({
    redis: fakeRedis as any,
    config: {
      namespace: "sess:v2:",
      principalIdleTtlMs: 3_600_000,
      principalAbsoluteTtlMs: 3_600_000,
      lookupHmacKeys: {
        current: {
          id: "test-current",
          secret: "test-session-lookup-hmac-secret-32-bytes",
        },
      },
      tombstoneTtlMs: 86_400_000,
      tombstoneGraceMs: 300_000,
      clock: { now: () => fakeRedis.now() },
    },
    cleanupAdapters: [cleanupAdapter],
    logger,
  });
  const adapterUserService = {
    getActiveUserById: mock(async (userId: number) => {
      if (!liveUserAvailable || userId !== userDetail.id) {
        return null;
      }
      return userDetail;
    }),
    getUserDetailById: mock(async (userId: number) => {
      if (!profileAvailable || userId !== userDetail.id) {
        throw new Error("user not found");
      }
      return userDetail;
    }),
  };
  const orcas = {
    orcasLogin: mock(async () => {
      if (orcasShouldFail) {
        throw new Error("orcas failed");
      }
      return { orcasId: "orcas", orcasSessionId: "orcas-session" };
    }),
  };
  const customSsoSession = createCustomSsoSessionKernelAdapter({
    kernel,
    redis: fakeRedis as any,
    logger,
    orcas,
    userService: adapterUserService as any,
    auditLogWriter,
    clock: { now: () => fakeRedis.now() },
    config: {
      authCodeExpireSeconds: 60,
      localSessionTtlSeconds: 3600,
    },
  });
  const wechat = {
    getWxUserId: mock(async () => "wx-id"),
  };
  const ssoUsers = {
    getActiveUserById: mock(async (userId: number) =>
      liveUserAvailable && userId === userDetail.id ? userDetail : null),
    getActiveUserByUsername: mock(async (username: string) =>
      liveUserAvailable && username === userDetail.username ? userDetail : null),
    getActiveUserByWxId: mock(async () => liveUserAvailable ? userDetail : null),
    getUserDetailById: mock(async (userId: number) => {
      if (!profileAvailable || userId !== userDetail.id) {
        throw new Error("user not found");
      }
      return userDetail;
    }),
  };
  const sso = {
    loginWithOa: createLoginWithOaUseCase({
      auditLogWriter,
      clients: clientService,
      clock: { now: () => fakeRedis.now() },
      config: { nodeEnv: "test" },
      principalSessions: customSsoSession,
      users: ssoUsers,
    }),
    loginWithWechat: createLoginWithWechatUseCase({
      auditLogWriter,
      cache: fakeRedis,
      delay: { wait: async () => undefined },
      principalSessions: customSsoSession,
      users: ssoUsers,
      wechat,
    }),
    logout: createLogoutSsoSessionUseCase({ sessions: customSsoSession }),
  };

  return { customSsoSession, kernel, orcas, sso };
}

async function createPrincipalToken(customSsoSession: ReturnType<typeof createServices>["customSsoSession"]) {
  return (await customSsoSession.createPrincipalSession(userDetail, { amr: ["pwd"] })).token;
}

function requestContext(requestId: string) {
  return {
    sourceApp: "iam",
    requestId,
    traceId: "11111111111111111111111111111111",
    ip: "203.0.113.10",
    userAgent: "api-test",
    route: "/sso/authorize",
    method: "GET",
  };
}

async function issueAuthorizationCode(
  services: ReturnType<typeof createServices>,
  options: {
    clientCode?: string;
    redirectUrl?: string;
    requestContext?: ReturnType<typeof requestContext>;
    tokenSource?: "cookie" | "authorization_header" | "query";
  } = {},
) {
  const principalToken = await createPrincipalToken(services.customSsoSession);
  const authorization = await services.customSsoSession.issueAuthorizationCode({
    clientCode: options.clientCode ?? client.clientCode,
    redirectUrl: options.redirectUrl ?? "https://app.example.com/callback",
    requestContext: options.requestContext,
    token: principalToken,
    tokenSource: options.tokenSource ?? "cookie",
  });
  if (!authorization.code) {
    throw new Error("expected auth code");
  }
  return { principalToken, code: authorization.code };
}

async function redeemIndependentCredential(
  services: ReturnType<typeof createServices>,
  options: { requestContext?: ReturnType<typeof requestContext> } = {},
) {
  const { code } = await issueAuthorizationCode(services);
  return await services.customSsoSession.redeemIndependentGrant({
    client,
    code,
    requestContext: options.requestContext,
  });
}

function createOaToken(loginid: string, ts: string, clientSecret = client.clientSecret) {
  return Buffer.from(sm3(`${loginid}|${ts}|${clientSecret}${clientSecret}`), "hex").toBase64();
}

beforeEach(() => {
  fakeRedis.reset();
  auditLogs.length = 0;
  logoutNotifications.length = 0;
  logger.warn.mockClear();
  fetchShouldFail = false;
  liveUserAvailable = true;
  profileAvailable = true;
  orcasShouldFail = false;
  logger.info.mockClear();
  globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    logoutNotifications.push(init?.body);
    if (fetchShouldFail) {
      throw new Error("client logout failed");
    }
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
});

describe("Custom SSO module interface", () => {
  test("issueAuthorizationCode reports an unauthenticated PrincipalSession", async () => {
    const services = createServices();

    await expect(services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      redirectUrl: "https://app.example.com/callback",
      tokenSource: "none",
    })).resolves.toEqual({ isLogin: false, code: null });
  });

  test("redeemIndependentGrant returns an IAM-managed credential with user info and audit context", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.customSsoSession);
    const authorization = await services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      redirectUrl: "https://app.example.com/callback",
      token: principalToken,
      tokenSource: "cookie",
    });
    if (!authorization.code) {
      throw new Error("expected auth code");
    }

    const result = await services.customSsoSession.redeemIndependentGrant({
      client,
      code: authorization.code,
      requestContext: requestContext("req-independent-grant"),
    });

    expect(result).toEqual({
      credential: expect.stringContaining("iam_ls_"),
      ttl: expect.any(Number),
      userInfo: userDetail,
    });
    expect(result.ttl).toBeGreaterThan(0);
    await expect(
      services.customSsoSession.resolveLocalSessionContext(result.credential, client),
    ).resolves.toEqual({ userDetail, orcasId: null });
    expect(auditLogs).toContainEqual(expect.objectContaining({
      action: "auth.login.local",
      details: expect.objectContaining({
        clientCode: client.clientCode,
        managementLevel: ClientManagementLevel.Independent,
      }),
      requestId: "req-independent-grant",
      traceId: "11111111111111111111111111111111",
    }));
  });

  test("completeGatewayLogin creates a Gateway Local Session without calling ORCAS when it is not required", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
    });
    const gatewayClient = getMockClientByCode("gateway");
    if (gatewayClient === null) {
      throw new Error("expected gateway client");
    }

    const result = await services.customSsoSession.completeGatewayLogin({
      client: gatewayClient,
      code,
      redirectUrl,
      requestContext: requestContext("req-gateway"),
    });

    expect(result).toEqual({
      orcasSessionId: null,
      token: expect.stringContaining("iam_ls_"),
    });
    await expect(
      services.customSsoSession.resolveLocalSessionContext(result.token, gatewayClient),
    ).resolves.toEqual({ userDetail, orcasId: null });
    expect(services.orcas.orcasLogin).not.toHaveBeenCalled();
    expect(auditLogs).toContainEqual(expect.objectContaining({
      action: "auth.login.local",
      details: expect.objectContaining({
        clientCode: "gateway",
        managementLevel: ClientManagementLevel.Gateway,
      }),
      requestId: "req-gateway",
      traceId: "11111111111111111111111111111111",
    }));
  });

  test("logs legacy PrincipalSession bearer sources without leaking bearer values", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.customSsoSession);

    await services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      redirectUrl: "https://app.example.com/callback",
      requestContext: requestContext("req-authz-header"),
      token: principalToken,
      tokenSource: "authorization_header",
    });
    await services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      redirectUrl: "https://app.example.com/callback",
      requestContext: requestContext("req-query-token"),
      token: principalToken,
      tokenSource: "query",
    });

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: SystemLogEvent.SsoLegacyBearerSourceUsed,
      sourceApp: LoggerSourceApp.Api,
      source: "authorization_header",
      clientCode: client.clientCode,
      requestId: "req-authz-header",
      traceId: "11111111111111111111111111111111",
    }), "legacy principal session bearer source used");
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: SystemLogEvent.SsoLegacyBearerSourceUsed,
      sourceApp: LoggerSourceApp.Api,
      source: "query",
      clientCode: client.clientCode,
      requestId: "req-query-token",
      traceId: "11111111111111111111111111111111",
    }), "legacy principal session bearer source used");

    const output = JSON.stringify(logger.info.mock.calls);
    expect(output).not.toContain(principalToken);
    expect(output).not.toContain("Authorization");
    expect(output).not.toContain("redirectUrl");
  });

  test("OA and WeChat login create Kernel PrincipalSession tokens", async () => {
    const services = createServices();
    const ts = String(fakeRedis.now());
    const oa = await services.sso.loginWithOa.execute({
      clientCode: client.clientCode,
      loginId: userDetail.username,
      timestamp: ts,
      token: createOaToken(userDetail.username, ts),
    });

    expect(oa).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
    await expect(services.customSsoSession.resolvePrincipalSessionUser(oa.token)).resolves.toMatchObject({
      id: userDetail.id,
    });

    const wx = await services.sso.loginWithWechat.execute({ code: "wx-code" });
    expect(wx).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
    const wxRetry = await services.sso.loginWithWechat.execute({ code: "wx-code" });
    expect(wxRetry).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
  });

  test("redeems an Independent grant once and persists its current payload", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);

    const result = await services.customSsoSession.redeemIndependentGrant({
      client,
      code,
      requestContext: requestContext("req-local-session"),
    });

    expect(result.credential).toContain("iam_ls_");
    expect(fakeRedis.payloadKeys()).toHaveLength(1);
    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client,
        code,
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
    expect(fakeRedis.payloadKeys()).toHaveLength(1);
  });

  test("rejects an Independent grant bound to another client", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);

    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: { ...client, clientCode: "other-client" },
        code,
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
    await expect(
      services.customSsoSession.redeemIndependentGrant({ client, code }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
  });

  test("rejects an Independent grant when the live user is disabled", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);
    liveUserAvailable = false;

    await expect(
      services.customSsoSession.redeemIndependentGrant({ client, code }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test("binds an authorization code to the issued redirect URL", async () => {
    const services = createServices();
    const issuedRedirectUrl = "https://gateway.example.com/issued";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway-orcas",
      redirectUrl: issuedRedirectUrl,
    });
    const gatewayClient = getMockClientByCode("gateway-orcas");
    if (gatewayClient === null) {
      throw new Error("expected gateway-orcas client");
    }

    await expect(services.customSsoSession.completeGatewayLogin({
      client: gatewayClient,
      code,
      redirectUrl: "https://gateway.example.com/different",
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test("rejects an Independent grant when the referenced PrincipalSession is revoked", async () => {
    const services = createServices();
    const { principalToken, code } = await issueAuthorizationCode(services);
    const principal = await services.kernel.resolvePrincipalSession(principalToken);
    if (principal.status !== "resolved") {
      throw new Error("expected principal session");
    }
    await fakeRedis.del(services.kernel.keys.active("principal_session", principal.value.principalSessionId));

    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client,
        code,
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test("does not return an Independent credential when its private payload write fails", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);
    fakeRedis.failNextPayloadWrite = true;

    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client,
        code,
        requestContext: requestContext("req-payload-failure"),
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: client.clientCode,
      requestId: "req-payload-failure",
      traceId: "11111111111111111111111111111111",
    }), "failed to write custom sso local session payload");
    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client,
        code,
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
  });

  test("does not return a Gateway local token when ORCAS login fails", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { principalToken, code } = await issueAuthorizationCode(services, {
      clientCode: "gateway-orcas",
      redirectUrl,
    });
    const gatewayClient = getMockClientByCode("gateway-orcas");
    if (gatewayClient === null) {
      throw new Error("expected gateway-orcas client");
    }
    orcasShouldFail = true;

    await expect(
      services.customSsoSession.completeGatewayLogin({
        client: gatewayClient,
        code,
        redirectUrl,
      }),
    ).rejects.toThrow("orcas failed");

    await expect(
      services.customSsoSession.completeGatewayLogin({
        client: gatewayClient,
        code,
        redirectUrl,
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.customSsoSession.logout(principalToken),
    ).resolves.toMatchObject({
      principalSessions: { revoked: 1 },
      bindings: {
        alreadyRevoked: 0,
        excluded: 0,
        missing: 0,
        revoked: 0,
      },
      credentials: {
        alreadyRevoked: 0,
        excluded: 0,
        missing: 0,
        revoked: 0,
      },
    });
  });

  test("does not return a Gateway local token or allow code replay when its private payload write fails", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { principalToken, code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
    });
    const gatewayClient = getMockClientByCode("gateway");
    if (gatewayClient === null) {
      throw new Error("expected gateway client");
    }
    fakeRedis.failNextPayloadWrite = true;

    await expect(
      services.customSsoSession.completeGatewayLogin({
        client: gatewayClient,
        code,
        redirectUrl,
        requestContext: requestContext("req-gateway-payload-failure"),
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(auditLogs).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "gateway",
      requestId: "req-gateway-payload-failure",
      traceId: "11111111111111111111111111111111",
    }), "failed to write custom sso local session payload");

    await expect(
      services.customSsoSession.completeGatewayLogin({
        client: gatewayClient,
        code,
        redirectUrl,
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.customSsoSession.logout(principalToken),
    ).resolves.toMatchObject({
      principalSessions: { revoked: 1 },
      bindings: {
        alreadyRevoked: 0,
        excluded: 0,
        missing: 0,
        revoked: 0,
      },
      credentials: {
        alreadyRevoked: 0,
        excluded: 0,
        missing: 0,
        revoked: 0,
      },
    });
  });

  test("completeGatewayLogin binds the required ORCAS identity without changing the user DTO", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway-orcas",
      redirectUrl,
    });
    const gatewayClient = getMockClientByCode("gateway-orcas");
    if (gatewayClient === null) {
      throw new Error("expected gateway-orcas client");
    }

    const result = await services.customSsoSession.completeGatewayLogin({
      client: gatewayClient,
      code,
      redirectUrl,
    });
    const sessionContext = await services.customSsoSession.resolveLocalSessionContext(result.token, gatewayClient);

    expect(services.orcas.orcasLogin).toHaveBeenCalledWith({
      id: userDetail.id,
      username: userDetail.username,
      name: userDetail.name,
      mobile: userDetail.mobile,
    });
    expect(result).toEqual({
      orcasSessionId: "orcas-session",
      token: expect.stringContaining("iam_ls_"),
    });
    expect(sessionContext).toEqual({
      orcasId: "orcas",
      userDetail,
    });
    expect(sessionContext.userDetail).not.toHaveProperty("orcasId");
  });

  test("resolves legacy Gateway Orcas ID from the local session payload user snapshot", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway-orcas",
      redirectUrl,
    });
    const gatewayClient = getMockClientByCode("gateway-orcas");
    if (gatewayClient === null) {
      throw new Error("expected gateway-orcas client");
    }

    const payloadKeysBefore = new Set(fakeRedis.payloadKeys());
    const result = await services.customSsoSession.completeGatewayLogin({
      client: gatewayClient,
      code,
      redirectUrl,
    });
    const payloadKey = fakeRedis.payloadKeys().find(key => !payloadKeysBefore.has(key));
    if (!payloadKey) {
      throw new Error("expected private payload key");
    }
    const serialized = await fakeRedis.get(payloadKey);
    if (serialized === null) {
      throw new Error("expected private payload");
    }
    const payload = JSON.parse(serialized) as Record<string, unknown>;
    delete payload.orcas;
    await fakeRedis.set(payloadKey, JSON.stringify({
      ...payload,
      user: {
        ...(payload.user as Record<string, unknown>),
        orcasId: "legacy-orcas",
      },
      orcasSessionId: "legacy-orcas-session",
    }));

    const sessionContext = await services.customSsoSession.resolveLocalSessionContext(result.token, gatewayClient);

    expect(sessionContext.orcasId).toBe("legacy-orcas");
    expect(sessionContext.userDetail).not.toHaveProperty("orcasId");
  });

  test("IAM validates Independent Client Credentials and preserves maintenance semantics", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);

    const encoded = await services.customSsoSession.authorizeLocalSession(result.credential, client);
    expect(JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))).toEqual({
      id: userDetail.id,
      name: userDetail.name,
      username: userDetail.username,
    });

    await expect(services.customSsoSession.authorizeLocalSession(result.credential, {
      ...client,
      status: ClientStatus.Maintenance,
      extAttributes: { ...client.extAttributes, userExcluding: [] },
    })).rejects.toBeInstanceOf(AuthzMaintenanceError);

    await expect(services.customSsoSession.authorizeLocalSession(result.credential, {
      ...client,
      status: ClientStatus.Maintenance,
      extAttributes: { ...client.extAttributes, userExcluding: [userDetail.username] },
    })).resolves.toBe(encoded);
  });

  test("IAM revokes an Independent Client Credential through logout", async () => {
    const services = createServices();
    const credential = await redeemIndependentCredential(services);

    await services.customSsoSession.logout(credential.credential);

    await expect(
      services.customSsoSession.resolveLocalSessionContext(credential.credential, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test("authz rejects tombstone, client mismatch, invalid principal, live-state, and bad payload paths", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);

    await expect(services.customSsoSession.authorizeLocalSession(result.credential, {
      ...client,
      clientCode: "other-client",
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const credential = await services.kernel.resolveCredential(result.credential);
    if (credential.status !== "resolved") {
      throw new Error("expected credential");
    }
    await fakeRedis.del(services.kernel.keys.active("principal_session", credential.value.principalSessionId));
    await expect(
      services.customSsoSession.authorizeLocalSession(result.credential, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const second = await redeemIndependentCredential(services, {
      requestContext: requestContext("req-local-session"),
    });
    liveUserAvailable = false;
    await expect(
      services.customSsoSession.authorizeLocalSession(second.credential, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    liveUserAvailable = true;
    await expect(
      services.customSsoSession.authorizeLocalSession(second.credential, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const profileMissing = await redeemIndependentCredential(services);
    profileAvailable = false;
    await expect(
      services.customSsoSession.authorizeLocalSession(profileMissing.credential, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    profileAvailable = true;
    await expect(
      services.customSsoSession.authorizeLocalSession(profileMissing.credential, client),
    ).resolves.toEqual(expect.any(String));

    const third = await redeemIndependentCredential(services);
    await expect(services.customSsoSession.authorizeLocalSession(third.credential, {
      ...client,
      status: ClientStatus.Disable,
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const payloadKeysBeforeFourth = new Set(fakeRedis.payloadKeys());
    const fourth = await redeemIndependentCredential(services);
    const payloadKey = fakeRedis.payloadKeys().find(key => !payloadKeysBeforeFourth.has(key));
    if (!payloadKey) {
      throw new Error("expected private payload key");
    }
    await fakeRedis.set(payloadKey, "{}");
    await expect(
      services.customSsoSession.authorizeLocalSession(fourth.credential, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test("cleans private payload and logs Independent notification failure during PrincipalSession logout", async () => {
    const services = createServices();
    const { principalToken, code } = await issueAuthorizationCode(services);
    const credential = await services.customSsoSession.redeemIndependentGrant({
      client,
      code,
    });
    fetchShouldFail = true;

    await expect(services.customSsoSession.logout(principalToken)).resolves.toMatchObject({
      principalSessions: { revoked: 1 },
      credentials: { revoked: 1 },
    });

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    expect(logoutNotifications).toEqual([
      JSON.stringify({ sid: credential.credential }),
    ]);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: client.clientCode,
    }), "independent client logout endpoint failed");
  });
});
