import { randomUUID } from "node:crypto";
import process from "node:process";
import {
  createRootAuthenticationComposition,
  type RootAuthenticationCompositionOptions,
} from "@api/composition/root-authentication";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import type { UserRepository } from "@api/services/user/user.repository";
import type { UserService } from "@api/services/user/user.service";
import { createErrorHandler } from "@iam/api-core/middlewares";
import type { ClientSnapshotSource, ClientSnapshotValue } from "@iam/client-snapshot";
import { ClientSnapshotUnavailableError } from "@iam/client-snapshot";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { type ClientCredentialSource, createClientSecretAuthenticator } from "@iam/client-snapshot/credentials";
import type { SubjectFactsSnapshot } from "@iam/client-subject-projection";
import {
  ClientSsoCallbackType,
  ClientSsoProtocol,
  ClientStatus,
  createLoginCredential,
  SubjectClaim,
  UserStatus,
  UserType,
} from "@iam/contracts";
import type { UnifiedCustomSsoAuthorizationOptions } from "@iam/custom-sso";
import { createUnifiedCustomSsoRedisTestScope } from "@iam/custom-sso/testing";
import { relations } from "@iam/db/relations";
import { createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/documents/user/subject-facts";
import { LoginRestrictionUnavailableError } from "@iam/login-restriction";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import type { SubjectAccessOperation } from "@iam/subject-access";
import {
  createSubjectAccessBarrier,
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { drizzle } from "drizzle-orm/postgres-js";
import { Hono } from "hono";
import Redis from "ioredis";
import postgres from "postgres";
import { sm2, sm3 } from "sm-crypto";
import { cleanupAfterFixtureFailure, closeFixtureResources } from "../oidc/oidc.fixture";
import { closeApiRedisConnection, ownApiTestExecutor } from "../support/fixture-lifecycle";

export async function fixture(
  codeTtlSeconds = 30,
  networkUrl?: string,
  tokenTtlSeconds = 45,
  continuationTtlSeconds = 60,
  subjectFacts?: { read: (subject: string) => Promise<SubjectFactsSnapshot | null> },
  admission?: {
    evaluator: UnifiedCustomSsoAuthorizationOptions["admission"];
    source: ClientSnapshotSource & ClientCredentialSource;
  },
  userDependencies?: {
    wechatUsers?: Pick<UserRepository, "getUserByWxId" | "getUserById">;
    publicUser?: Pick<UserService, "getActiveUserBySubjectIdentifier" | "setMobile">;
    wechatQr?: Omit<
      NonNullable<RootAuthenticationCompositionOptions["wechatQr"]>,
      "redis" | "namespace" | "binding"
    > & {
      binding?: Omit<
        NonNullable<NonNullable<RootAuthenticationCompositionOptions["wechatQr"]>["binding"]>,
        "credentials"
      >;
    };
    customAdmission?: UnifiedCustomSsoAuthorizationOptions["admission"];
    auditLogWriter?: RootAuthenticationCompositionOptions["authentication"]["auditLogWriter"];
    loginRestriction?: RootAuthenticationCompositionOptions["authentication"]["services"]["loginRestriction"];
  },
) {
  const url = networkUrl ?? process.env.IAM_API_TEST_REDIS_URL;
  if (!url) throw new Error("IAM_API_TEST_REDIS_URL is required");
  const resources: Array<() => unknown | Promise<unknown>> = [];
  let stopped = false;
  const close = ownApiTestExecutor(async () => {
    stopped = true;
    await closeFixtureResources(resources);
  });
  try {
    const trackStop = (stop: () => Promise<void>) => {
      resources.push(stop);
    };
    const scope = await createUnifiedSessionRedisTestScope(url, { user: 120, client: 60 }, trackStop);
    scope.close = close;
    const codes = await createUnifiedCustomSsoRedisTestScope(url, trackStop);
    const admissionSnapshots = admission && createClientSnapshots({ redis: codes.redis, source: admission.source });
    const kernel = scope.createFactoryForOperations<SubjectAccessOperation>(requireSubjectAccessOperation);
    const subjectIdentifier = randomUUID();
    const businessClientCode = networkUrl ? `sample-${randomUUID()}` : "app";
    const user = {
      id: 1001,
      subjectIdentifier,
      username: "138550",
      wxId: "wx-test",
      name: "测试用户",
      mobile: "17721462865",
      userType: UserType.Formal,
      orderNum: 1,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: new Date(),
      updateTime: new Date(),
      employments: [],
      roles: [],
    };
    const state = {
      publicBusinessReads: 0,
      generation: randomUUID(),
      permission: "enabled",
      permissionReads: 0,
      factsReads: 0,
      restriction: false,
      restrictionUnavailable: false,
      authenticationAuditUnavailable: false,
      failures: 0,
      clientReads: 0,
      clientUnavailable: false,
      gatewayAuditFails: false,
      businessAuditFails: false,
    };
    const audits: Array<{ action: string; outcome: string }> = [];
    const cache = new Map<string, string>();
    const keys = sm2.generateKeyPairHex();
    const warnings: unknown[] = [];
    const logger = {
      info() {},
      warn(fields: unknown) {
        warnings.push(fields);
      },
      error() {},
      bindings: () => ({ sourceApp: "root-test" }),
    };
    let duringFacts: (() => Promise<void>) | undefined;
    let client: ClientSnapshotValue = {
      clientCode: "iam",
      status: ClientStatus.Enable,
      admissionEnabled: false,
      admissionFilter: null,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Business,
        callbackEndpoint: "https://app.example/callback",
        validRedirectUrls: ["https://app.example/callback"],
        subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
      },
    };
    // Cost samples use the real warm cache owners; source rows are seeded before the sample.
    const network = networkUrl
      ? new Redis(networkUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null })
      : undefined;
    if (network) resources.push(() => closeApiRedisConnection(network));
    const networkPrefix = `${codes.namespace}:network:`;
    const sourceCounts = { client: 0, credential: 0, factsSql: 0 };
    const sql =
      network &&
      postgres({
        host: "127.0.0.1",
        port: 1,
        connect_timeout: 1,
        debug() {
          sourceCounts.factsSql++;
        },
      });
    if (sql) resources.push(() => sql.end());
    const snapshots =
      network &&
      createClientSnapshots({
        redis: network,
        source: {
          async loadClient(code) {
            sourceCounts.client++;
            if (code !== businessClientCode) throw new Error("Network fixture Client is outside its owned scope");
            return { ...client, clientCode: code };
          },
          async loadCredential(code) {
            sourceCounts.credential++;
            if (code !== businessClientCode) throw new Error("Network fixture credential is outside its owned scope");
            return {
              secret: "business-secret",
              credentialId: randomUUID(),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      });
    const realBarrier =
      network &&
      createSubjectAccessBarrier({
        store: createRedisSubjectAccessStore({ redis: network, keyPrefix: networkPrefix }),
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
      });
    const factsCache = network && createSubjectFactsRedisCache(network, { keyPrefix: `${networkPrefix}facts:` });
    const realFacts =
      sql && factsCache && createSubjectFactsReader({ db: drizzle({ client: sql, relations }), cache: factsCache });
    if (network && factsCache) {
      await network.ping();
      await createSubjectAccessBootstrap({
        redis: network,
        keyPrefix: networkPrefix,
        random: { uuid: () => state.generation },
      }).seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
      await factsCache.publish({
        kind: "document",
        userId: user.id,
        schemaVersion: 1,
        sourceVersion: "1",
        publishedAt: new Date().toISOString(),
        subjectIdentifier,
        facts: { profile: { username: user.username, name: "已发布资料", phone: null }, employments: [] },
      });
    }
    const now = 1700000000000;
    const loginCredentialParser = createLoginCredentialParser({
      clock: { now: () => now },
      nonceStore: {
        set: (key, value, _expiry, ttl, _condition) =>
          codes.redis.eval(
            "return redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX')",
            1,
            key,
            value,
            String(ttl),
          ),
      },
      config: { privateKeysByKid: { test: keys.privateKey }, maxSkewMs: 60000, nonceTtlSeconds: 120 },
    });
    const composition = createRootAuthenticationComposition({
      kernel,
      wechatQr: userDependencies?.wechatQr && {
        ...userDependencies.wechatQr,
        redis: codes.redis,
        namespace: codes.namespace,
        binding: userDependencies.wechatQr.binding && {
          ...userDependencies.wechatQr.binding,
          credentials: loginCredentialParser,
        },
      },
      customSso: {
        redis: codes.redis,
        namespace: codes.namespace,
        codeTtlSeconds,
        continuationTtlSeconds,
        admission: admission?.evaluator ??
          userDependencies?.customAdmission ?? {
            evaluate() {
              throw new Error("Admission requires a published User Document fixture");
            },
          },
      },
      customSsoAccess: {
        tokenTtlSeconds,
        business: {
          audit: {
            async recordAuditLog(input) {
              if (state.businessAuditFails) throw new Error("Business audit unavailable");
              audits.push(input);
            },
          },
          logger,
        },
        managed: {
          audit: {
            async recordAuditLog(input) {
              if (state.gatewayAuditFails) throw new Error("Gateway audit unavailable");
              audits.push(input);
            },
          },
          logger,
        },
        credentials: {
          async authenticate(clientCode, secret) {
            if (snapshots && clientCode !== businessClientCode)
              throw new Error("Network fixture refuses unowned Client authentication");
            if (snapshots) {
              return await createClientSecretAuthenticator(snapshots.credential).authenticate(clientCode, secret);
            }
            if (secret === "unknown") throw new SubjectAccessUnavailableError();
            return secret === "business-secret" ? { clientCode } : null;
          },
        },
      },
      barrier: {
        async readCommittedTransitionId() {
          state.permissionReads++;
          if (realBarrier) return await realBarrier.readCommittedTransitionId(subjectIdentifier);
          if (state.permission === "disabled") throw new SubjectAccessDisabledError();
          if (state.permission === "unknown") throw new SubjectAccessUnavailableError();
          return state.generation;
        },
      },
      clients: admissionSnapshots?.client ?? {
        async acquire(code) {
          state.clientReads++;
          if (state.clientUnavailable) throw new ClientSnapshotUnavailableError();
          if (snapshots && code !== businessClientCode)
            throw new Error("Network fixture refuses unowned Client acquisition");
          if (snapshots) return await snapshots.client.acquire(code);
          return { kind: "present", value: { ...client, clientCode: code } };
        },
      },
      subjectFacts: {
        async read() {
          state.factsReads++;
          if (realFacts) return await realFacts.read(subjectIdentifier);
          if (subjectFacts) return await subjectFacts.read(subjectIdentifier);
          await duringFacts?.();
          return {
            subjectIdentifier,
            sourceVersion: "1",
            profile: { username: user.username, name: "已发布资料", phone: null },
            employments: [],
          };
        },
      },
      loginCredentialParser,
      publicServices: {
        userService: {
          getActiveUserBySubjectIdentifier:
            userDependencies?.publicUser?.getActiveUserBySubjectIdentifier ??
            (async () => ({ ...user, password: null })),
          setPassword: async () => {
            state.publicBusinessReads++;
            return true;
          },
          setMobile:
            userDependencies?.publicUser?.setMobile ??
            (async () => {
              state.publicBusinessReads++;
              return true;
            }),
        },
      },
      internalClients: { getClientBySecret: async () => null },
      logger,
      config: {
        redisExpireSeconds: 999,
        projectionRetryAfterSeconds: 3,
        loginEndpoint: "/portal/login",
      },
      authentication: {
        auditLogWriter: {
          async recordAuditLog(input) {
            if (state.authenticationAuditUnavailable) throw new Error("Authentication audit unavailable");
            audits.push(input);
            await userDependencies?.auditLogWriter?.recordAuditLog(input);
          },
        },
        runtime: {
          clock: { now: () => now },
          config: { auth: { magicCode: "magic-test" }, env: { nodeEnv: "production" } },
          redis: {
            get: async (key) => cache.get(key) ?? null,
            del: async (key) => cache.delete(key),
            set: async (key, value) => cache.set(key, value),
          },
          integrations: {
            wechat: {
              async getWxUserId(code) {
                if (code === "wx-code") return "wx-test";
                if (userDependencies?.wechatQr && code === "wx-unregistered-code") return "wx-unregistered";
                if (userDependencies?.wechatQr?.binding && code === "wx-unregistered-other-code")
                  return "wx-unregistered-other";
                if (userDependencies?.wechatUsers && code.startsWith("wx-pg-")) return " Wx-Member ";
                throw new Error("invalid wx code");
              },
            },
          },
        },
        services: {
          cap: { ensureActionAllowed: async () => {} },
          client: { getClientByCode: async () => ({ clientSecret: "secret" }) },
          humanRisk: { recordLoginFailure: async () => {} },
          loginRestriction: userDependencies?.loginRestriction ?? {
            getRestriction: async () => {
              if (state.restrictionUnavailable) throw new LoginRestrictionUnavailableError();
              return state.restriction ? { triggerMethod: "password", remainingSeconds: 60 } : null;
            },
            clearLoginState: async () => {},
            async recordFailure() {
              state.failures++;
              return { failureCount: state.failures, remainingAttempts: 3, restriction: null };
            },
          },
          mobile: { consumeVerificationCode: async (_usage, _phone, code) => code === "sms-code" },
          user: {
            checkPassword: async (_name, password) => password === "password",
            getActiveUserByUsername: async () => user,
            getActiveUserByMobile: async () => user,
            getActiveUserByWxId: userDependencies?.wechatUsers?.getUserByWxId ?? (async () => user),
            getActiveUserById: userDependencies?.wechatUsers?.getUserById ?? (async () => user),
            getLoginProfileById: async () => user,
          },
        },
      },
    });
    const app = new Hono();
    app.onError(createErrorHandler(logger));
    app.route("/", composition.router);
    function credential(value: string, username = user.username, wechatQrRequestId?: string) {
      return createLoginCredential({
        username,
        password: value,
        kid: "test",
        publicKey: keys.publicKey,
        now,
        nonce: randomUUID(),
        wechatQrRequestId,
      });
    }
    async function password(value = "password") {
      return await app.request("/auth/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credential(value) }),
      });
    }
    async function login() {
      const response = await password();
      if (response.status !== 200) throw new Error("Fixture login failed");
      const body = await response.json();
      return body.data.token as string;
    }
    const cookie = (response: Response) =>
      /global_session=([^;]+)/u.exec(response.headers.get("set-cookie") ?? "")?.[1];
    if (stopped) throw new Error("Root Auth fixture stopped during initialization");
    return {
      ...composition,
      app,
      scope,
      close,
      codes,
      kernel,
      state,
      sourceCounts,
      businessClientCode,
      invalidateClient: admissionSnapshots?.invalidateClient,
      audits,
      warnings,
      subjectIdentifier,
      credential,
      password,
      login,
      cookie,
      setClient(value: ClientSnapshotValue) {
        client = value;
      },
      getClient: () => client,
      duringFacts(action: () => Promise<void>) {
        duringFacts = action;
      },
      oaToken: Buffer.from(sm3(`138550|${now}|secretsecret`), "hex").toString("base64"),
    };
  } catch (failure) {
    return await cleanupAfterFixtureFailure(failure, close);
  }
}
