import type { ClientTrafficGateResult } from "@iam/api-core/client-traffic-gate";
import type { CustomSsoSessionKernelAdapterDeps } from "@iam/custom-sso/testing";

import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { SessionKernel } from "@iam/session-kernel";
import { randomUUID } from "node:crypto";
import { createAuthenticationUseCases } from "@api/composition/use-cases/authentication";
import { createPrincipalSessionAdapter } from "@api/services/authentication/principal-session.adapter";
import {
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import {
  createSubjectAccessOperations,
  createSubjectAccessSessionRevocation,
  encodeSubjectAccessContext,
  parseSubjectAccessContext,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";

import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { bindCustomSsoOperationKernel, createAuthorizeSsoUseCase, createCustomSsoApplication, createCustomSsoSessionKernelAdapter } from "@iam/custom-sso/testing";

import { CustomSsoSubjectProjectionInvariantError } from "@iam/custom-sso/wire";
import { createSessionKernelForTesting } from "@iam/session-kernel/testing";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { sm3 } from "sm-crypto";

type RedisResult = [Error | null, unknown];
type RedisOperation = () => unknown | Promise<unknown>;

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly zsets = new Map<string, Array<{ member: string; score: number }>>();
  private readonly expires = new Map<string, number>();
  private timestamp = 1_700_000_000_000;

  reset() {
    this.values.clear();
    this.zsets.clear();
    this.expires.clear();
    this.timestamp = 1_700_000_000_000;
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

  async set(key: string, value: string, mode?: string, ttl?: number) {
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
  traffic?: () => Promise<ClientTrafficGateResult>;
  applicationClock?: { now: () => number };
  authCodeExpireSeconds?: number;
  localSessionTtlSeconds?: number;
  principalTtlMs?: number;

  captureSubjectAccessTransitionId?: () => string | Promise<string>;
  decorateAuthenticationKernel?: (kernel: SessionKernel) => SessionKernel;
  decorateKernel?: (
    kernel: SessionKernel,
  ) => SessionKernel;
  getActiveUserBySubjectIdentifier?: (
    subjectIdentifier: string,
  ) => Promise<(typeof userDetail & { subjectIdentifier: string }) | null>;
  findRuntimeClient?: (
    clientCode: string,
  ) => Promise<CustomSsoClientRuntimeDto | null>;
  grantAttemptId?: string;
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
    config: {
      namespace: "sess:v2:",
      principalIdleTtlMs: options.principalTtlMs ?? 3_600_000,
      principalAbsoluteTtlMs: options.principalTtlMs ?? 3_600_000,
      tombstoneTtlMs: 86_400_000,
      tombstoneGraceMs: 300_000,
      clock: options.applicationClock ?? { now: () => fakeRedis.now() },
    },
    logger,
  }, { now: () => fakeRedis.now() });
  const authenticationKernel = kernel;
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
      return { orcasId: "orcas", orcasSessionId: "orcas-session" };
    }),
  };

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
  const accessChecks = mock(async () => await (options.captureSubjectAccessTransitionId?.()
    ?? "20000000-0000-4000-8000-000000000001"));
  const authenticationAdapterKernel
    = options.decorateAuthenticationKernel?.(authenticationKernel) ?? authenticationKernel;
  const principalSessionCreations = mock(authenticationAdapterKernel.createPrincipalSession);
  const principalSessions = createPrincipalSessionAdapter(
    { createPrincipalSession: principalSessionCreations },
    createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: accessChecks },
      revocation: createSubjectAccessSessionRevocation(authenticationKernel),
    }),
  );
  const sessionDeps: CustomSsoSessionKernelAdapterDeps = {
    access: { users: { findOrcasUserBySubjectIdentifier: async () => profileAvailable ? userDetail : null } },
    clients: {
      findRuntimeRecord: options.findRuntimeClient
        ?? (async (clientCode: string) =>
          clientCode === currentIndependentRuntimeClient.clientCode
            ? currentIndependentRuntimeClient
            : clientCode === "iam"
              ? {
                  ...currentIndependentRuntimeClient,
                  clientCode: "iam",
                  clientName: "IAM",
                }
              : clientCode === currentGatewayRuntimeClient.clientCode
                ? currentGatewayRuntimeClient
                : clientCode === currentGatewayOrcasRuntimeClient.clientCode
                  ? currentGatewayOrcasRuntimeClient
                  : null),
    },
    kernel: adapterKernel,
    logger,
    orcas,
    random: { uuid: () => options.grantAttemptId ?? randomUUID() },
    subjectDelivery,
    subjectProjection,
    auditLogWriter,
    config: {
      authCodeExpireSeconds: options.authCodeExpireSeconds ?? 60,
      localSessionTtlSeconds: options.localSessionTtlSeconds ?? 3600,
    },
  } satisfies CustomSsoSessionKernelAdapterDeps;
  const sessionOperations = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId: async () => {
      const verdict = await options.validatePrincipal?.({ principal: { subjectId: subjectIdentifier } });
      if (verdict && !verdict.ok)
        throw new SubjectAccessDisabledError();
      return await (options.captureSubjectAccessTransitionId?.() ?? "20000000-0000-4000-8000-000000000001");
    } },
    revocation: createSubjectAccessSessionRevocation(kernel),
  });
  function operationScoped<T extends object>(factory: (deps: typeof sessionDeps) => T): T {
    const unbound = factory(sessionDeps);
    return new Proxy(unbound, { get(target, key) {
      const value = Reflect.get(target, key);
      if (key === "logout")
        return value;
      const execute = (...args: unknown[]) => sessionOperations.run(async (operation) => {
        const bound = factory({ ...sessionDeps, access: { ...sessionDeps.access, operation }, kernel: bindCustomSsoOperationKernel(adapterKernel, operation) });
        const method = Reflect.get(bound, key);
        if (typeof method === "function")
          return await Reflect.apply(method, undefined, args);
        if (typeof method !== "object" || method === null)
          throw new Error("Expected operation method");
        const handler: unknown = Reflect.get(method, "execute");
        if (typeof handler !== "function")
          throw new Error("Expected execute method");
        return await Reflect.apply(handler, undefined, args);
      });
      return typeof value === "function" ? execute : { execute };
    } });
  }
  const customSsoSession = operationScoped(createCustomSsoSessionKernelAdapter);
  const customSso = operationScoped(scopedDeps => createCustomSsoApplication({
    ...scopedDeps,
    clientSecrets: {
      findSecretRecord: async (clientCode: string) => {
        const runtime = await sessionDeps.clients.findRuntimeRecord(clientCode);
        return runtime === null ? null : { ...runtime, customSsoSecretHash: "test-secret-hash" };
      },
    },
    secrets: { verify: async (secret: string) => secret === "test-secret" },
    traffic: { check: options.traffic ?? (async () => ({ outcome: "enabled" as const })) },
  }));
  const wechat = {
    getWxUserId: mock(async () => "wx-id"),
  };
  const ssoUsers = {
    checkPassword: mock(async () => true),
    getActiveUserByMobile: mock(async () => liveUserAvailable ? { ...userDetail, subjectIdentifier } : null),
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
  const authentication = createAuthenticationUseCases({
    auditLogWriter,
    runtime: {
      clock: { now: () => fakeRedis.now() },
      config: { env: { nodeEnv: "test" }, auth: { magicCode: "MAGIC" } },
      redis: fakeRedis,
      integrations: { wechat },
    },
    services: {
      cap: { ensureActionAllowed: async () => undefined },
      client: clientService,
      humanRisk: { recordLoginFailure: async () => undefined },
      loginRestriction: {
        getRestriction: async () => null,
        clearLoginState: async () => undefined,
        recordFailure: async () => ({ failureCount: 1, remainingAttempts: 4, restriction: null }),
      },
      mobile: { consumeVerificationCode: async () => true },
      principalSessions,
      user: ssoUsers,
    },
  });
  const sso = {
    logout: customSso.logout,
  };

  return {
    authentication,
    principalSessions,
    customSsoSession,
    customSso,
    accessChecks,
    principalSessionCreations,
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

test("complete protocol access operations reject maintenance before resolving credentials", async () => {
  const resolveCredential = mock(async () => {
    throw new Error("credential must not be read");
  });
  const services = createServices({
    traffic: async () => ({ outcome: "maintenance" }),
    decorateKernel: kernel => ({ ...kernel, resolveCredential }),
  });
  for (const operation of [
    () => services.customSso.resolvePublicAuthentication("token", "gateway"),
    () => services.customSso.authorizeLocalSession("token", "gateway"),
  ]) {
    let error: unknown;
    try {
      await operation();
    }
    catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AuthzMaintenanceError);
  }
  expect(resolveCredential).not.toHaveBeenCalled();
});

test("complete Custom SSO operations own validation, continuation, redemption, delivery and logout", async () => {
  const services = createServices();
  const protocol = services.customSso;
  const globalSessionToken = await createPrincipalToken(services.principalSessions);
  const input = { clientCode: client.clientCode, globalSessionToken, redirectUrl: "https://app.example.com/callback" };
  const inspection = await protocol.checkLoginContinuation.execute(input);
  expect(inspection).toBe("valid");
  const grant = await protocol.authorize.execute(
    { ...input, tokenSource: "cookie" },
    { requestContext: requestContext("full-operation") },
  );
  if (!grant.isLogin)
    throw new Error("expected authorization grant");
  let error: unknown;
  try {
    await protocol.exchangeCode.execute({
      clientCode: client.clientCode,
      clientSecret: "wrong",
      code: grant.code,
      redirectUri: input.redirectUrl,
    });
  }
  catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  const credential = await protocol.exchangeCode.execute({
    clientCode: client.clientCode,
    clientSecret: "test-secret",
    code: grant.code,
    redirectUri: input.redirectUrl,
  });
  expect(credential.subject).toEqual({ version: 2, subjectIdentifier });
  const authenticated = await protocol.resolvePublicAuthentication(credential.sid, client.clientCode);
  const userInfo = await authenticated.subjectDeliveryCapability.resolveUserInfo();
  expect(userInfo).toEqual(credential.subject);
  const loggedOut = await protocol.logout.execute({ sessionToken: credential.sid });
  expect(loggedOut).toBe(true);
  const afterLogout = await protocol.checkLoginContinuation.execute(input);
  expect(afterLogout).toBe("invalid");
});

test.each(["gateway", "gateway-orcas"] as const)("complete callback owns %s Local Session and delivery", async (clientCode) => {
  const services = createServices();
  const globalSessionToken = await createPrincipalToken(services.principalSessions);
  const redirectUrl = "https://gateway.example.com/";
  const grant = await services.customSso.authorize.execute({
    clientCode,
    globalSessionToken,
    redirectUrl,
    tokenSource: "cookie",
    state: "opaque-state",
  });
  if (!grant.isLogin)
    throw new Error("expected authorization grant");
  const session = await services.customSso.completeCallback.execute({ clientCode, code: grant.code, redirectUrl });
  expect(session.state).toBe("opaque-state");
  expect(session.orcasSessionId).toBe(clientCode === "gateway-orcas" ? "orcas-session" : null);
  expect(services.orcas.orcasLogin).toHaveBeenCalledTimes(clientCode === "gateway-orcas" ? 1 : 0);
  const header = await services.customSso.authorizeLocalSession(session.token, clientCode);
  expect(JSON.parse(Buffer.from(header, "base64").toString("utf8"))).toEqual({ version: 1, subjectIdentifier });
  await services.customSso.logout.execute({ sessionToken: session.token });
  const inspection = await services.customSso.checkLoginContinuation.execute({ clientCode, globalSessionToken, redirectUrl });
  expect(inspection).toBe("invalid");
});

async function createPrincipalToken(principalSessions: ReturnType<typeof createServices>["principalSessions"]) {
  return (await principalSessions.createPrincipalSession(subjectIdentifier, { amr: ["pwd"] })).token;
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

function authenticationAttempts(services: ReturnType<typeof createServices>) {
  const options = { requestContext: requestContext("req-authentication") };
  const timestamp = String(fakeRedis.now());
  return {
    pwd: () => services.authentication.loginWithPassword.execute({
      username: userDetail.username,
      password: "correct-password",
    }, options),
    sms: () => services.authentication.loginWithMobile.execute({
      phoneNumber: userDetail.mobile,
      code: "123456",
    }, options),
    oa: () => services.authentication.loginWithOa.execute({
      clientCode: client.clientCode,
      loginId: userDetail.username,
      timestamp,
      token: createOaToken(userDetail.username, timestamp),
    }, options),
    wechat: () => services.authentication.loginWithWechat.execute({ code: "wx-code" }, options),
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
  const principalToken = await createPrincipalToken(services.principalSessions);
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

function createOaToken(loginid: string, ts: string, clientSecret = client.clientSecret) {
  return Buffer.from(sm3(`${loginid}|${ts}|${clientSecret}${clientSecret}`), "hex").toBase64();
}

beforeEach(() => {
  fakeRedis.reset();
  auditLogs.length = 0;
  logger.warn.mockClear();
  liveUserAvailable = true;
  profileAvailable = true;
  currentIndependentRuntimeClient = independentRuntimeClient;
  currentGatewayRuntimeClient = createGatewayRuntimeClient("gateway");
  currentGatewayOrcasRuntimeClient = createGatewayRuntimeClient("gateway-orcas");
  logger.info.mockClear();
});

describe("Custom SSO module interface", () => {
  test.each([0, 5_000, -5_000])("delivers both modes across application offset %d and clock jumps", async (offset) => {
    let applicationOffset = offset;
    const services = createServices({
      applicationClock: { now: () => fakeRedis.now() + applicationOffset },
      authCodeExpireSeconds: 2,
      localSessionTtlSeconds: 2,
    });
    const independent = await redeemIndependentCredential(services);
    expect(independent.ttl).toBe(2);
    const { code, principalToken } = await issueAuthorizationCode(services, { clientCode: "gateway" });
    applicationOffset += 86_400_000;
    const gateway = await services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl: "https://app.example.com/callback",
    });
    expect(gateway.ttl).toBe(2);
    applicationOffset -= 172_800_000;
    const observer = createServices({ applicationClock: { now: () => fakeRedis.now() - offset } });
    const independentContext = await observer.resolveAuthenticationContext(independent.credential, client.clientCode);
    const gatewayContext = await observer.resolveAuthenticationContext(gateway.token, "gateway");
    const principalContext = await observer.resolveAuthenticationContext(principalToken);
    expect(independentContext.subjectIdentifier).toBe(subjectIdentifier);
    expect(gatewayContext.subjectIdentifier).toBe(subjectIdentifier);
    expect(principalContext.subjectIdentifier).toBe(subjectIdentifier);
    const header = await observer.customSsoSession.authorizeLocalSession(gateway.token, "gateway");
    expect(header).toBeTruthy();
    await observer.customSsoSession.logout(independent.credential);
    await observer.customSsoSession.logout(gateway.token);
    for (const token of [independent.credential, gateway.token]) {
      const result = await services.kernel.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
      expect(result.status).toBe("revoked");
    }
  });

  test("rounds a valid subsecond parent-clamped Credential up to one protocol second", async () => {
    const services = createServices({ principalTtlMs: 750 });
    const independent = await redeemIndependentCredential(services);
    expect(independent.ttl).toBe(1);
    const { code } = await issueAuthorizationCode(services, { clientCode: "gateway" });
    const gateway = await services.customSsoSession.completeGatewayLogin({
      client: getGatewayClientContext("gateway"),
      code,
      redirectUrl: "https://app.example.com/callback",
    });
    expect(gateway.ttl).toBe(1);
  });

  test.each(["independent", "gateway"])("delivers the acquired %s result after its Credential deadline passes", async (mode) => {
    const services = createServices({
      localSessionTtlSeconds: 1,
      decorateKernel: kernel => ({
        ...kernel,
        issueCredential: async (input) => {
          const result = await kernel.issueCredential(input);
          await Promise.resolve();
          fakeRedis.advance(1_001);
          return result;
        },
      }),
    });
    const { code } = await issueAuthorizationCode(services, { clientCode: mode === "gateway" ? "gateway" : client.clientCode });
    const result = mode === "gateway"
      ? await services.customSsoSession.completeGatewayLogin({
          client: getGatewayClientContext("gateway"),
          code,
          redirectUrl: "https://app.example.com/callback",
        })
      : await services.customSsoSession.redeemIndependentGrant({
          client: independentClient,
          code,
          redirectUri: "https://app.example.com/callback",
        });
    expect(result.ttl).toBe(1);
    const token = "token" in result ? result.token : result.credential;
    const nextRequest = await services.kernel.resolveCredential(token, { protocol: "custom-sso", credentialType: "local_session" });
    expect(nextRequest.status).toBe("missing_or_expired");
  });

  test("issues an Independent Credential with a known new identity and no Client Binding", async () => {
    const grantAttemptId = "10000000-0000-4000-8000-000000000001";
    const services = createServices({ grantAttemptId });

    const result = await redeemIndependentCredential(services);
    const credential = await services.kernel.resolveCredential(result.credential, { protocol: "custom-sso", credentialType: "local_session" });

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
      services.kernel.resolveCredential(result.credential, { protocol: "custom-sso", credentialType: "local_session" }),
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

  test("rejects and revokes a legacy binding-backed Custom SSO Credential", async () => {
    const services = createServices();
    const principal = await services.kernel.createPrincipalSession(subjectIdentifier, { subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId: "20000000-0000-4000-8000-000000000001" }) });
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
      services.kernel.resolveCredential(legacyCredential.externalToken, legacyCredential.value),
    ).resolves.toMatchObject({ status: "revoked" });
    await expect(
      services.customSsoSession.logout(legacyLogoutCredential.externalToken),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
    await expect(
      services.kernel.resolveCredential(legacyLogoutCredential.externalToken, legacyLogoutCredential.value),
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
      services.kernel.resolveCredential("preexisting-collision-token", { protocol: "custom-sso", credentialType: "local_session" }),
    ).resolves.toMatchObject({ status: "resolved" });
  });

  test("authorization checks once and keeps the permitted artifact creation in flight", async () => {
    let validationCalls = 0;
    const services = createServices({
      validatePrincipal: async () => {
        validationCalls += 1;
        return validationCalls > 1 ? { ok: false, reason: "user_disabled" } : { ok: true };
      },
    });
    const token = await createPrincipalToken(services.principalSessions);
    const input = {
      clientCode: client.clientCode,
      configVersion: independentClient.configVersion,
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/callback",
      token,
      tokenSource: "cookie" as const,
    };
    const grant = await services.customSsoSession.issueAuthorizationCode(input);
    expect(grant.isLogin).toBe(true);
    expect(validationCalls).toBe(1);
    let rejected: unknown;
    try {
      await services.customSsoSession.issueAuthorizationCode(input);
    }
    catch (error) { rejected = error; }
    expect(rejected).toBeInstanceOf(SubjectAccessDisabledError);
    expect(validationCalls).toBe(2);
  });

  test("redemption checks once through issue and post-issue validation, and the next access checks again", async () => {
    let countValidations = false;
    let validationCalls = 0;
    const services = createServices({
      validatePrincipal: async () => {
        if (!countValidations)
          return { ok: true };
        validationCalls += 1;
        return validationCalls > 1 ? { ok: false, reason: "user_disabled" } : { ok: true };
      },
    });
    const { code } = await issueAuthorizationCode(services);
    countValidations = true;
    const credential = await services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });
    expect(validationCalls).toBe(1);
    let rejected: unknown;
    try {
      await services.resolveAuthenticationContext(credential.credential, client.clientCode);
    }
    catch (error) { rejected = error; }
    expect(rejected).toBeInstanceOf(SubjectAccessDisabledError);
    expect(validationCalls).toBe(2);
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
    const token = await createPrincipalToken(services.principalSessions);

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
    const token = await createPrincipalToken(services.principalSessions);

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
    const token = await createPrincipalToken(services.principalSessions);
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

  test("logout revokes either principal or credential without subject access", async () => {
    let principalDisabled = false;
    const principalServices = createServices({
      validatePrincipal: async () => principalDisabled
        ? { ok: false, reason: "user_disabled" }
        : { ok: true },
    });
    const principalToken = await createPrincipalToken(
      principalServices.principalSessions,
    );
    principalDisabled = true;

    await principalServices.customSsoSession.logout(principalToken);
    const revokedPrincipal = await principalServices.kernel.resolvePrincipalSession(principalToken);
    expect(revokedPrincipal.status).not.toBe("resolved");

    let credentialDisabled = false;
    const credentialServices = createServices({
      validatePrincipal: async () => credentialDisabled
        ? { ok: false, reason: "user_disabled" }
        : { ok: true },
    });
    const credential = await redeemIndependentCredential(credentialServices);
    credentialDisabled = true;
    await credentialServices.customSsoSession.logout(credential.credential);
    const revokedCredential = await credentialServices.kernel.resolveCredential(credential.credential, { protocol: "custom-sso", credentialType: "local_session" });
    expect(revokedCredential.status).not.toBe("resolved");
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
      services.principalSessions,
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

  test("issues a strict V2 authorization artifact without a redemption record", async () => {
    const services = createServices();
    const principalToken = await createPrincipalToken(services.principalSessions);

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

    const artifact = await services.kernel.resolveProtocolArtifact(authorization.code, { protocol: "custom-sso", artifactType: "auth_code" });
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
  });

  test("keeps a newly issued authorization artifact when the accepted client changes during issuance", async () => {
    let currentRuntimeClient = independentRuntimeClient;
    const revokeArtifact = mock(async (
      _artifactId: string,
      _reason?: string,
    ) => undefined);
    const services = createServices({
      findRuntimeClient: async () => {
        throw new Error("the session adapter must reuse the accepted request client");
      },
      decorateKernel: kernel => ({
        ...kernel,
        async createProtocolArtifact(input) {
          currentRuntimeClient = {
            ...independentRuntimeClient,
            customSsoConfigVersion:
              independentRuntimeClient.customSsoConfigVersion + 1,
          };
          return await kernel.createProtocolArtifact(input);
        },
        async revokeArtifact(artifactId, reason) {
          await revokeArtifact(artifactId, reason);
          return await kernel.revokeArtifact(artifactId, reason);
        },
      }),
    });
    const principalToken = await createPrincipalToken(
      services.principalSessions,
    );
    const findRuntimeRecord = mock(async () => currentRuntimeClient);
    const authorize = createAuthorizeSsoUseCase({
      authorizationGrants: services.customSsoSession,
      clients: { findRuntimeRecord },
      redirectUrls: {
        normalizeAllowed: () => "https://app.example.com/callback",
      },
      trafficGate: { assertIssuanceAllowed: async () => undefined },
    });

    const result = await authorize.execute({
      clientCode: independentClient.clientCode,
      globalSessionToken: principalToken,
      redirectUrl: "https://app.example.com/callback",
      tokenSource: "cookie",
    });

    expect(result).toMatchObject({ isLogin: true });
    expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
    expect(currentRuntimeClient.customSsoConfigVersion).toBe(8);
    expect(revokeArtifact).not.toHaveBeenCalled();
    if (!result.isLogin)
      throw new Error("expected issued authorization code");
    const artifact = await services.kernel.resolveProtocolArtifact(result.code, { protocol: "custom-sso", artifactType: "auth_code" });
    expect(artifact.status).toBe("resolved");
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

    const credential = await services.kernel.resolveCredential(result.credential, { protocol: "custom-sso", credentialType: "local_session" });
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
    await expect(services.kernel.resolveProtocolArtifact(code, { protocol: "custom-sso", artifactType: "auth_code" })).resolves.toMatchObject({
      status: "consumed_replay",
    });
  });

  test.each([
    ["unauthorized failure", new AuthzUnauthorizedError("未登录")],
    ["unexpected bug", new Error("projection bug")],
  ])("keeps Code consumed after a non-retryable %s", async (
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
    const retry = services.customSsoSession.redeemIndependentGrant({
      client: independentClient,
      code,
      redirectUri: "https://app.example.com/callback",
    });
    if (_label === "redirect URI")
      await expect(retry).resolves.toMatchObject({ credential: expect.stringContaining("iam_ls_") });
    else
      await expect(retry).rejects.toBeInstanceOf(InvalidAuthCodeError);
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
      services.kernel.resolveCredential(result.credential, { protocol: "custom-sso", credentialType: "local_session" }),
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
    const principalToken = await createPrincipalToken(services.principalSessions);
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

  test("consumes Code without issuing a credential when pure projection mapping fails", async () => {
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

    expect(fakeRedis.keysStartingWith("sess:v2:state:c:")).toHaveLength(0);
  });

  test("keeps Maintenance out of permanent authorization-version validation", async () => {
    const services = createServices({
      findRuntimeClient: async () => ({
        ...independentRuntimeClient,
        status: ClientStatus.Maintenance,
      }),
    });
    const principalToken = await createPrincipalToken(
      services.principalSessions,
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
      ttl: 3600,
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
    const credential = await services.kernel.resolveCredential(result.token, { protocol: "custom-sso", credentialType: "local_session" });
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
      services.kernel.resolveCredential(result.token, { protocol: "custom-sso", credentialType: "local_session" }),
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
      }, currentGatewayRuntimeClient);
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
    const principalToken = await createPrincipalToken(services.principalSessions);

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

  test("production authentication composition creates Principal Sessions for all four login methods", async () => {
    const services = createServices({
      applicationClock: { now: () => fakeRedis.now() + 86_400_000 },
    });
    const tokens = new Set<string>();
    const attempts = authenticationAttempts(services);
    for (const [amr, login] of Object.entries(attempts)) {
      services.accessChecks.mockClear();
      services.principalSessionCreations.mockClear();
      const result = await login();
      expect(services.accessChecks).toHaveBeenCalledTimes(1);
      expect(services.principalSessionCreations).toHaveBeenCalledTimes(1);
      const creationContext = services.principalSessionCreations.mock.calls[0]![1];
      expect(parseSubjectAccessContext(creationContext.subjectContext)).toEqual({
        version: 1,
        subjectIdentifier,
        transitionId: "20000000-0000-4000-8000-000000000001",
      });
      expect(result).toEqual({ token: expect.stringContaining("iam_ps_"), isMobileSet: true });
      tokens.add(result.token);
      const resolved = await services.kernel.resolvePrincipalSession(result.token);
      expect(resolved).toMatchObject({
        status: "resolved",
        observedAt: fakeRedis.now(),
        value: {
          principal: { principalType: "user", subjectId: subjectIdentifier },
          sessionKind: "browser_user",
          amr: [amr],
          authTime: fakeRedis.now() + 86_400_000,
          expiresAt: fakeRedis.now() + 3_600_000,
          origin: { ip: "203.0.113.10", userAgent: "api-test" },
        },
      });
      const authenticationContext = await services.resolveAuthenticationContext(result.token);
      expect(authenticationContext).toEqual({ authenticatedClientCode: "iam", subjectIdentifier });
    }
    expect(tokens.size).toBe(4);
    expect(auditLogs).toHaveLength(4);
    const wxRetry = await attempts.wechat();
    expect(tokens.has(wxRetry.token)).toBe(false);
    const retried = await services.kernel.resolvePrincipalSession(wxRetry.token);
    expect(retried).toMatchObject({ status: "resolved", value: { amr: ["wechat"] } });
    expect(auditLogs).toHaveLength(4);
  });

  test.each(["pwd", "sms", "oa", "wechat"] as const)("%s production wiring preserves Subject Access creation failure", async (method) => {
    const failure = new SubjectAccessUnavailableError();
    const services = createServices({
      captureSubjectAccessTransitionId: async () => { throw failure; },
    });
    let caught: unknown;
    try {
      await authenticationAttempts(services)[method]();
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(services.accessChecks).toHaveBeenCalledTimes(1);
    expect(services.principalSessionCreations).not.toHaveBeenCalled();
    expect(fakeRedis.keysStartingWith("sess:v2:")).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
  });

  test.each(["pwd", "sms", "oa", "wechat"] as const)("%s rejects disabled Subject Access before creating a session", async (method) => {
    const services = createServices({
      captureSubjectAccessTransitionId: async () => { throw new SubjectAccessDisabledError(); },
    });
    let caught: unknown;
    try {
      await authenticationAttempts(services)[method]();
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubjectAccessDisabledError);
    expect(services.accessChecks).toHaveBeenCalledTimes(1);
    expect(services.principalSessionCreations).not.toHaveBeenCalled();
    expect(fakeRedis.keysStartingWith("sess:v2:")).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
  });

  test.each(["pwd", "sms", "oa", "wechat"] as const)("%s production wiring preserves Kernel creation failure mapping", async (method) => {
    const services = createServices({
      decorateAuthenticationKernel: kernel => ({
        ...kernel,
        createPrincipalSession: async () => ({ status: "fail_closed", message: "unavailable" }),
      }),
    });
    let caught: unknown;
    try {
      await authenticationAttempts(services)[method]();
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CustomError);
    expect(caught).toMatchObject({ message: "全局session创建失败" });
    expect(auditLogs).toHaveLength(0);
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
    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(InvalidAuthCodeError);
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
    })).rejects.toBeInstanceOf(AuthzUnauthorizedError);
  });

  test("rejects an Independent grant when the referenced PrincipalSession is revoked", async () => {
    const services = createServices();
    const { principalToken, code } = await issueAuthorizationCode(services);
    const principal = await services.kernel.resolvePrincipalSession(principalToken);
    if (principal.status !== "resolved") {
      throw new Error("expected principal session");
    }
    await fakeRedis.del(services.kernel.keys.state("principal_session", principal.value.externalTokenLookupHash));

    await expect(
      services.customSsoSession.redeemIndependentGrant({
        client: independentClient,
        code,
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);
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
      ttl: 3600,
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
    const credential = await services.kernel.resolveCredential(result.token, { protocol: "custom-sso", credentialType: "local_session" });
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
    const principal = await services.kernel.resolvePrincipalSession(principalToken);
    expect(principal).toMatchObject({
      status: "resolved",
      value: { principal: { subjectId: subjectIdentifier } },
    });
  });

  test("Independent credential resolution rejects client mismatch but accepts its own identity without the parent", async () => {
    const services = createServices();
    const result = await redeemIndependentCredential(services);

    await expect(
      services.resolveAuthenticationContext(
        result.credential,
        "other-client",
      ),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    const second = await redeemIndependentCredential(services);
    const credential = await services.kernel.resolveCredential(second.credential, { protocol: "custom-sso", credentialType: "local_session" });
    if (credential.status !== "resolved") {
      throw new Error("expected credential");
    }
    await fakeRedis.del(
      services.kernel.keys.active(
        "principal_session",
        credential.value.principalSessionId,
      ),
    );
    const context = await services.resolveAuthenticationContext(second.credential, independentClient.clientCode);
    expect(context).toMatchObject({ subjectIdentifier });
    const retained = await services.kernel.resolveCredential(second.credential, { protocol: "custom-sso", credentialType: "local_session" });
    expect(retained.status).toBe("resolved");
  });

  test("Independent logout revokes its credential and keeps it invalid during maintenance", async () => {
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
