import type {
  AuthorizationGrantRedemption,
  AuthorizationGrantRedemptionScheduler,
} from "@iam/api-core/authorization-grant";
import type { SessionKernel } from "@iam/api-core/session/kernel";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { randomUUID } from "node:crypto";
import {
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import {
  createCustomSsoSessionKernelAdapter,
} from "@api/services/session/custom-sso-session-kernel.adapter";
import { createLoginWithOaUseCase } from "@api/use-cases/sso/login-with-oa/login-with-oa.use-case";
import { createLoginWithWechatUseCase } from "@api/use-cases/sso/login-with-wechat/login-with-wechat.use-case";
import { createLogoutSsoSessionUseCase } from "@api/use-cases/sso/logout-sso-session/logout-sso-session.use-case";
import { createAuthorizationGrantRedemption } from "@iam/api-core/authorization-grant";
import {
  createInMemoryAuthorizationGrantRedemptionStore,
  createManualAuthorizationGrantRedemptionScheduler,
} from "@iam/api-core/authorization-grant/testing";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { createSessionKernelForTesting } from "@iam/api-core/session/kernel/testing";
import {
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import {
  SubjectProjectionNotReadyError,
} from "@iam/client-subject-projection";
import { CustomSsoSubjectProjectionInvariantError } from "@iam/client-subject-projection/custom-sso";
import {
  ClientStatus,
  CustomSsoClientMode,
  RETRYABLE_SERVICE_UNAVAILABLE,
  SubjectClaim,
  UserStatus,
  UserType,
} from "@iam/contracts";
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

  advance(milliseconds: number) {
    this.timestamp += milliseconds;
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
const logger = {
  child: mock(() => logger),
  debug: mock(() => undefined),
  error: mock(() => undefined),
  info: mock(() => undefined),
  warn: mock(() => undefined),
};

let liveUserAvailable = true;
let profileAvailable = true;
let orcasShouldFail = false;

const subjectIdentifier = "00000000-0000-4000-8000-000000001001";

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
  extAttributes: {},
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
};

const independentClient = {
  clientCode: "independent",
  configVersion: 7,
  subjectClaims: [SubjectClaim.SubjectIdentifier],
};

const independentRuntimeClient = {
  id: 1,
  clientCode: "independent",
  clientName: "Independent",
  status: ClientStatus.Enable,
  isDelete: false,
  customSsoEnabled: true,
  customSsoConfig: {
    mode: CustomSsoClientMode.Independent,
    subjectClaims: [SubjectClaim.SubjectIdentifier],
    validRedirectUrls: ["https://app.example.com/callback"],
    callbackEndpoint: "https://app.example.com/sso/callback",
    logoutEndpoint: "https://app.example.com/sso/logout",
  },
  customSsoConfigVersion: 7,
} satisfies CustomSsoClientRuntimeDto;
let currentIndependentRuntimeClient: CustomSsoClientRuntimeDto
  = independentRuntimeClient;

function createGatewayRuntimeClient(
  clientCode: "gateway" | "gateway-orcas",
): CustomSsoClientRuntimeDto {
  return {
    id: clientCode === "gateway" ? 2 : 3,
    clientCode,
    clientName: clientCode,
    status: ClientStatus.Enable,
    isDelete: false,
    customSsoEnabled: true,
    customSsoConfig: {
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: clientCode === "gateway-orcas" },
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      validRedirectUrls: ["https://gateway.example.com"],
    },
    customSsoConfigVersion: 7,
  };
}

let currentGatewayRuntimeClient: CustomSsoClientRuntimeDto
  = createGatewayRuntimeClient("gateway");
let currentGatewayOrcasRuntimeClient: CustomSsoClientRuntimeDto
  = createGatewayRuntimeClient("gateway-orcas");

function getMockClientByCode(clientCode: string) {
  if (clientCode === "gateway" || clientCode === "gateway-orcas") {
    return {
      ...client,
      clientCode,
      extAttributes: {},
    };
  }

  return clientCode === client.clientCode ? client : null;
}

function getGatewayClientContext(clientCode: "gateway" | "gateway-orcas") {
  return {
    clientCode,
    configVersion: 7,
    orcasEnabled: clientCode === "gateway-orcas",
  };
}

function createServices(options: {
  authorizationGrantRedemption?: (
    defaultRedemption: AuthorizationGrantRedemption,
  ) => AuthorizationGrantRedemption;
  captureSubjectAccessTransitionId?: () => string | Promise<string>;
  decorateKernel?: (
    kernel: SessionKernel,
  ) => SessionKernel;
  getActiveUserBySubjectIdentifier?: (
    subjectIdentifier: string,
  ) => Promise<(typeof userDetail & { subjectIdentifier: string }) | null>;
  findRuntimeClient?: (
    clientCode: string,
  ) => Promise<CustomSsoClientRuntimeDto | null>;
  grantLeaseDurationMs?: number;
  grantAttemptId?: string;
  grantAttemptIds?: readonly string[];
  grantScheduler?: AuthorizationGrantRedemptionScheduler;
  recordAuditLog?: (event: unknown) => Promise<void>;
  validatePrincipal?: (target: { principal: { subjectId: string } }) => Promise<
    | { ok: true }
    | {
      ok: false;
      reason: "session_generation_stale" | "user_deleted" | "user_disabled";
    }
  >;
  resolveSubjectProjection?: (input: {
    subjectIdentifier: string;
    clientCode: string;
  }) => Promise<{
    subjectIdentifier: string;
    username?: string;
  }>;
} = {}) {
  const clientService = {
    getClientByCode: mock(async (clientCode: string) => getMockClientByCode(clientCode)),
  };
  const auditLogWriter = {
    recordAuditLog: mock(async (event: unknown) => {
      if (options.recordAuditLog)
        return await options.recordAuditLog(event);
      auditLogs.push(event);
    }),
    recordAuditLogFromContext: mock(async () => undefined),
  };
  const kernel = createSessionKernelForTesting({
    redis: fakeRedis as any,
    principalAccessFence: {
      capture: options.captureSubjectAccessTransitionId
        ?? (async () => "20000000-0000-4000-8000-000000000001"),
      validate: async () => ({ ok: true }),
    },
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
    validationHooks: options.validatePrincipal === undefined
      ? undefined
      : { validatePrincipal: options.validatePrincipal },
    logger,
  });
  const adapterKernel = options.decorateKernel?.(kernel) ?? kernel;
  const adapterUserService = {
    getActiveUserBySubjectIdentifier: mock(async (input: string) => {
      if (options.getActiveUserBySubjectIdentifier)
        return await options.getActiveUserBySubjectIdentifier(input);
      if (!liveUserAvailable || input !== subjectIdentifier) {
        return null;
      }
      return { ...userDetail, subjectIdentifier };
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
  let grantAttemptIndex = 0;
  const defaultAuthorizationGrantRedemption = createAuthorizationGrantRedemption({
    leaseDurationMs: options.grantLeaseDurationMs ?? 5_000,
    random: {
      uuid: () => options.grantAttemptIds?.[grantAttemptIndex++]
        ?? options.grantAttemptId
        ?? randomUUID(),
    },
    scheduler: options.grantScheduler,
    store: createInMemoryAuthorizationGrantRedemptionStore({
      clock: { now: () => fakeRedis.now() },
    }),
  });
  const authorizationGrantRedemption
    = options.authorizationGrantRedemption?.(defaultAuthorizationGrantRedemption)
      ?? defaultAuthorizationGrantRedemption;
  const subjectProjection = {
    resolve: mock(options.resolveSubjectProjection ?? (async (input: {
      subjectIdentifier: string;
      clientCode: string;
    }) => ({
      subjectIdentifier: input.subjectIdentifier,
    }))),
  };
  const subjectDelivery = {
    createUserInfoCapability: mock((context: {
      subjectIdentifier: string;
    }) => Object.freeze({
      resolveUserInfo: mock(async () => ({
        version: 2 as const,
        subjectIdentifier: context.subjectIdentifier,
      })),
    })),
    resolveGatewaySubjectHeader: mock(async (context: {
      subjectIdentifier: string;
    }) => Buffer.from(JSON.stringify({
      version: 1,
      subjectIdentifier: context.subjectIdentifier,
    }), "utf8").toString("base64")),
  };
  const customSsoSession = createCustomSsoSessionKernelAdapter({
    authorizationGrantRedemption,
    clients: {
      findRuntimeRecord: options.findRuntimeClient
        ?? (async (clientCode: string) =>
          clientCode === currentIndependentRuntimeClient.clientCode
            ? currentIndependentRuntimeClient
            : clientCode === currentGatewayRuntimeClient.clientCode
              ? currentGatewayRuntimeClient
              : clientCode === currentGatewayOrcasRuntimeClient.clientCode
                ? currentGatewayOrcasRuntimeClient
                : null),
    },
    kernel: adapterKernel,
    logger,
    orcas,
    random: { uuid: randomUUID },
    subjectDelivery,
    subjectProjection,
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
      liveUserAvailable && userId === userDetail.id ? { ...userDetail, subjectIdentifier } : null),
    getActiveUserByUsername: mock(async (username: string) =>
      liveUserAvailable && username === userDetail.username ? { ...userDetail, subjectIdentifier } : null),
    getActiveUserByWxId: mock(async () => liveUserAvailable ? { ...userDetail, subjectIdentifier } : null),
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

  return {
    authorizationGrantRedemption,
    customSsoSession,
    kernel,
    orcas,
    resolveAuthenticationContext: async (
      token: string,
      clientCode = "iam",
    ): Promise<{
      readonly authenticatedClientCode: string;
      readonly orcasId?: string;
      readonly subjectIdentifier: string;
    }> => (await customSsoSession.resolvePublicAuthentication(
      token,
      clientCode,
    )).authenticationContext,
    sso,
    subjectDelivery,
    subjectProjection,
    userService: adapterUserService,
  };
}

async function createPrincipalToken(customSsoSession: ReturnType<typeof createServices>["customSsoSession"]) {
  return (await customSsoSession.createPrincipalSession(subjectIdentifier, { amr: ["pwd"] })).token;
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
    configVersion?: number;
    redirectUrl?: string;
    requestContext?: ReturnType<typeof requestContext>;
    state?: string;
    tokenSource?: "cookie" | "authorization_header" | "query";
  } = {},
) {
  const principalToken = await createPrincipalToken(services.customSsoSession);
  const authorization = await services.customSsoSession.issueAuthorizationCode({
    clientCode: options.clientCode ?? client.clientCode,
    configVersion: options.configVersion ?? 7,
    mode: (options.clientCode ?? client.clientCode).startsWith("gateway")
      ? CustomSsoClientMode.Gateway
      : CustomSsoClientMode.Independent,
    redirectUrl: options.redirectUrl ?? "https://app.example.com/callback",
    requestContext: options.requestContext,
    state: options.state,
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
    client: independentClient,
    code,
    redirectUri: "https://app.example.com/callback",
    requestContext: options.requestContext,
  });
}

async function assertAmbiguousCredentialIssueRecovery(
  prepareOperation: (
    services: ReturnType<typeof createServices>,
  ) => Promise<() => Promise<string>>,
) {
  const firstAttemptId = "10000000-0000-4000-8000-000000000001";
  const secondAttemptId = "20000000-0000-4000-8000-000000000002";
  const responseLoss = new Error("credential response lost");
  let firstCredentialToken: string | undefined;
  let issueAttempts = 0;
  const services = createServices({
    grantAttemptIds: [firstAttemptId, secondAttemptId],
    decorateKernel: kernel => ({
      ...kernel,
      async issueCredential(input) {
        issueAttempts += 1;
        const issued = await kernel.issueCredential(input);
        if (issueAttempts === 1) {
          firstCredentialToken = issued.status === "created"
            ? issued.externalToken
            : undefined;
          throw responseLoss;
        }
        return issued;
      },
    }),
  });
  const execute = await prepareOperation(services);

  await expect(execute()).rejects.toBe(responseLoss);
  expect(firstCredentialToken).toBeDefined();
  await expect(
    services.kernel.resolveCredential(firstCredentialToken!),
  ).resolves.toMatchObject({ status: "revoked" });

  const retryToken = await execute();
  await expect(
    services.kernel.resolveCredential(retryToken),
  ).resolves.toMatchObject({
    status: "resolved",
    value: { credentialId: secondAttemptId },
  });
}

function createOaToken(loginid: string, ts: string, clientSecret = client.clientSecret) {
  return Buffer.from(sm3(`${loginid}|${ts}|${clientSecret}${clientSecret}`), "hex").toBase64();
}

beforeEach(() => {
  fakeRedis.reset();
  auditLogs.length = 0;
  logger.warn.mockClear();
  liveUserAvailable = true;
  profileAvailable = true;
  orcasShouldFail = false;
  currentIndependentRuntimeClient = independentRuntimeClient;
  currentGatewayRuntimeClient = createGatewayRuntimeClient("gateway");
  currentGatewayOrcasRuntimeClient = createGatewayRuntimeClient("gateway-orcas");
  logger.info.mockClear();
});

describe("Custom SSO module interface", () => {
  test("issues an Independent Credential with the reserved attempt identity and no Client Binding", async () => {
    const grantAttemptId = "10000000-0000-4000-8000-000000000001";
    const services = createServices({ grantAttemptId });

    const result = await redeemIndependentCredential(services);
    const credential = await services.kernel.resolveCredential(result.credential);

    expect(credential).toMatchObject({
      status: "resolved",
      value: {
        credentialId: grantAttemptId,
      },
    });
    if (credential.status !== "resolved")
      throw new Error("expected resolved Independent Credential");
    expect(credential.value).not.toHaveProperty("bindingId");
  });

  test("protocol invalidation revokes a direct Independent Credential without a binding count", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);

    const summary = await services.kernel.revokeClientProtocol(
      independentClient.clientCode,
      "custom-sso",
      "client_config_changed",
    );

    expect(summary).toMatchObject({
      bindings: { revoked: 0 },
      credentials: { revoked: 1 },
    });
    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.kernel.resolveCredential(result.credential),
    ).resolves.toMatchObject({ status: "revoked" });
  });

  test("protocol artifact cleanup makes an issued Custom SSO code fail with InvalidAuthCodeError", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);

    await services.kernel.revokeClientProtocol(
      independentClient.clientCode,
      "custom-sso",
      "client_config_changed",
    );

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).rejects.toBeInstanceOf(InvalidAuthCodeError);
  });

  test("revokes an ambiguously committed Credential and retries the Grant with a new attempt identity", async () => {
    await assertAmbiguousCredentialIssueRecovery(async (services) => {
      const { code } = await issueAuthorizationCode(services);
      const input = {
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      };
      return async () => {
        const result = await services.customSsoSession.redeemIndependentGrant(input);
        return result.credential;
      };
    });
  });

  test("recovers a Gateway Grant after an ambiguously committed Local Session", async () => {
    await assertAmbiguousCredentialIssueRecovery(async (services) => {
      const redirectUrl = "https://gateway.example.com/callback";
      const { code } = await issueAuthorizationCode(services, {
        clientCode: "gateway",
        redirectUrl,
      });
      const input = {
        client: getGatewayClientContext("gateway"),
        code,
        redirectUrl,
      };
      return async () => {
        const result = await services.customSsoSession.completeGatewayLogin(input);
        return result.token;
      };
    });
  });

  test("rejects and revokes a legacy binding-backed Custom SSO Credential", async () => {
    const services = createServices();
    const principal = await services.kernel.createPrincipalSession(subjectIdentifier);
    if (principal.status !== "created")
      throw new Error("expected Principal Session");
    const binding = await services.kernel.createClientBinding({
      principalSessionId: principal.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: independentClient.clientCode,
      metadata: {
        version: 1,
        mode: CustomSsoClientMode.Independent,
        configVersion: independentClient.configVersion,
      },
    });
    if (binding.status !== "created")
      throw new Error("expected legacy Client Binding");
    const legacyCredential = await services.kernel.issueCredential({
      principalSessionId: principal.value.principalSessionId,
      bindingId: binding.value.bindingId,
      protocol: "custom-sso",
      clientCode: independentClient.clientCode,
      credentialType: "local_session",
      tokenKind: "localSession",
      metadata: {
        version: 1,
        mode: CustomSsoClientMode.Independent,
        configVersion: independentClient.configVersion,
      },
    });
    if (legacyCredential.status !== "created" || legacyCredential.externalToken === undefined)
      throw new Error("expected legacy Credential");
    const legacyLogoutCredential = await services.kernel.issueCredential({
      principalSessionId: principal.value.principalSessionId,
      bindingId: binding.value.bindingId,
      protocol: "custom-sso",
      clientCode: independentClient.clientCode,
      credentialType: "local_session",
      tokenKind: "localSession",
      metadata: {
        version: 1,
        mode: CustomSsoClientMode.Independent,
        configVersion: independentClient.configVersion,
      },
    });
    if (
      legacyLogoutCredential.status !== "created"
      || legacyLogoutCredential.externalToken === undefined
      || principal.externalToken === undefined
    ) {
      throw new Error("expected legacy logout Credential");
    }

    await expect(
      services.resolveAuthenticationContext(
        legacyCredential.externalToken,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.kernel.resolveCredential(legacyCredential.externalToken),
    ).resolves.toMatchObject({ status: "revoked" });
    await expect(
      services.customSsoSession.logout(legacyLogoutCredential.externalToken),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.kernel.resolveCredential(legacyLogoutCredential.externalToken),
    ).resolves.toMatchObject({ status: "revoked" });
    await expect(
      services.kernel.resolvePrincipalSession(principal.externalToken),
    ).resolves.toMatchObject({ status: "resolved" });
  });

  test("fails closed on an active attempt identity collision without revoking its existing Credential", async () => {
    const grantAttemptId = "10000000-0000-4000-8000-000000000001";
    let attemptedCredentialId: string | undefined;
    const services = createServices({
      grantAttemptId,
      decorateKernel: kernel => ({
        ...kernel,
        async issueCredential(input) {
          attemptedCredentialId = input.credentialId;
          return {
            status: "fail_closed" as const,
            message: "credential identity is already active",
          };
        },
      }),
    });
    const { code, principalToken } = await issueAuthorizationCode(services);
    const principal = await services.kernel.resolvePrincipalSession(principalToken);
    if (principal.status !== "resolved")
      throw new Error("expected Principal Session");
    const existing = await services.kernel.issueCredential({
      credentialId: grantAttemptId,
      externalToken: "preexisting-collision-token",
      principalSessionId: principal.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: independentClient.clientCode,
      credentialType: "local_session",
      metadata: {
        version: 2,
        mode: CustomSsoClientMode.Independent,
        configVersion: independentClient.configVersion,
      },
    });
    if (existing.status !== "created")
      throw new Error("expected pre-existing Credential");

    let redemptionError: unknown;
    try {
      await services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      });
    }
    catch (error) {
      redemptionError = error;
    }
    expect(attemptedCredentialId).toBe(grantAttemptId);
    expect(redemptionError).toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.kernel.resolveCredential("preexisting-collision-token"),
    ).resolves.toMatchObject({ status: "resolved" });
  });

  test("preserves Subject Access classification while creating an authorization artifact", async () => {
    let validationCalls = 0;
    const services = createServices({
      validatePrincipal: async () => {
        validationCalls += 1;
        return validationCalls === 3
          ? { ok: false, reason: "user_disabled" }
          : { ok: true };
      },
    });
    const token = await createPrincipalToken(services.customSsoSession);

    await expect(services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      configVersion: independentClient.configVersion,
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/callback",
      token,
      tokenSource: "cookie",
    })).rejects.toBeInstanceOf(SubjectAccessDisabledError);
  });

  test.each([
    ["while issuing the Credential", 3],
    ["during post-issue Credential validation", 4],
  ] as const)("preserves Subject Access classification %s", async (
    _validationPhase,
    failingValidationCall,
  ) => {
    let countValidations = false;
    let validationCalls = 0;
    const services = createServices({
      validatePrincipal: async () => {
        if (!countValidations)
          return { ok: true };
        validationCalls += 1;
        return validationCalls === failingValidationCall
          ? { ok: false, reason: "user_disabled" }
          : { ok: true };
      },
    });
    const { code } = await issueAuthorizationCode(services);
    countValidations = true;

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).rejects.toBeInstanceOf(SubjectAccessDisabledError);
  });

  test("keeps pre-disable Local Session, Independent Credential, and Grant invalid after re-enable", async () => {
    const services = createServices();
    const independentCredential
      = await redeemIndependentCredential(services);
    const { code: independentGrant } = await issueAuthorizationCode(
      services,
    );
    const gatewayRedirectUrl
      = "https://gateway.example.com/callback";
    const { code: gatewayGrant } = await issueAuthorizationCode(
      services,
      {
        clientCode: "gateway",
        redirectUrl: gatewayRedirectUrl,
      },
    );
    const gatewaySession
      = await services.customSsoSession.completeGatewayLogin({
        client: getGatewayClientContext("gateway"),
        code: gatewayGrant,
        redirectUrl: gatewayRedirectUrl,
      });

    currentIndependentRuntimeClient = {
      ...independentRuntimeClient,
      status: ClientStatus.Enable,
      customSsoEnabled: true,
      customSsoConfigVersion: 8,
    };
    currentGatewayRuntimeClient = {
      ...createGatewayRuntimeClient("gateway"),
      status: ClientStatus.Enable,
      customSsoEnabled: true,
      customSsoConfigVersion: 8,
    };

    await expect(
      services.resolveAuthenticationContext(
        gatewaySession.token,
        "gateway",
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.resolveAuthenticationContext(
        independentCredential.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: {
          ...independentClient,
          configVersion: 8,
        },
        code: independentGrant,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
  });

  test("maps a disabled PrincipalSession to SESSION_INVALID", async () => {
    const services = createServices({
      validatePrincipal: async () => ({ ok: false, reason: "user_disabled" }),
    });
    const token = await createPrincipalToken(services.customSsoSession);

    await expect(
      services.resolveAuthenticationContext(token),
    ).rejects.toBeInstanceOf(SubjectAccessDisabledError);
  });

  test("propagates uncertain PrincipalSession access for the HTTP 503 mapper", async () => {
    const unavailable = new SubjectAccessUnavailableError();
    const services = createServices({
      validatePrincipal: async () => {
        throw unavailable;
      },
    });
    const token = await createPrincipalToken(services.customSsoSession);

    await expect(
      services.resolveAuthenticationContext(token),
    ).rejects.toBe(unavailable);
  });

  test("maps a disabled subject when resolving a valid local Credential", async () => {
    let disabled = false;
    const services = createServices({
      validatePrincipal: async () => disabled
        ? { ok: false, reason: "user_disabled" }
        : { ok: true },
    });
    const credential = await redeemIndependentCredential(services);
    disabled = true;

    await expect(
      services.resolveAuthenticationContext(
        credential.credential,
        client.clientCode,
      ),
    ).rejects.toBeInstanceOf(SubjectAccessDisabledError);
  });

  test("resolves Principal Session context through the Barrier without a legacy account lookup", async () => {
    const services = createServices();
    const token = await createPrincipalToken(services.customSsoSession);
    services.userService.getActiveUserBySubjectIdentifier.mockClear();
    services.userService.getUserDetailById.mockClear();

    await expect(
      services.resolveAuthenticationContext(token),
    ).resolves.toEqual({
      authenticatedClientCode: "iam",
      subjectIdentifier,
    });
    expect(services.userService.getActiveUserBySubjectIdentifier)
      .not
      .toHaveBeenCalled();
    expect(services.userService.getUserDetailById).not.toHaveBeenCalled();
  });

  test("preserves stale subject validation when consuming an authorization artifact", async () => {
    let stale = false;
    const services = createServices({
      validatePrincipal: async () => stale
        ? { ok: false, reason: "session_generation_stale" }
        : { ok: true },
    });
    const { code } = await issueAuthorizationCode(services);
    stale = true;

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).rejects.toBeInstanceOf(SubjectAccessDisabledError);
  });

  test("preserves disabled validation when logout resolves either principal or credential", async () => {
    let principalDisabled = false;
    const principalServices = createServices({
      validatePrincipal: async () => principalDisabled
        ? { ok: false, reason: "user_disabled" }
        : { ok: true },
    });
    const principalToken = await createPrincipalToken(
      principalServices.customSsoSession,
    );
    principalDisabled = true;

    await expect(principalServices.customSsoSession.logout(principalToken))
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);

    let credentialDisabled = false;
    const credentialServices = createServices({
      validatePrincipal: async () => credentialDisabled
        ? { ok: false, reason: "user_disabled" }
        : { ok: true },
    });
    const credential = await redeemIndependentCredential(credentialServices);
    credentialDisabled = true;
    await expect(
      credentialServices.customSsoSession.logout(credential.credential),
    )
      .rejects
      .toBeInstanceOf(SubjectAccessDisabledError);
  });

  test("issueAuthorizationCode reports an unauthenticated PrincipalSession", async () => {
    const services = createServices();

    await expect(services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      configVersion: independentClient.configVersion,
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/callback",
      tokenSource: "none",
    })).resolves.toEqual({ isLogin: false, code: null });
  });

  test("inspects a Principal Session without issuing a protocol artifact", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(
      services.customSsoSession,
    );

    await expect(
      services.customSsoSession.inspectPrincipalSession(principalToken),
    ).resolves.toBe("valid");
    await expect(
      services.customSsoSession.inspectPrincipalSession(undefined),
    ).resolves.toBe("absent");
    await expect(
      services.customSsoSession.inspectPrincipalSession("unknown-token"),
    ).resolves.toBe("invalid");
    expect(fakeRedis.keysStartingWith("sess:v2:active:a:")).toHaveLength(0);
  });

  test("issues a strict V1 authorization grant and initializes its redemption record", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.customSsoSession);

    const authorization = await services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      configVersion: 7,
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/callback",
      state: "opaque state with spaces",
      token: principalToken,
      tokenSource: "cookie",
    });
    if (!authorization.code) {
      throw new Error("expected auth code");
    }

    const artifact = await services.kernel.resolveProtocolArtifact(authorization.code);
    expect(artifact).toMatchObject({
      status: "resolved",
      value: {
        clientCode: client.clientCode,
        metadata: {
          version: 2,
          subjectIdentifier,
          clientCode: client.clientCode,
          mode: CustomSsoClientMode.Independent,
          redirectUri: "https://app.example.com/callback",
          state: "opaque state with spaces",
          configVersion: 7,
        },
      },
    });
    expect(JSON.stringify(artifact)).not.toContain("userInfo");
    expect(JSON.stringify(artifact)).not.toContain("userDetail");
    expect(JSON.stringify(artifact)).not.toContain("projection");
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("opaque state with spaces");

    if (artifact.status !== "resolved") {
      throw new Error("expected authorization artifact");
    }
    await expect(
      services.authorizationGrantRedemption.begin(artifact.value.artifactId),
    ).resolves.toMatchObject({
      status: "reserved",
      reservation: {
        grantId: artifact.value.artifactId,
        expiresAt: artifact.value.expiresAt,
      },
    });
  });

  test("revokes a newly issued authorization artifact when the client changes during issuance", async () => {
    let runtimeReadCount = 0;
    const revokeArtifact = mock(async (
      _artifactId: string,
      _reason?: string,
    ) => undefined);
    const services = createServices({
      findRuntimeClient: async (clientCode) => {
        if (clientCode !== independentRuntimeClient.clientCode)
          return null;
        runtimeReadCount += 1;
        return runtimeReadCount === 1
          ? independentRuntimeClient
          : {
              ...independentRuntimeClient,
              customSsoConfigVersion:
                independentRuntimeClient.customSsoConfigVersion + 1,
            };
      },
      decorateKernel: kernel => ({
        ...kernel,
        async revokeArtifact(artifactId, reason) {
          await revokeArtifact(artifactId, reason);
          return await kernel.revokeArtifact(artifactId, reason);
        },
      }),
    });
    const principalToken = await createPrincipalToken(
      services.customSsoSession,
    );

    await expect(
      services.customSsoSession.issueAuthorizationCode({
        clientCode: independentClient.clientCode,
        configVersion: independentClient.configVersion,
        mode: CustomSsoClientMode.Independent,
        redirectUrl: "https://app.example.com/callback",
        token: principalToken,
        tokenSource: "cookie",
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(runtimeReadCount).toBe(2);
    expect(revokeArtifact).toHaveBeenCalledWith(
      expect.any(String),
      "client_config_changed",
    );
  });

  test("revokes the authorization artifact when redemption initialization cannot create its record", async () => {
    let grantId: string | undefined;
    const initialize = mock(async (input: { grantId: string }) => {
      grantId = input.grantId;
      return "exists" as const;
    });
    const services = createServices({
      authorizationGrantRedemption: defaultRedemption => ({
        ...defaultRedemption,
        initialize,
      }),
    });
    const principalToken = await createPrincipalToken(services.customSsoSession);

    await expect(services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      configVersion: 7,
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/callback",
      token: principalToken,
      tokenSource: "cookie",
    })).rejects.toThrow("授权码创建失败");

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(grantId).toBeDefined();
    expect(
      await fakeRedis.get(services.kernel.keys.active("artifact", grantId!)),
    ).toBeNull();
  });

  test("redeems an Independent grant into a minimal credential and a client-scoped V2 projection", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);

    const result = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
      requestContext: requestContext("req-independent-grant-v1"),
    });

    expect(result).toEqual({
      credential: expect.stringContaining("iam_ls_"),
      ttl: expect.any(Number),
      subject: {
        version: 2,
        subjectIdentifier,
      },
    });
    expect(services.subjectProjection.resolve).toHaveBeenCalledWith({
      subjectIdentifier,
      clientCode: independentClient.clientCode,
      selection: {
        catalogVersion: 2,
        optionalClaims: [],
      },
    });

    const credential = await services.kernel.resolveCredential(result.credential);
    expect(credential).toMatchObject({
      status: "resolved",
      value: {
        clientCode: independentClient.clientCode,
        metadata: {
          mode: CustomSsoClientMode.Independent,
          configVersion: independentClient.configVersion,
        },
      },
    });
    expect(JSON.stringify(credential)).not.toContain("payloadRef");
    expect(JSON.stringify(credential)).not.toContain("userDetail");
    expect(JSON.stringify(credential)).not.toContain("projection");
    expect(JSON.stringify(credential)).not.toContain("responsibilities");
    expect(fakeRedis.payloadKeys()).toHaveLength(0);

    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).resolves.toEqual({
      authenticatedClientCode: independentClient.clientCode,
      subjectIdentifier,
    });

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).rejects.toBeInstanceOf(InvalidAuthCodeError);
  });

  test("keeps an invariant-failed Independent grant leased without starting Credential side effects", async () => {
    const projectedSubjectIdentifier = "00000000-0000-4000-8000-000000001002";
    let returnMismatchedSubject = true;
    let credentialIssueAttempts = 0;
    const services = createServices({
      grantLeaseDurationMs: 60,
      resolveSubjectProjection: async () => ({
        subjectIdentifier: returnMismatchedSubject
          ? projectedSubjectIdentifier
          : subjectIdentifier,
      }),
      decorateKernel: kernel => ({
        ...kernel,
        async issueCredential(input) {
          credentialIssueAttempts += 1;
          return await kernel.issueCredential(input);
        },
      }),
    });
    const { code } = await issueAuthorizationCode(services);
    const auditCountBeforeRedemption = auditLogs.length;
    const input = {
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    };

    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).rejects.toEqual(
      new CustomSsoSubjectProjectionInvariantError("subject_mismatch"),
    );
    expect(credentialIssueAttempts).toBe(0);
    expect(auditLogs).toHaveLength(auditCountBeforeRedemption);
    await expect(services.kernel.resolveProtocolArtifact(code)).resolves.toMatchObject({
      status: "resolved",
    });
    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);

    returnMismatchedSubject = false;
    fakeRedis.advance(61);
    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).resolves.toMatchObject({
      credential: expect.stringContaining("iam_ls_"),
      subject: { version: 2, subjectIdentifier },
    });
    expect(credentialIssueAttempts).toBe(1);
  });

  test("rejects an invalid Independent Wire before starting Credential side effects", async () => {
    let credentialIssueAttempts = 0;
    const services = createServices({
      resolveSubjectProjection: async () => ({
        subjectIdentifier,
        username: 42,
      } as never),
      decorateKernel: kernel => ({
        ...kernel,
        async issueCredential(input) {
          credentialIssueAttempts += 1;
          return await kernel.issueCredential(input);
        },
      }),
    });
    const { code } = await issueAuthorizationCode(services);
    const auditCountBeforeRedemption = auditLogs.length;

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: {
        ...independentClient,
        subjectClaims: [
          SubjectClaim.SubjectIdentifier,
          SubjectClaim.ProfileUsername,
        ],
      },
      code,
      redirectUri: "https://app.example.com/callback",
    })).rejects.toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );

    expect(credentialIssueAttempts).toBe(0);
    expect(auditLogs).toHaveLength(auditCountBeforeRedemption);
    await expect(services.kernel.resolveProtocolArtifact(code)).resolves.toMatchObject({
      status: "resolved",
    });
  });

  test.each([
    ["projection not ready", new SubjectProjectionNotReadyError()],
    ["Subject Access unavailable", new SubjectAccessUnavailableError()],
    ["another typed retryable 503", Object.assign(
      new Error("typed retryable dependency"),
      { retryability: RETRYABLE_SERVICE_UNAVAILABLE },
    )],
  ])("releases the same grant attempt after retryable %s", async (_label, retryableError) => {
    let projectionAttempts = 0;
    const services = createServices({
      resolveSubjectProjection: async ({ subjectIdentifier: inputSubjectIdentifier }) => {
        projectionAttempts += 1;
        if (projectionAttempts === 1)
          throw retryableError;
        return { subjectIdentifier: inputSubjectIdentifier };
      },
    });
    const { code } = await issueAuthorizationCode(services);
    const input = {
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    };

    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).rejects.toBe(retryableError);
    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).resolves.toMatchObject({
      credential: expect.stringContaining("iam_ls_"),
      subject: { version: 2, subjectIdentifier },
    });
    expect(projectionAttempts).toBe(2);
  });

  test("keeps retryable 503 semantics after projection crosses the original lease window", async () => {
    const retryableError = new SubjectProjectionNotReadyError();
    let projectionAttempts = 0;
    const manualScheduler = createManualAuthorizationGrantRedemptionScheduler();
    const services = createServices({
      grantLeaseDurationMs: 60,
      grantScheduler: manualScheduler.scheduler,
      resolveSubjectProjection: async ({ subjectIdentifier: inputSubjectIdentifier }) => {
        projectionAttempts += 1;
        if (projectionAttempts === 1) {
          fakeRedis.advance(35);
          await expect(manualScheduler.advanceToNextHeartbeat()).resolves.toBe(20);
          fakeRedis.advance(35);
          await expect(manualScheduler.advanceToNextHeartbeat()).resolves.toBe(20);
          fakeRedis.advance(25);
          throw retryableError;
        }
        return { subjectIdentifier: inputSubjectIdentifier };
      },
    });
    const { code } = await issueAuthorizationCode(services);
    const input = {
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    };

    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).rejects.toBe(retryableError);
    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).resolves.toMatchObject({
      credential: expect.stringContaining("iam_ls_"),
    });
  });

  test("consumes a successful Independent grant after projection crosses one lease window", async () => {
    const manualScheduler = createManualAuthorizationGrantRedemptionScheduler();
    const services = createServices({
      grantLeaseDurationMs: 60,
      grantScheduler: manualScheduler.scheduler,
      resolveSubjectProjection: async ({ subjectIdentifier: inputSubjectIdentifier }) => {
        fakeRedis.advance(35);
        await expect(manualScheduler.advanceToNextHeartbeat()).resolves.toBe(20);
        fakeRedis.advance(35);
        await expect(manualScheduler.advanceToNextHeartbeat()).resolves.toBe(20);
        fakeRedis.advance(25);
        return { subjectIdentifier: inputSubjectIdentifier };
      },
    });
    const { code } = await issueAuthorizationCode(services);

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).resolves.toMatchObject({
      credential: expect.stringContaining("iam_ls_"),
    });
  });

  test.each([
    ["unauthorized failure", new AuthzUnauthorizedError("未登录")],
    ["unexpected bug", new Error("projection bug")],
  ])("does not release a grant attempt after a non-retryable %s", async (
    _label,
    nonRetryableError,
  ) => {
    let projectionAttempts = 0;
    const services = createServices({
      resolveSubjectProjection: async () => {
        projectionAttempts += 1;
        throw nonRetryableError;
      },
    });
    const { code } = await issueAuthorizationCode(services);
    const input = {
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    };

    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).rejects.toBe(nonRetryableError);
    await expect(
      services.customSsoSession.redeemIndependentGrant(input),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
    expect(projectionAttempts).toBe(1);
  });

  test.each([
    ["redirect URI", {
      client: independentClient,
      redirectUri: "https://app.example.com/different",
    }],
    ["config version", {
      client: { ...independentClient, configVersion: 8 },
      redirectUri: "https://app.example.com/callback",
    }],
  ])("rejects a mismatched %s before reserving the grant", async (_label, mismatch) => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);

    await expect(services.customSsoSession.redeemIndependentGrant({
      ...mismatch,
      code,
    })).rejects.toBeInstanceOf(InvalidAuthCodeError);
    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).resolves.toMatchObject({
      credential: expect.stringContaining("iam_ls_"),
    });
  });

  test("revokes a newly issued Credential when Grant consumption loses its fence", async () => {
    let issuedCredentialToken: string | undefined;
    const services = createServices({
      authorizationGrantRedemption: (defaultRedemption) => {
        const consume = mock(async () => "stale-attempt" as const);
        return {
          ...defaultRedemption,
          consume,
          withLease: async (_reservation, operation) => await operation({
            consume,
            release: async () => "stale-attempt" as const,
          }),
        };
      },
      decorateKernel: kernel => ({
        ...kernel,
        async issueCredential(input) {
          const issued = await kernel.issueCredential(input);
          issuedCredentialToken = issued.status === "created"
            ? issued.externalToken
            : undefined;
          return issued;
        },
      }),
    });
    const { code } = await issueAuthorizationCode(services);

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).rejects.toBeInstanceOf(InvalidAuthCodeError);

    expect(fakeRedis.keysStartingWith("sess:v2:active:c:")).toHaveLength(0);
    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    expect(issuedCredentialToken).toBeDefined();
    await expect(
      services.kernel.resolveCredential(issuedCredentialToken!),
    ).resolves.toMatchObject({ status: "revoked" });
  });

  test("never returns a sid when consume and Credential compensation throw", async () => {
    let issuedCredentialToken: string | undefined;
    const consumeFailure = new Error("consume dependency failed");
    const release = mock(async () => "released" as const);
    const services = createServices({
      authorizationGrantRedemption: (defaultRedemption) => {
        const consume = mock(async () => {
          throw consumeFailure;
        });
        return {
          ...defaultRedemption,
          consume,
          withLease: async (_reservation, operation) => await operation({
            consume,
            release,
          }),
        };
      },
      decorateKernel: kernel => ({
        ...kernel,
        async issueCredential(input) {
          const issued = await kernel.issueCredential(input);
          issuedCredentialToken = issued.status === "created"
            ? issued.externalToken
            : undefined;
          return issued;
        },
        async revokeCredential() {
          throw new Error("credential revoke failed");
        },
      }),
    });
    const { code } = await issueAuthorizationCode(services, {
      state: "unique-state-compensation-sentinel",
    });

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    })).rejects.toBe(consumeFailure);

    expect(issuedCredentialToken).toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: independentClient.clientCode,
      operation: "independent_credential_compensation",
      outcome: "revoke_failed",
    }), "custom sso credential compensation failed closed");
    expect(release).not.toHaveBeenCalled();
    const observableOutput = JSON.stringify(logger.warn.mock.calls);
    expect(observableOutput).not.toContain(issuedCredentialToken!);
    expect(observableOutput).not.toContain(code);
    expect(observableOutput).not.toContain("unique-state-compensation-sentinel");
  });

  test.each([
    ["config version changes", { customSsoConfigVersion: 8 }],
    ["client is disabled", { status: ClientStatus.Disable }],
    ["Custom SSO is disabled", { customSsoEnabled: false }],
  ] as const)("fails closed whenever an Independent credential's %s", async (
    _label,
    runtimeOverride,
  ) => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);
    const result = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });
    currentIndependentRuntimeClient = {
      ...independentRuntimeClient,
      ...runtimeOverride,
    };

    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.kernel.resolveCredential(result.credential),
    ).resolves.toMatchObject({ status: "revoked" });
  });

  test("preserves an unavailable Subject Access Barrier when using an Independent credential", async () => {
    let barrierUnavailable = false;
    const unavailable = new SubjectAccessUnavailableError();
    const services = createServices({
      validatePrincipal: async () => {
        if (barrierUnavailable)
          throw unavailable;
        return { ok: true };
      },
    });
    const { code } = await issueAuthorizationCode(services);
    const result = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });
    barrierUnavailable = true;

    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBe(unavailable);
  });

  test("redeemIndependentGrant records narrow Subject-based audit context", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.customSsoSession);
    const authorization = await services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      configVersion: independentClient.configVersion,
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/callback",
      token: principalToken,
      tokenSource: "cookie",
    });
    if (!authorization.code) {
      throw new Error("expected auth code");
    }

    const result = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code: authorization.code,
      redirectUri: "https://app.example.com/callback",
      requestContext: requestContext("req-independent-grant"),
    });

    expect(result).toEqual({
      credential: expect.stringContaining("iam_ls_"),
      ttl: expect.any(Number),
      subject: { version: 2, subjectIdentifier },
    });
    expect(result.ttl).toBeGreaterThan(0);
    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).resolves.toEqual({
      authenticatedClientCode: client.clientCode,
      subjectIdentifier,
    });
    expect(auditLogs).toContainEqual(expect.objectContaining({
      action: "auth.login.local",
      details: expect.objectContaining({
        clientCode: client.clientCode,
        mode: CustomSsoClientMode.Independent,
      }),
      requestId: "req-independent-grant",
      traceId: "11111111111111111111111111111111",
      targetCode: subjectIdentifier,
      targetId: null,
    }));
  });

  test("returns a consumed Independent credential when its success audit after-effect fails", async () => {
    const auditFailure = new Error("unique-audit-failure-sentinel");
    const services = createServices({
      recordAuditLog: async () => {
        throw auditFailure;
      },
    });
    const { code } = await issueAuthorizationCode(services, {
      state: "unique-audit-state-sentinel",
    });

    const result = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
      requestContext: requestContext("req-audit-after-effect"),
    });
    const credentialToken = result.credential;

    expect(typeof credentialToken).toBe("string");
    expect(result).toMatchObject({
      credential: expect.stringContaining("iam_ls_"),
      subject: { version: 2, subjectIdentifier },
    });
    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: independentClient.clientCode,
      operation: "independent_login_audit",
      outcome: "audit_failed",
      requestId: "req-audit-after-effect",
    }), "custom sso independent login audit after-effect failed");
    const observableLog = JSON.stringify(logger.warn.mock.calls);
    expect(observableLog).not.toContain(auditFailure.message);
    expect(observableLog).not.toContain("unique-audit-state-sentinel");
    expect(observableLog).not.toContain(code);
    expect(observableLog).not.toContain(credentialToken);
  });

  test("does not consume a grant or retain a credential when pure projection mapping fails", async () => {
    const services = createServices({
      resolveSubjectProjection: async () => ({
        authorization: {
          employments: null,
          privileges: [],
          roles: [],
        },
        subjectIdentifier,
      } as never),
    });
    const { code } = await issueAuthorizationCode(services);

    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toEqual(
      new CustomSsoSubjectProjectionInvariantError("invalid_wire"),
    );

    expect(fakeRedis.keysStartingWith("sess:v2:active:c:")).toHaveLength(0);
  });

  test("keeps Maintenance out of permanent authorization-version validation", async () => {
    const services = createServices({
      findRuntimeClient: async () => ({
        ...independentRuntimeClient,
        status: ClientStatus.Maintenance,
      }),
    });
    const principalToken = await createPrincipalToken(
      services.customSsoSession,
    );

    await expect(
      services.customSsoSession.issueAuthorizationCode({
        clientCode: independentClient.clientCode,
        configVersion: independentClient.configVersion,
        mode: CustomSsoClientMode.Independent,
        redirectUrl: "https://app.example.com/callback",
        token: principalToken,
        tokenSource: "cookie",
      }),
    ).resolves.toMatchObject({ isLogin: true });
  });

  test("completeGatewayLogin creates an ORCAS-disabled Gateway Local Session without loading a legacy account or User Detail", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
      state: "trusted-gateway-state",
    });
    const gatewayClient = getMockClientByCode("gateway");
    if (gatewayClient === null) {
      throw new Error("expected gateway client");
    }
    liveUserAvailable = false;
    profileAvailable = false;
    services.userService.getActiveUserBySubjectIdentifier.mockClear();
    services.userService.getUserDetailById.mockClear();

    const result = await services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl,
      requestContext: requestContext("req-gateway"),
    });

    expect(result).toEqual({
      orcasSessionId: null,
      state: "trusted-gateway-state",
      token: expect.stringContaining("iam_ls_"),
    });
    await expect(
      services.resolveAuthenticationContext(
        result.token,
        gatewayClient.clientCode,
      ),
    ).resolves.toEqual({
      authenticatedClientCode: gatewayClient.clientCode,
      subjectIdentifier,
    });
    expect(services.orcas.orcasLogin).not.toHaveBeenCalled();
    expect(services.userService.getActiveUserBySubjectIdentifier).not.toHaveBeenCalled();
    expect(services.userService.getUserDetailById).not.toHaveBeenCalled();
    expect(auditLogs).toContainEqual(expect.objectContaining({
      action: "auth.login.local",
      actorUserId: null,
      details: expect.objectContaining({
        clientCode: "gateway",
        mode: CustomSsoClientMode.Gateway,
      }),
      requestId: "req-gateway",
      targetCode: subjectIdentifier,
      targetId: null,
      targetType: "subject",
      traceId: "11111111111111111111111111111111",
    }));
  });

  test("stores a Gateway Local Session as one versioned Credential without a private user payload", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
    });

    const result = await services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl,
    });
    const credential = await services.kernel.resolveCredential(result.token);
    if (credential.status !== "resolved")
      throw new Error("expected resolved Gateway credential");

    expect(credential.value.metadata).toEqual({
      version: 2,
      mode: CustomSsoClientMode.Gateway,
      configVersion: 7,
    });
    expect(credential.value).not.toHaveProperty("bindingId");
    const serializedArtifacts = JSON.stringify({ credential });
    expect(serializedArtifacts).not.toContain("payloadRef");
    expect(serializedArtifacts).not.toContain("userDetail");
    expect(serializedArtifacts).not.toContain("projection");
    expect(serializedArtifacts).not.toContain("responsibilities");
    expect(serializedArtifacts).not.toContain(userDetail.username);
    expect(serializedArtifacts).not.toContain(`"id":${userDetail.id}`);
    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test.each([
    [
      "Custom SSO is disabled",
      (runtime: CustomSsoClientRuntimeDto): CustomSsoClientRuntimeDto => ({
        ...runtime,
        customSsoEnabled: false,
      }),
    ],
    [
      "Custom SSO config is removed",
      (runtime: CustomSsoClientRuntimeDto): CustomSsoClientRuntimeDto => ({
        ...runtime,
        customSsoConfig: null,
      }),
    ],
    [
      "Custom SSO config version changes",
      (runtime: CustomSsoClientRuntimeDto): CustomSsoClientRuntimeDto => ({
        ...runtime,
        customSsoConfigVersion: runtime.customSsoConfigVersion + 1,
      }),
    ],
  ] as const)(
    "fails closed and revokes a Gateway Local Session when %s",
    async (_reason, mutateRuntime) => {
      const services = createServices();
      const redirectUrl = "https://gateway.example.com/callback";
      const { code } = await issueAuthorizationCode(services, {
        clientCode: "gateway",
        redirectUrl,
      });
      const result = await services.customSsoSession.completeGatewayLogin({
        client: getGatewayClientContext("gateway"),
        code,
        redirectUrl,
      });
      currentGatewayRuntimeClient = mutateRuntime(currentGatewayRuntimeClient);

      await expect(
        services.resolveAuthenticationContext(
          result.token,
          "gateway",
        ),
      ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
      await expect(
        services.resolveAuthenticationContext(
          result.token,
          "gateway",
        ),
      ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    },
  );

  test("does not revoke a Gateway Local Session solely because the client is in Maintenance", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
    });
    const result = await services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl,
    });
    currentGatewayRuntimeClient = {
      ...currentGatewayRuntimeClient,
      status: ClientStatus.Maintenance,
    };

    await expect(
      services.resolveAuthenticationContext(result.token, "gateway"),
    ).resolves.toMatchObject({
      authenticatedClientCode: "gateway",
      subjectIdentifier,
    });
    await expect(
      services.kernel.resolveCredential(result.token),
    ).resolves.toMatchObject({ status: "resolved" });
  });

  test("resolves a Gateway Local Session without loading a legacy account or User Detail", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
    });
    const result = await services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl,
    });
    services.userService.getActiveUserBySubjectIdentifier.mockClear();
    services.userService.getUserDetailById.mockClear();

    await expect(
      services.resolveAuthenticationContext(
        result.token,
        "gateway",
      ),
    ).resolves.toEqual({
      authenticatedClientCode: "gateway",
      subjectIdentifier,
    });
    expect(services.userService.getActiveUserBySubjectIdentifier).not.toHaveBeenCalled();
    expect(services.userService.getUserDetailById).not.toHaveBeenCalled();
  });

  test("captures the local artifact version only inside the public delivery capability", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
    });
    const result = await services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl,
    });

    const resolved
      = await services.customSsoSession.resolvePublicAuthentication(
        result.token,
        "gateway",
      );

    expect(resolved.authenticationContext).toEqual({
      authenticatedClientCode: "gateway",
      subjectIdentifier,
    });
    expect(Object.keys(resolved.subjectDeliveryCapability)).toEqual([
      "resolveUserInfo",
    ]);
    expect(JSON.stringify(resolved)).not.toContain(
      "customSsoConfigVersion",
    );
    expect(services.subjectDelivery.createUserInfoCapability)
      .toHaveBeenCalledWith({
        authenticatedClientCode: "gateway",
        expectedConfigVersion: 7,
        subjectIdentifier,
      });
  });

  test("completeGatewayLogin has one atomic winner for concurrent valid callbacks", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
      state: "concurrent-gateway-state",
    });
    const gatewayClient = getMockClientByCode("gateway");
    if (gatewayClient === null)
      throw new Error("expected gateway client");

    const completions = await Promise.allSettled([
      services.customSsoSession.completeGatewayLogin({
        client: getGatewayClientContext("gateway"),
        code,
        redirectUrl,
      }),
      services.customSsoSession.completeGatewayLogin({
        client: getGatewayClientContext("gateway"),
        code,
        redirectUrl,
      }),
    ]);

    const fulfilled = completions.filter(
      result => result.status === "fulfilled",
    );
    const rejected = completions.filter(
      result => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]).toMatchObject({
      value: {
        state: "concurrent-gateway-state",
        token: expect.stringContaining("iam_ls_"),
      },
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.any(AuthzUnauthorizedError),
    });
  });

  test("logs legacy PrincipalSession bearer sources without leaking bearer values", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.customSsoSession);

    await services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      configVersion: independentClient.configVersion,
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/callback",
      requestContext: requestContext("req-authz-header"),
      token: principalToken,
      tokenSource: "authorization_header",
    });
    await services.customSsoSession.issueAuthorizationCode({
      clientCode: client.clientCode,
      configVersion: independentClient.configVersion,
      mode: CustomSsoClientMode.Independent,
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
    await expect(services.resolveAuthenticationContext(oa.token)).resolves.toEqual({
      authenticatedClientCode: "iam",
      subjectIdentifier,
    });

    const wx = await services.sso.loginWithWechat.execute({ code: "wx-code" });
    expect(wx).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
    const wxRetry = await services.sso.loginWithWechat.execute({ code: "wx-code" });
    expect(wxRetry).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
  });

  test("redeems an Independent grant once without a private payload", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);

    const result = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
      requestContext: requestContext("req-local-session"),
    });

    expect(result.credential).toContain("iam_ls_");
    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test("rejects an Independent grant bound to another client", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);

    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: { ...independentClient, clientCode: "other-client" },
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).resolves.toMatchObject({ credential: expect.stringContaining("iam_ls_") });
  });

  test("rejects an Independent grant when Subject Access is disabled", async () => {
    let disabled = false;
    const services = createServices({
      validatePrincipal: async () => disabled
        ? { ok: false, reason: "user_disabled" }
        : { ok: true },
    });
    const { code } = await issueAuthorizationCode(services);
    disabled = true;

    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(SubjectAccessDisabledError);

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
      client: getGatewayClientContext("gateway-orcas"),
      code,
      redirectUrl: "https://gateway.example.com/different",
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    await expect(services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway-orcas"),
      code,
      redirectUrl: issuedRedirectUrl,
    })).resolves.toMatchObject({
      token: expect.stringContaining("iam_ls_"),
    });
  });

  test("binds a Gateway authorization code to the current Custom SSO config version", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      configVersion: 7,
      redirectUrl,
    });

    await expect(services.customSsoSession.completeGatewayLogin({
      client: {
        ...getGatewayClientContext("gateway"),
        configVersion: 8,
      },
      code,
      redirectUrl,
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    await expect(services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl,
    })).resolves.toMatchObject({
      token: expect.stringContaining("iam_ls_"),
    });
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
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test("does not depend on the legacy private payload store when issuing an Independent credential", async () => {
    const services = createServices();
    const { code } = await issueAuthorizationCode(services);
    fakeRedis.failNextPayloadWrite = true;

    await expect(services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
      requestContext: requestContext("req-payload-failure"),
    })).resolves.toMatchObject({
      credential: expect.stringContaining("iam_ls_"),
    });

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      "failed to write custom sso local session payload",
    );
  });

  test("releases a Gateway grant when ORCAS login fails so the callback can retry", async () => {
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
        client: getGatewayClientContext("gateway-orcas"),
        code,
        redirectUrl,
      }),
    ).rejects.toThrow("orcas failed");

    orcasShouldFail = false;
    await expect(
      services.customSsoSession.completeGatewayLogin({
        client: getGatewayClientContext("gateway-orcas"),
        code,
        redirectUrl,
      }),
    ).resolves.toMatchObject({
      orcasSessionId: "orcas-session",
      token: expect.stringContaining("iam_ls_"),
    });
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
        revoked: 1,
      },
    });
  });

  test("does not depend on the legacy private payload store when issuing a Gateway Local Session", async () => {
    const services = createServices();
    const redirectUrl = "https://gateway.example.com/callback";
    const { code } = await issueAuthorizationCode(services, {
      clientCode: "gateway",
      redirectUrl,
    });
    fakeRedis.failNextPayloadWrite = true;

    await expect(
      services.customSsoSession.completeGatewayLogin({
        client: getGatewayClientContext("gateway"),
        code,
        redirectUrl,
        requestContext: requestContext("req-gateway-payload-failure"),
      }),
    ).resolves.toMatchObject({
      orcasSessionId: null,
      token: expect.stringContaining("iam_ls_"),
    });

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      "failed to write custom sso local session payload",
    );
  });

  test("completeGatewayLogin binds ORCAS without restoring a wide audit target", async () => {
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
      client: getGatewayClientContext("gateway-orcas"),
      code,
      redirectUrl,
    });
    const sessionContext = await services.resolveAuthenticationContext(
      result.token,
      gatewayClient.clientCode,
    );

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
      authenticatedClientCode: gatewayClient.clientCode,
      orcasId: "orcas",
      subjectIdentifier,
    });
    expect(auditLogs).toContainEqual(expect.objectContaining({
      action: "auth.login.local",
      actorUserId: null,
      details: expect.objectContaining({
        clientCode: "gateway-orcas",
        mode: CustomSsoClientMode.Gateway,
      }),
      targetCode: subjectIdentifier,
      targetId: null,
      targetType: "subject",
    }));
    expect(JSON.stringify(auditLogs)).not.toContain("managementLevel");
  });

  test("stores and resolves the ORCAS identity only from strict Gateway credential metadata", async () => {
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
      client: getGatewayClientContext("gateway-orcas"),
      code,
      redirectUrl,
    });
    const credential = await services.kernel.resolveCredential(result.token);
    if (credential.status !== "resolved")
      throw new Error("expected resolved Gateway credential");

    const sessionContext = await services.resolveAuthenticationContext(
      result.token,
      gatewayClient.clientCode,
    );

    expect(credential.value.metadata).toEqual({
      version: 2,
      mode: CustomSsoClientMode.Gateway,
      configVersion: 7,
      orcasId: "orcas",
    });
    expect(sessionContext).toEqual({
      authenticatedClientCode: gatewayClient.clientCode,
      orcasId: "orcas",
      subjectIdentifier,
    });
    expect(fakeRedis.payloadKeys()).toHaveLength(0);
  });

  test("IAM validates Independent Client Credentials without a wide user context", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);

    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).resolves.toEqual({
      authenticatedClientCode: independentClient.clientCode,
      subjectIdentifier,
    });
    currentIndependentRuntimeClient = {
      ...independentRuntimeClient,
      status: ClientStatus.Maintenance,
    };
    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).resolves.toEqual({
      authenticatedClientCode: independentClient.clientCode,
      subjectIdentifier,
    });
  });

  test("Maintenance does not extend an Independent Credential's original TTL", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);
    currentIndependentRuntimeClient = {
      ...independentRuntimeClient,
      status: ClientStatus.Maintenance,
    };

    fakeRedis.advance(3_600_001);
    currentIndependentRuntimeClient = independentRuntimeClient;

    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test("rejects an Independent credential at Gateway authz without revoking it", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);

    await expect(
      services.customSsoSession.authorizeLocalSession(
        result.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        independentClient.clientCode,
      ),
    ).resolves.toEqual({
      authenticatedClientCode: independentClient.clientCode,
      subjectIdentifier,
    });
  });

  test("IAM revokes an Independent Client Credential through logout", async () => {
    const services = createServices();
    const { principalToken, code } = await issueAuthorizationCode(services);
    const credential = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });

    await services.customSsoSession.logout(credential.credential);

    await expect(
      services.resolveAuthenticationContext(principalToken),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.resolveAuthenticationContext(
        credential.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test.each([
    ["config version changes", { customSsoConfigVersion: 8 }],
    ["client is disabled", { status: ClientStatus.Disable }],
    ["Custom SSO is disabled", { customSsoEnabled: false }],
    ["Custom SSO config is removed", { customSsoConfig: null }],
  ] as const)("rejects an Independent Credential logout when its live Client %s without revoking the parent Principal Session", async (
    _label,
    runtimeOverride,
  ) => {
    const services = createServices();
    const { principalToken, code } = await issueAuthorizationCode(services);
    const credential = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });
    currentIndependentRuntimeClient = {
      ...independentRuntimeClient,
      ...runtimeOverride,
    };

    await expect(
      services.customSsoSession.logout(credential.credential),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.resolveAuthenticationContext(principalToken),
    ).resolves.toEqual({
      authenticatedClientCode: "iam",
      subjectIdentifier,
    });
  });

  test("keeps the parent Principal Session when credential logout cannot confirm current Client state", async () => {
    let clientRuntimeUnavailable = false;
    const services = createServices({
      findRuntimeClient: async (clientCode) => {
        if (clientRuntimeUnavailable)
          throw new CustomSsoClientRuntimeUnavailableError();
        return clientCode === currentIndependentRuntimeClient.clientCode
          ? currentIndependentRuntimeClient
          : null;
      },
    });
    const { principalToken, code } = await issueAuthorizationCode(services);
    const credential = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });
    clientRuntimeUnavailable = true;

    await expect(
      services.customSsoSession.logout(credential.credential),
    ).rejects.toBeInstanceOf(CustomSsoClientRuntimeUnavailableError);
    await expect(
      services.resolveAuthenticationContext(principalToken),
    ).resolves.toEqual({
      authenticatedClientCode: "iam",
      subjectIdentifier,
    });
  });

  test("Independent credential resolution rejects client mismatch and an invalid PrincipalSession", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);

    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        "other-client",
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const second = await redeemIndependentCredential(services);
    const credential = await services.kernel.resolveCredential(second.credential);
    if (credential.status !== "resolved") {
      throw new Error("expected credential");
    }
    await fakeRedis.del(
      services.kernel.keys.active(
        "principal_session",
        credential.value.principalSessionId,
      ),
    );
    await expect(
      services.resolveAuthenticationContext(
        second.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test("Independent logout has no private payload or IAM-owned client notification", async () => {
    const services = createServices();
    const { principalToken, code } = await issueAuthorizationCode(services);
    const credential = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });
    await expect(services.customSsoSession.logout(principalToken)).resolves.toMatchObject({
      principalSessions: { revoked: 1 },
      credentials: { revoked: 1 },
    });

    expect(fakeRedis.payloadKeys()).toHaveLength(0);
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      "independent client logout endpoint failed",
    );
    currentIndependentRuntimeClient = {
      ...independentRuntimeClient,
      status: ClientStatus.Maintenance,
    };
    await expect(
      services.resolveAuthenticationContext(
        credential.credential,
        independentClient.clientCode,
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });
});
