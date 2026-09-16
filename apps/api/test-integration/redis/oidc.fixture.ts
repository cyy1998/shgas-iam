import type { ClientSnapshotValue } from "@iam/api-core/client-snapshot";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { SubjectFactsSnapshot } from "@iam/client-subject-projection";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import process from "node:process";
import { createRootAuthenticationComposition } from "@api/composition/root-authentication";
import { createLoginCredentialParser } from "@api/services/authentication/login-credential.parser";
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
  ClientSsoProtocol,
  ClientStatus,
  createLoginCredential,
  OidcClientType,
  OidcScope,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { createUnifiedCustomSsoRedisTestScope } from "@iam/custom-sso/testing";
import { relations } from "@iam/db/relations";
import { createOidcClientAuthRateLimiter, createOidcSigningKeys } from "@iam/oidc";
import { createOidcRedisTestScope } from "@iam/oidc/testing";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import {
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "@iam/user-profile-read-model/subject-facts";
import { drizzle } from "drizzle-orm/postgres-js";
import { Hono } from "hono";
import postgres from "postgres";
import { sm2 } from "sm-crypto";

export function signingKeys(kid = "current") {
  return JSON.stringify({
    ...generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "jwk" }),
    kid,
    alg: "RS256",
    use: "sig",
  });
}
const currentJwkJson = signingKeys();
const previousJwkJson = signingKeys("previous");
export async function closeFixtureResources(tasks: Array<() => unknown | Promise<unknown>>) {
  const results = await Promise.allSettled(tasks.map(async task => await task()));
  const failures = results.flatMap(result => (result.status === "rejected" ? [result.reason] : []));
  if (failures.length)
    throw new AggregateError(failures, "OIDC fixture resource cleanup failed");
}

export async function cleanupAfterFixtureFailure(
  failure: unknown,
  close: () => Promise<void>,
): Promise<never> {
  try {
    await close();
  }
  catch (cleanupFailure) {
    throw new AggregateError([failure, cleanupFailure], "OIDC fixture initialization and cleanup failed", {
      cause: failure,
    });
  }
  throw failure;
}

export async function fixture(
  ttl = { code: 30, continuation: 60 },
  withTokens = false,
  networkUrl?: string,
  tokenTtlSeconds = 45,
  subjectFacts?: { read: (subjectIdentifier: string) => Promise<SubjectFactsSnapshot | null> },
  secureCookies = true,
  clientAuthWindowSeconds?: number,
  trustProxy = true,
  joint = false,
  issuers = { internal: "https://iam.internal/oidc", external: "https://iam.example/oidc" },
) {
  const url = networkUrl ?? process.env.IAM_API_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_API_TEST_REDIS_URL is required");
  const resources: Array<() => unknown | Promise<unknown>> = [];
  const close = () => closeFixtureResources(resources);
  try {
    const scope = await createUnifiedSessionRedisTestScope(url, { user: 120, client: 60 });
    resources.push(() => scope.close());
    const oidcState = await createOidcRedisTestScope(url);
    const oidcKeys = new Set<string>();
    resources.push(async () => {
      const results = await Promise.allSettled(
        [...oidcKeys].map(async key => await oidcState.redis.del(key)),
      );
      const closing = await Promise.allSettled([oidcState.close()]);
      const failures = [...results, ...closing].flatMap(result =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (failures.length)
        throw new AggregateError(failures, "OIDC fixture state cleanup failed");
    });
    const customState = joint ? await createUnifiedCustomSsoRedisTestScope(url) : undefined;
    if (customState)
      resources.push(() => customState.close());
    const kernel = scope.createFactoryForOperations<SubjectAccessOperation>(requireSubjectAccessOperation);
    const clientId = `oidc-${randomUUID()}`;
    const subjectIdentifier = randomUUID();
    const generation = randomUUID();
    const state = {
      permission: "enabled",
      reads: 0,
      acquisitions: 0,
      sourceReads: 0,
      clientFailure: false,
      credentialReads: 0,
      secretFailure: false,
      factReads: 0,
      factFailure: false,
      signFailure: false,
      signatures: 0,
      signingMs: 0,
      factsSql: 0,
      loginFailure: false,
      failClientAuthClear: false,
    };
    const networkPrefix = `${oidcState.namespace}:network:`;
    oidcKeys.add(`${networkPrefix}record:${subjectIdentifier}`);
    oidcKeys.add(`${networkPrefix}facts:${subjectIdentifier}`);
    const ownClient = (code: string) => {
      const keys = clientSnapshotKeys(code);
      oidcKeys.add(keys.control);
      keys.payloads.forEach(key => oidcKeys.add(key));
    };
    ownClient(clientId);
    const realBarrier
      = networkUrl
        && createSubjectAccessBarrier({
          store: createRedisSubjectAccessStore({ redis: oidcState.redis, keyPrefix: networkPrefix }),
          clock: { nowDate: () => new Date() },
          random: { uuid: randomUUID },
        });
    const factsCache
      = networkUrl && createSubjectFactsRedisCache(oidcState.redis, { keyPrefix: `${networkPrefix}facts:` });
    const sql = networkUrl
      ? postgres({
          host: "127.0.0.1",
          port: 1,
          connect_timeout: 1,
          debug() {
            state.factsSql++;
          },
        })
      : undefined;
    if (sql)
      resources.push(() => sql.end());
    const realFacts
      = sql
        && factsCache
        && createSubjectFactsReader({ db: drizzle({ client: sql, relations }), cache: factsCache });
    if (factsCache) {
      await createSubjectAccessBootstrap({
        redis: oidcState.redis,
        keyPrefix: networkPrefix,
        random: { uuid: () => generation },
      }).seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
      await factsCache.publish({
        schemaVersion: 3,
        sourceDirtyVersion: "1",
        publishedAt: new Date().toISOString(),
        subjectIdentifier,
        profile: { username: "test", name: "测试", phone: "17721462865" },
        facts: { employments: [] },
      });
    }
    let client: ClientSnapshotValue = {
      clientCode: clientId,
      status: ClientStatus.Enable,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.Oidc,
        clientType: OidcClientType.Public,
        redirectUris: ["https://rp.example/callback"],
        postLogoutRedirectUris: [],
        allowedScopes: [
          OidcScope.OpenId,
          OidcScope.Profile,
          OidcScope.Phone,
          OidcScope.IamEmployments,
          OidcScope.IamAuthorization,
        ],
      },
    };
    const otherClients = new Map<string, ClientSnapshotValue>();
    const snapshots = createClientSnapshots({
      redis: oidcState.redis,
      source: {
        async loadClient(code) {
          state.sourceReads++;
          return code === clientId ? client : (otherClients.get(code) ?? null);
        },
        async loadCredential() {
          state.credentialReads++;
          return {
            secret: "current secret:+",
            credentialId: generation,
            updatedAt: new Date().toISOString(),
          };
        },
      },
    });
    const credentials = createClientSecretAuthenticator({
      async acquire(code) {
        if (state.secretFailure)
          throw new Error("Secret unavailable");
        return await snapshots.credential.acquire(code);
      },
    });
    const signing = createOidcSigningKeys({ currentJwkJson, previousJwkJson });
    const user = {
      id: 1,
      subjectIdentifier,
      username: "test",
      name: "测试",
      mobile: "17721462865",
      wxId: "test",
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
    const keys = sm2.generateKeyPairHex();
    const now = 1700000000000;
    const nonces = new Set<string>();
    const reports: unknown[] = [];
    const protocolReports: unknown[] = [];
    const logger = {
      info() {},
      warn(report: unknown) {
        if (
          report
          && typeof report === "object"
          && "event" in report
          && report.event === "oidc_protocol_error"
        ) {
          protocolReports.push(report);
        }
        else {
          reports.push(report);
        }
      },
      error(report: unknown) {
        protocolReports.push(report);
      },
    };
    const composition = createRootAuthenticationComposition({
      kernel,
      ...(customState
        ? {
            customSso: {
              redis: customState.redis,
              namespace: customState.namespace,
              codeTtlSeconds: ttl.code,
              continuationTtlSeconds: ttl.continuation,
              trustedIamOrigins: ["https://iam.example"],
              managedCallbackUrls: ["https://iam.example/sso/callback"],
            },
            customSsoAccess: { credentials, tokenTtlSeconds },
          }
        : {}),
      oidcTrustProxy: trustProxy,
      oidcClientAuth:
        clientAuthWindowSeconds === undefined
          ? undefined
          : createOidcClientAuthRateLimiter({
              redis: {
                async eval(script, count, ...args) {
                  args.slice(0, count).forEach(key => oidcKeys.add(key));
                  if (state.failClientAuthClear && script === "return redis.call('DEL',KEYS[1])") {
                    state.failClientAuthClear = false;
                    throw new Error("Injected Client authentication clear failure");
                  }
                  return await oidcState.adapter.eval(script, count, ...args);
                },
              },
              namespace: oidcState.namespace,
              windowSeconds: clientAuthWindowSeconds,
            }),
      oidc: {
        redis: oidcState.adapter,
        namespace: oidcState.namespace,
        codeTtlSeconds: ttl.code,
        continuationTtlSeconds: ttl.continuation,
        issuers,
        secureCookies,
      },
      oidcLogout: { verification: signing, confirmationTtlSeconds: ttl.continuation },
      ...(withTokens
        ? {
            oidcTokens: {
              credentials,
              tokenTtlSeconds,
              failureEffectTimeoutMs: 25,
              signing: {
                jwks: signing.jwks,
                async sign(claims: Record<string, unknown>) {
                  state.signatures++;
                  if (state.signFailure)
                    throw new Error("Signing unavailable");
                  const started = performance.now();
                  const result = await signing.sign(claims);
                  state.signingMs += performance.now() - started;
                  return result;
                },
              },
            },
          }
        : {}),
      barrier: realBarrier || {
        async readCommittedTransitionId() {
          state.reads++;
          if (state.permission === "disabled")
            throw new SubjectAccessDisabledError();
          if (state.permission === "unknown")
            throw new SubjectAccessUnavailableError();
          return generation;
        },
      },
      clients: {
        async acquire(code) {
          ownClient(code);
          state.acquisitions++;
          if (state.clientFailure)
            throw new Error("Snapshot unavailable");
          return await snapshots.client.acquire(code);
        },
      },
      subjectFacts: subjectFacts
        || realFacts || {
        async read() {
          state.factReads++;
          if (!withTokens || state.factFailure)
            throw new Error("Subject Facts unavailable");
          return {
            subjectIdentifier,
            sourceDirtyVersion: "1",
            profile: { username: "test", name: "测试", phone: "17721462865" },
            employments: [],
          };
        },
      },
      loginCredentialParser: createLoginCredentialParser({
        clock: { now: () => now },
        nonceStore: {
          async set(key) {
            if (nonces.has(key))
              return null;
            nonces.add(key);
            return "OK";
          },
        },
        config: { privateKeysByKid: { test: keys.privateKey }, maxSkewMs: 60000, nonceTtlSeconds: 120 },
      }),
      internalClients: { getClientBySecret: async () => null },
      logger,
      config: {
        redisExpireSeconds: 999,
        projectionRetryAfterSeconds: 3,
        loginEndpoint: "/portal/login",
      },
      authentication: {
        auditLogWriter: { async recordAuditLog() {} },
        runtime: {
          clock: { now: () => now },
          config: { auth: { magicCode: "test" }, env: { nodeEnv: "production" } },
          redis: { get: async () => null, del: async () => 0, set: async () => "OK" },
          integrations: {
            wechat: {
              async getWxUserId() {
                return "test";
              },
            },
          },
        },
        services: {
          cap: { async ensureActionAllowed() {} },
          client: {
            async getClientByCode() {
              return { clientSecret: "unused" };
            },
          },
          humanRisk: { async recordLoginFailure() {} },
          loginRestriction: {
            async getRestriction() {
              return null;
            },
            async clearLoginState() {},
            async recordFailure() {
              return { failureCount: 1, remainingAttempts: 3, restriction: null };
            },
          },
          mobile: {
            async consumeVerificationCode() {
              return true;
            },
          },
          user: {
            async checkPassword(_username, password) {
              return password === "password" && !state.loginFailure;
            },
            getActiveUserByUsername: async () => user,
            getActiveUserByMobile: async () => user,
            getActiveUserByWxId: async () => user,
            getActiveUserById: async () => user,
            getUserDetailById: async () => user,
          },
        },
      },
    });
    // Observe the public delivery value before HTTP finalization; keep real owner persistence and failure handling.
    const preparedAccessTokens: string[] = [];
    if (composition.oidcTokens) {
      const forOperation = composition.oidcTokens.forOperation.bind(composition.oidcTokens);
      composition.oidcTokens.forOperation = (operation, issuer) => {
        const scope = forOperation(operation, issuer);
        return {
          ...scope,
          async exchange(input, deliver) {
            return await scope.exchange(input, async (value) => {
              preparedAccessTokens.push(value.access_token);
              return await deliver(value);
            });
          },
        };
      };
    }
    const app = new Hono();
    if (joint)
      app.onError(createErrorHandler(logger));
    app.route("/", composition.router);
    const server = withTokens ? Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch }) : undefined;
    if (server)
      resources.push(() => server.stop(true));
    const challenge = createHash("sha256").update("v".repeat(43)).digest("base64url");
    const parameters = (extra: Record<string, string> = {}) =>
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: "https://rp.example/callback",
        response_type: "code",
        scope: "openid profile",
        state: "rp-state",
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...extra,
      });
    let entry: "internal" | "external" = "external";
    const cookies = new Map<string, string>();
    function storeCookies(response: Response) {
      for (const header of response.headers.getSetCookie()) {
        const match = /^([^=]+)=([^;]*)/u.exec(header);
        if (match)
          cookies.set(match[1]!, match[2]!);
      }
    }
    async function request(path: string, options: RequestInit = {}) {
      const input = {
        ...(joint ? { signal: AbortSignal.timeout(5000) } : {}),
        ...options,
        redirect: "manual" as const,
        headers: {
          "X-IAM-Entry-Network": entry,
          "Cookie": [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          ...options.headers,
        },
      };
      const response = server
        ? await fetch(`${server.url.origin}${path}`, input)
        : await app.request(path, input);
      storeCookies(response);
      return response;
    }
    async function login() {
      const credential = createLoginCredential({
        username: "test",
        password: "password",
        kid: "test",
        publicKey: keys.publicKey,
        now,
        nonce: randomUUID(),
      });
      const response = await request("/auth/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (response.status !== 200)
        throw new Error("OIDC fixture password login failed");
      return cookies.get("global_session")!;
    }
    async function authorize(extra: Record<string, string> = {}, method = "GET") {
      const params = parameters(extra);
      return method === "GET"
        ? await request(`/oidc/auth?${params}`)
        : await request("/oidc/auth", {
            method,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
          });
    }
    return {
      ...composition,
      issuers,
      setEntry(value: "internal" | "external") { entry = value; },
      app,
      preparedAccessTokens,
      reports,
      protocolReports,
      oidcState,
      customState,
      scope,
      kernel,
      state,
      clientId,
      subjectIdentifier,
      cookies,
      login,
      authorize,
      request,
      parameters,
      signing,
      close,
      httpOrigin: server?.url.origin,
      addClient(code: string) {
        ownClient(code);
        otherClients.set(code, { ...client, clientCode: code });
      },
      async setClient(transform: (value: ClientSnapshotValue) => ClientSnapshotValue) {
        client = transform(client);
        await snapshots.invalidateClient(clientId);
      },
    };
  }
  catch (failure) {
    return await cleanupAfterFixtureFailure(failure, close);
  }
}
