import {
  createCustomSsoCleanupAdapter,
  createCustomSsoSessionKernelAdapter,
} from "@api/services/session/custom-sso-session-kernel.adapter";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { createSessionKernel } from "@iam/api-core/session/kernel";
import { ClientManagementLevel, ClientStatus, UserStatus, UserType } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { sm3 } from "sm-crypto";
import { createSsoService } from "../sso.service";

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

  legacyLocalSessionKeys() {
    return Array.from(this.values.keys()).filter(key => key.startsWith("local_") && key.includes("_session:"));
  }

  reverseKeys() {
    return this.keysStartingWith("local_session_reverse:");
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
let orcasShouldFail = false;

const userDetail = {
  id: 1001,
  username: "138550",
  wxId: null,
  orcasId: null,
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

const redirectPatternsByClientCode: Record<string, string[]> = {
  "pattern-callback": ["https://*.example.com/app/*"],
  "pattern-no-match": ["https://*.com/callback", "https://app.example.com/foo"],
  "pattern-path-boundary": ["https://app.example.com/foo"],
  "pattern-root-domain": ["https://*.example.com"],
  "pattern-skip-invalid": ["https://*.com/callback", "https://app.example.com/foo"],
};

function getMockClientByCode(clientCode: string) {
  if (clientCode === "gateway-orcas") {
    return {
      ...client,
      clientCode,
      extAttributes: {
        ...client.extAttributes,
        managementLevel: ClientManagementLevel.Gateway,
        requireOrcas: true,
        validRedirectUrls: ["https://gateway.example.com"],
      },
    };
  }

  const validRedirectUrls = redirectPatternsByClientCode[clientCode];
  if (validRedirectUrls !== undefined) {
    return {
      ...client,
      clientCode,
      extAttributes: {
        ...client.extAttributes,
        validRedirectUrls,
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
    getUserDetailById: mock(async (userId: number) => {
      if (!liveUserAvailable || userId !== userDetail.id) {
        throw new Error("user not found");
      }
      return userDetail;
    }),
  };
  const customSsoSession = createCustomSsoSessionKernelAdapter({
    kernel,
    redis: fakeRedis as any,
    logger,
    userService: adapterUserService as any,
    auditLogWriter,
    clock: { now: () => fakeRedis.now() },
    config: {
      authCodeExpireSeconds: 60,
      localSessionTtlSeconds: 3600,
    },
  });
  const ssoService = createSsoService({
    redis: fakeRedis as any,
    logger,
    clock: {
      now: mock(() => fakeRedis.now()),
    },
    orcasClient: {
      orcasLogin: mock(async () => {
        if (orcasShouldFail) {
          throw new Error("orcas failed");
        }
        return { orcasId: "orcas", orcasSessionId: "orcas-session" };
      }),
    },
    wechatClient: {
      getWxUserId: mock(async () => "wx-id"),
    },
    clientService,
    customSsoSession,
    userService: {
      getUserDetailByUsername: mock(async () => userDetail),
      getUserDetailByWxId: mock(async () => userDetail),
    },
    auditLogWriter,
    config: {
      authCodeExpireSeconds: 60,
      nodeEnv: "test",
    },
  } as any);

  return { customSsoSession, kernel, ssoService };
}

async function createPrincipalToken(customSsoSession: ReturnType<typeof createServices>["customSsoSession"]) {
  return (await customSsoSession.createPrincipalSession(userDetail, { amr: ["pwd"] })).token;
}

async function createAuthorizedCode(
  services: ReturnType<typeof createServices>,
  clientCode = client.clientCode,
  redirectUrl = "https://app.example.com/callback",
) {
  const principalToken = await createPrincipalToken(services.customSsoSession);
  const authorization = await services.ssoService.authorize(principalToken, "cookie", clientCode, redirectUrl);
  if (!authorization.code) {
    throw new Error("expected auth code");
  }
  return { principalToken, code: authorization.code };
}

async function exchangeIndependentLocalSession(services: ReturnType<typeof createServices>) {
  const { code } = await createAuthorizedCode(services);
  return await services.ssoService.setToken(code, client.clientCode, client.clientSecret);
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

describe("createSsoService redirect pattern validation", () => {
  test("callback accepts redirect URLs matching a valid wildcard pattern", async () => {
    const services = createServices();
    const redirectUrl = "https://tenant.example.com/app/callback?next=1";
    const { code } = await createAuthorizedCode(services, "pattern-callback", redirectUrl);

    await expect(services.ssoService.callback(
      code,
      "pattern-callback",
      redirectUrl,
    )).resolves.toMatchObject({ token: expect.stringContaining("iam_ls_") });
  });

  test("authorize skips invalid historical patterns and accepts a later valid match", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.customSsoSession);

    await expect(services.ssoService.authorize(
      principalToken,
      "cookie",
      "pattern-skip-invalid",
      "https://app.example.com/foo",
    )).resolves.toMatchObject({ isLogin: true, code: expect.stringContaining("iam_ac_") });

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "pattern-skip-invalid",
      pattern: "https://*.com/callback",
    }), "invalid client redirect url pattern");
  });

  test("authorize rejects when no valid pattern matches", async () => {
    const { ssoService } = createServices();

    await expect(ssoService.authorize(
      "global-session",
      "cookie",
      "pattern-no-match",
      "https://app.example.com/bar",
    )).rejects.toThrow("非法重定向地址");
  });

  test("path patterns respect segment boundaries", async () => {
    const { ssoService } = createServices();

    await expect(ssoService.authorize(
      "global-session",
      "cookie",
      "pattern-path-boundary",
      "https://app.example.com/foobar",
    )).rejects.toThrow("非法重定向地址");
  });

  test("host wildcard patterns do not match the root domain", async () => {
    const { ssoService } = createServices();

    await expect(ssoService.authorize(
      "global-session",
      "cookie",
      "pattern-root-domain",
      "https://example.com",
    )).rejects.toThrow("非法重定向地址");
  });
});

describe("SSO Kernel session consistency", () => {
  test("logs legacy PrincipalSession bearer sources without leaking bearer values", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.customSsoSession);

    await services.ssoService.authorize(
      principalToken,
      "authorization_header",
      client.clientCode,
      "https://app.example.com/callback",
      "req-authz-header",
    );
    await services.ssoService.authorize(
      principalToken,
      "query",
      client.clientCode,
      "https://app.example.com/callback",
      "req-query-token",
    );

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: SystemLogEvent.SsoLegacyBearerSourceUsed,
      sourceApp: LoggerSourceApp.Api,
      source: "authorization_header",
      clientCode: client.clientCode,
      requestId: "req-authz-header",
    }), "legacy principal session bearer source used");
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: SystemLogEvent.SsoLegacyBearerSourceUsed,
      sourceApp: LoggerSourceApp.Api,
      source: "query",
      clientCode: client.clientCode,
      requestId: "req-query-token",
    }), "legacy principal session bearer source used");

    const output = JSON.stringify(logger.info.mock.calls);
    expect(output).not.toContain(principalToken);
    expect(output).not.toContain("Authorization");
    expect(output).not.toContain("redirectUrl");
  });

  test("OA and WeChat login create Kernel PrincipalSession tokens", async () => {
    const services = createServices();
    const ts = String(fakeRedis.now());
    const oa = await services.ssoService.loginOA(
      client.clientCode,
      userDetail.username,
      ts,
      createOaToken(userDetail.username, ts),
    );

    expect(oa).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
    await expect(services.customSsoSession.resolvePrincipalSessionUser(oa.token)).resolves.toMatchObject({
      id: userDetail.id,
    });

    const wx = await services.ssoService.loginWX("wx-code");
    expect(wx).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
    const wxRetry = await services.ssoService.loginWX("wx-code");
    expect(wxRetry).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
  });

  test("consumes an auth code once for Independent token exchange without legacy local keys", async () => {
    const services = createServices();
    const { code } = await createAuthorizedCode(services);

    const result = await services.ssoService.setToken(code, client.clientCode, client.clientSecret);

    expect(result.sid).toContain("iam_ls_");
    expect(result.ttl).toBeGreaterThan(0);
    expect(result.userInfo.username).toBe(userDetail.username);
    expect(auditLogs).toHaveLength(1);
    expect(fakeRedis.payloadKeys()).toHaveLength(1);
    expect(fakeRedis.legacyLocalSessionKeys()).toHaveLength(0);
    expect(fakeRedis.reverseKeys()).toHaveLength(0);
    await expect(
      services.ssoService.setToken(code, client.clientCode, client.clientSecret),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
    expect(fakeRedis.payloadKeys()).toHaveLength(1);
  });

  test("rejects token exchange when the referenced PrincipalSession is revoked", async () => {
    const services = createServices();
    const { principalToken, code } = await createAuthorizedCode(services);
    const principal = await services.kernel.resolvePrincipalSession(principalToken);
    if (principal.status !== "resolved") {
      throw new Error("expected principal session");
    }
    await fakeRedis.del(services.kernel.keys.active("principal_session", principal.value.principalSessionId));

    await expect(
      services.ssoService.setToken(code, client.clientCode, client.clientSecret),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test("does not return a local token when private payload write fails after auth code consume", async () => {
    const services = createServices();
    const { code } = await createAuthorizedCode(services);
    fakeRedis.failNextPayloadWrite = true;

    await expect(
      services.ssoService.setToken(code, client.clientCode, client.clientSecret),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    await expect(
      services.ssoService.setToken(code, client.clientCode, client.clientSecret),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
  });

  test("does not return a Gateway local token when ORCAS login fails", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await createAuthorizedCode(services, "gateway-orcas", redirectUrl);
    orcasShouldFail = true;

    await expect(
      services.ssoService.callback(code, "gateway-orcas", redirectUrl),
    ).rejects.toThrow("orcas failed");

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    await expect(
      services.ssoService.callback(code, "gateway-orcas", redirectUrl),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test("authz validates local session credentials and preserves maintenance semantics", async () => {
    const services = createServices();
    const { code } = await createAuthorizedCode(services);
    const result = await services.ssoService.setToken(code, client.clientCode, client.clientSecret);

    const encoded = await services.customSsoSession.authorizeLocalSession(result.sid, client);
    expect(JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))).toEqual({
      id: userDetail.id,
      name: userDetail.name,
      username: userDetail.username,
    });

    await expect(services.customSsoSession.authorizeLocalSession(result.sid, {
      ...client,
      status: ClientStatus.Maintance,
      extAttributes: { ...client.extAttributes, userExcluding: [] },
    })).rejects.toBeInstanceOf(AuthzMaintenanceError);

    await expect(services.customSsoSession.authorizeLocalSession(result.sid, {
      ...client,
      status: ClientStatus.Maintance,
      extAttributes: { ...client.extAttributes, userExcluding: [userDetail.username] },
    })).resolves.toBe(encoded);
  });

  test("authz rejects tombstone, client mismatch, invalid principal, live-state, and bad payload paths", async () => {
    const services = createServices();
    const { code } = await createAuthorizedCode(services);
    const result = await services.ssoService.setToken(code, client.clientCode, client.clientSecret);

    await expect(services.customSsoSession.authorizeLocalSession(result.sid, {
      ...client,
      clientCode: "other-client",
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const credential = await services.kernel.resolveCredential(result.sid);
    if (credential.status !== "resolved") {
      throw new Error("expected credential");
    }
    await fakeRedis.del(services.kernel.keys.active("principal_session", credential.value.principalSessionId));
    await expect(
      services.customSsoSession.authorizeLocalSession(result.sid, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const second = await exchangeIndependentLocalSession(services);
    liveUserAvailable = false;
    await expect(
      services.customSsoSession.authorizeLocalSession(second.sid, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    liveUserAvailable = true;

    const third = await exchangeIndependentLocalSession(services);
    await expect(services.customSsoSession.authorizeLocalSession(third.sid, {
      ...client,
      status: ClientStatus.Disable,
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const payloadKeysBeforeFourth = new Set(fakeRedis.payloadKeys());
    const fourth = await exchangeIndependentLocalSession(services);
    const payloadKey = fakeRedis.payloadKeys().find(key => !payloadKeysBeforeFourth.has(key));
    if (!payloadKey) {
      throw new Error("expected private payload key");
    }
    await fakeRedis.set(payloadKey, "{}");
    await expect(
      services.customSsoSession.authorizeLocalSession(fourth.sid, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const fifth = await exchangeIndependentLocalSession(services);
    await services.customSsoSession.logout(fifth.sid);
    await expect(
      services.customSsoSession.authorizeLocalSession(fifth.sid, client),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test("cleans private payload and logs Independent notification failure during PrincipalSession logout", async () => {
    const services = createServices();
    const { principalToken, code } = await createAuthorizedCode(services);
    await services.ssoService.setToken(code, client.clientCode, client.clientSecret);
    fetchShouldFail = true;

    await expect(services.customSsoSession.logout(principalToken)).resolves.toMatchObject({
      principalSessions: { revoked: 1 },
      credentials: { revoked: 1 },
    });

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    expect(logoutNotifications).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: client.clientCode,
    }), "independent client logout endpoint failed");
  });

});
