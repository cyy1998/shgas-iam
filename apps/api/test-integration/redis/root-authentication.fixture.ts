import type { ClientSnapshotValue } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createRootAuthenticationComposition } from "@api/composition/root-authentication";
import { createOrcasClient } from "@api/lib/integrations/orcas";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
import { ClientSnapshotUnavailableError } from "@iam/api-core/client-snapshot";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/api-core/client-snapshot/credentials";
import { clientSnapshotKeys } from "@iam/api-core/client-snapshot/testing";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import {
  ClientSsoCallbackType,
  ClientSsoProtocol,
  ClientStatus,
  createLoginCredential,
  SubjectClaim,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { createUnifiedCustomSsoRedisTestScope } from "@iam/custom-sso/testing";
import { relations } from "@iam/db/relations";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import {
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/user-profile-read-model/subject-facts";
import { drizzle } from "drizzle-orm/postgres-js";
import { Hono } from "hono";
import Redis from "ioredis";
import postgres from "postgres";
import { sm2, sm3 } from "sm-crypto";

export async function fixture(codeTtlSeconds = 30, networkUrl?: string, tokenTtlSeconds = 45) {
  const url = networkUrl ?? process.env.IAM_API_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_API_TEST_REDIS_URL is required");
  const scope = await createUnifiedSessionRedisTestScope(url, { user: 120, client: 60 });
  const codes = await createUnifiedCustomSsoRedisTestScope(url);
  const closeKernel = scope.close;
  scope.close = async () => {
    await codes.close();
    await closeKernel();
  };
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
    privileges: [],
  };
  const state = {
    publicBusinessReads: 0,
    generation: randomUUID(),
    permission: "enabled",
    permissionReads: 0,
    factsReads: 0,
    restriction: false,
    failures: 0,
    clientReads: 0,
    clientUnavailable: false,
    orcasUrl: "",
    orcasResponseLost: false,
    orcasUserMissing: false,
    orcasUserReads: 0,
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
  const networkPrefix = `${codes.namespace}:network:`;
  const sourceCounts = { client: 0, credential: 0, factsSql: 0 };
  const sql
    = network
      && postgres({
        host: "127.0.0.1",
        port: 1,
        connect_timeout: 1,
        debug() {
          sourceCounts.factsSql++;
        },
      });
  const snapshots
    = network
      && createClientSnapshots({
        redis: network,
        source: {
          async loadClient(code) {
            sourceCounts.client++;
            if (code !== businessClientCode)
              throw new Error("Network fixture Client is outside its owned scope");
            return { ...client, clientCode: code };
          },
          async loadCredential(code) {
            sourceCounts.credential++;
            if (code !== businessClientCode)
              throw new Error("Network fixture credential is outside its owned scope");
            return {
              secret: "business-secret",
              credentialId: randomUUID(),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      });
  const realBarrier
    = network
      && createSubjectAccessBarrier({
        store: createRedisSubjectAccessStore({ redis: network, keyPrefix: networkPrefix }),
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
      });
  const factsCache
    = network && createSubjectFactsRedisCache(network, { keyPrefix: `${networkPrefix}facts:` });
  const realFacts
    = sql
      && factsCache
      && createSubjectFactsReader({ db: drizzle({ client: sql, relations }), cache: factsCache });
  if (network && factsCache) {
    await network.ping();
    await createSubjectAccessBootstrap({
      redis: network,
      keyPrefix: networkPrefix,
      random: { uuid: () => state.generation },
    }).seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
    await factsCache.publish({
      schemaVersion: 3,
      sourceDirtyVersion: "1",
      publishedAt: new Date().toISOString(),
      subjectIdentifier,
      profile: { username: user.username, name: "已发布资料", phone: null },
      facts: { employments: [] },
    });
    const oldClose = scope.close;
    scope.close = async () => {
      try {
        const value = clientSnapshotKeys(businessClientCode);
        const keys = [value.control, ...value.payloads];
        keys.push(
          `${networkPrefix}record:${subjectIdentifier}`,
          `${networkPrefix}facts:${subjectIdentifier}`,
        );
        await network.del(...keys);
      }
      finally {
        network.disconnect();
        await sql?.end();
        await oldClose();
      }
    };
  }
  const now = 1700000000000;
  const composition = createRootAuthenticationComposition({
    kernel,
    customSso: {
      redis: codes.redis,
      namespace: codes.namespace,
      codeTtlSeconds,
      continuationTtlSeconds: 60,
    },
    customSsoAccess: {
      tokenTtlSeconds,
      business: {
        audit: {
          async recordAuditLog(input) {
            if (state.businessAuditFails)
              throw new Error("Business audit unavailable");
            audits.push(input);
          },
        },
        logger,
      },
      managed: {
        orcas: createOrcasClient({
          config: { orcasUrl: "https://unused.example/" },
          fetch: Object.assign(
            async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
              const response = await fetch(state.orcasUrl, init);
              if (state.orcasResponseLost) {
                await response.arrayBuffer();
                throw new Error("ORCAS completed but its response was lost");
              }
              return response;
            },
            { preconnect: fetch.preconnect },
          ),
        }),
        users: {
          async findOrcasUserBySubjectIdentifier(subject) {
            if (subject !== subjectIdentifier)
              throw new Error("Unexpected ORCAS subject");
            state.orcasUserReads++;
            return state.orcasUserMissing
              ? null
              : { id: user.id, username: user.username, name: user.name, mobile: user.mobile };
          },
        },
        audit: {
          async recordAuditLog(input) {
            if (state.gatewayAuditFails)
              throw new Error("Gateway audit unavailable");
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
            return await createClientSecretAuthenticator(snapshots.credential).authenticate(
              clientCode,
              secret,
            );
          }
          if (secret === "unknown")
            throw new SubjectAccessUnavailableError();
          return secret === "business-secret" ? { clientCode } : null;
        },
      },
    },
    barrier: {
      async readCommittedTransitionId() {
        state.permissionReads++;
        if (realBarrier)
          return await realBarrier.readCommittedTransitionId(subjectIdentifier);
        if (state.permission === "disabled")
          throw new SubjectAccessDisabledError();
        if (state.permission === "unknown")
          throw new SubjectAccessUnavailableError();
        return state.generation;
      },
    },
    clients: {
      async acquire(code) {
        state.clientReads++;
        if (state.clientUnavailable)
          throw new ClientSnapshotUnavailableError();
        if (snapshots && code !== businessClientCode)
          throw new Error("Network fixture refuses unowned Client acquisition");
        if (snapshots)
          return await snapshots.client.acquire(code);
        return { kind: "present", value: { ...client, clientCode: code } };
      },
    },
    subjectFacts: {
      async read() {
        state.factsReads++;
        if (realFacts)
          return await realFacts.read(subjectIdentifier);
        await duringFacts?.();
        return {
          subjectIdentifier,
          sourceDirtyVersion: "1",
          profile: { username: user.username, name: "已发布资料", phone: null },
          employments: [],
        };
      },
    },
    loginCredentialParser: createLoginCredentialParser({
      clock: { now: () => now },
      nonceStore: {
        async set(key) {
          if (cache.has(key))
            return null;
          cache.set(key, "used");
          return "OK";
        },
      },
      config: { privateKeysByKid: { test: keys.privateKey }, maxSkewMs: 60000, nonceTtlSeconds: 120 },
    }),
    publicServices: {
      organizationService: {
        searchOrganizations: async () => {
          state.publicBusinessReads++;
          return [];
        },
      },
      userProfileSearch: {
        searchLegacyUsers: async () => {
          state.publicBusinessReads++;
          return [];
        },
      },
      userService: {
        getActiveUserBySubjectIdentifier: async () => ({ ...user, password: null }),
        getUserDetailById: async () => user,
        setPassword: async () => {
          state.publicBusinessReads++;
          return true;
        },
        setMobile: async () => {
          state.publicBusinessReads++;
          return true;
        },
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
          audits.push(input);
        },
      },
      runtime: {
        clock: { now: () => now },
        config: { auth: { magicCode: "magic-test" }, env: { nodeEnv: "production" } },
        redis: {
          get: async key => cache.get(key) ?? null,
          del: async key => cache.delete(key),
          set: async (key, value) => cache.set(key, value),
        },
        integrations: {
          wechat: {
            async getWxUserId(code) {
              if (code !== "wx-code")
                throw new Error("invalid wx code");
              return "wx-test";
            },
          },
        },
      },
      services: {
        cap: { ensureActionAllowed: async () => {} },
        client: { getClientByCode: async () => ({ clientSecret: "secret" }) },
        humanRisk: { recordLoginFailure: async () => {} },
        loginRestriction: {
          getRestriction: async () =>
            state.restriction ? { triggerMethod: "password", remainingSeconds: 60 } : null,
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
          getActiveUserByWxId: async () => user,
          getActiveUserById: async () => user,
          getUserDetailById: async () => user,
        },
      },
    },
  });
  const app = new Hono();
  app.onError(createErrorHandler(logger));
  app.route("/", composition.router);
  async function password(value = "password") {
    const credential = createLoginCredential({
      username: user.username,
      password: value,
      kid: "test",
      publicKey: keys.publicKey,
      now,
      nonce: randomUUID(),
    });
    return await app.request("/auth/login/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
  }
  async function login() {
    const response = await password();
    if (response.status !== 200)
      throw new Error("Fixture login failed");
    const body = await response.json();
    return body.data.token as string;
  }
  const cookie = (response: Response) =>
    /global_session=([^;]+)/u.exec(response.headers.get("set-cookie") ?? "")?.[1];
  return {
    ...composition,
    app,
    scope,
    codes,
    kernel,
    state,
    sourceCounts,
    businessClientCode,
    audits,
    warnings,
    subjectIdentifier,
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
}
