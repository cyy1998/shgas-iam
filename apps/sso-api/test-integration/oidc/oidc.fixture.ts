import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import { createErrorHandler } from "@iam/api-core/middlewares";
import type { ClientSnapshotValue } from "@iam/client-snapshot";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { createClientSecretAuthenticator } from "@iam/client-snapshot/credentials";
import type { SubjectFactsSnapshot } from "@iam/client-subject-projection";
import { ClientSsoProtocol, ClientStatus, OidcClientType, OidcScope } from "@iam/contracts";
import { createUnifiedCustomSsoRedisTestScope } from "@iam/custom-sso/testing";
import { relations } from "@iam/db/relations";
import { createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/documents/user/subject-facts";
import type { OidcAuthorizationOptions } from "@iam/oidc";
import { createOidcClientAuthRateLimiter, createOidcSigningKeys } from "@iam/oidc";
import { createOidcRedisTestScope } from "@iam/oidc/testing";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import type { SubjectAccessOperation } from "@iam/subject-access";
import {
  createSubjectAccessBarrier,
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { createCustomSsoComposition } from "@sso-api/composition/custom-sso";
import { createOidcComposition } from "@sso-api/composition/oidc";
import { createProtocolOperations } from "@sso-api/composition/sessions";
import { signingKeys } from "@sso-api/testing/oidc-signing.fixture";
import { drizzle } from "drizzle-orm/postgres-js";
import { Hono } from "hono";
import postgres from "postgres";
import { createTestUserSession } from "../support/test-user-session.fixture";

export { signingKeys } from "@sso-api/testing/oidc-signing.fixture";

import { ownApiTestExecutor } from "../support/fixture-lifecycle";

const currentJwkJson = signingKeys();
const previousJwkJson = signingKeys("previous");
export async function closeFixtureResources(tasks: Array<() => unknown | Promise<unknown>>) {
  const failures: unknown[] = [];
  for (const task of tasks.toReversed()) {
    try {
      await task();
    } catch (failure) {
      failures.push(failure);
    }
  }
  if (failures.length) throw new AggregateError(failures, "OIDC fixture resource cleanup failed");
}

export async function cleanupAfterFixtureFailure(failure: unknown, close: () => Promise<void>): Promise<never> {
  try {
    await close();
  } catch (cleanupFailure) {
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
  authorization: {
    issuers?: { internal: string; external: string };
    admission?: OidcAuthorizationOptions["admission"];
    wechatQr?: boolean;
  } = {},
) {
  const url = networkUrl ?? process.env.IAM_SSO_API_TEST_REDIS_URL;
  if (!url) throw new Error("IAM_SSO_API_TEST_REDIS_URL is required");
  const issuers = authorization.issuers ?? {
    internal: "https://iam.internal/oidc",
    external: "https://iam.example/oidc",
  };
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
    const oidcState = await createOidcRedisTestScope(url, trackStop);
    const customState = joint ? await createUnifiedCustomSsoRedisTestScope(url, trackStop) : undefined;
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
    const realBarrier =
      networkUrl &&
      createSubjectAccessBarrier({
        store: createRedisSubjectAccessStore({ redis: oidcState.redis, keyPrefix: networkPrefix }),
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
      });
    const factsCache =
      networkUrl && createSubjectFactsRedisCache(oidcState.redis, { keyPrefix: `${networkPrefix}facts:` });
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
    if (sql) resources.push(() => sql.end());
    const realFacts =
      sql && factsCache && createSubjectFactsReader({ db: drizzle({ client: sql, relations }), cache: factsCache });
    if (factsCache) {
      await createSubjectAccessBootstrap({
        redis: oidcState.redis,
        keyPrefix: networkPrefix,
        random: { uuid: () => generation },
      }).seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
      await factsCache.publish({
        kind: "document",
        userId: 1,
        schemaVersion: 1,
        sourceVersion: "1",
        publishedAt: new Date().toISOString(),
        subjectIdentifier,
        facts: { profile: { username: "test", name: "测试", phone: "17721462865" }, employments: [] },
      });
    }
    let client: ClientSnapshotValue = {
      clientCode: clientId,
      status: ClientStatus.Enable,
      ssoEnabled: true,
      admissionEnabled: false,
      admissionFilter: null,
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
        if (state.secretFailure) throw new Error("Secret unavailable");
        return await snapshots.credential.acquire(code);
      },
    });
    const signing = createOidcSigningKeys({ currentJwkJson, previousJwkJson });
    const reports: unknown[] = [];
    const protocolReports: unknown[] = [];
    const logger = {
      info() {},
      warn(report: unknown) {
        if (report && typeof report === "object" && "event" in report && report.event === "oidc_protocol_error") {
          protocolReports.push(report);
        } else {
          reports.push(report);
        }
      },
      error(report: unknown) {
        protocolReports.push(report);
      },
    };
    const barrier = realBarrier || {
      async readCommittedTransitionId() {
        state.reads++;
        if (state.permission === "disabled") throw new SubjectAccessDisabledError();
        if (state.permission === "unknown") throw new SubjectAccessUnavailableError();
        return generation;
      },
    };
    const operations = createProtocolOperations(kernel, barrier);
    const clients = {
      async acquire(code: string) {
        state.acquisitions++;
        if (state.clientFailure) throw new Error("Snapshot unavailable");
        return await snapshots.client.acquire(code);
      },
    };
    const facts = subjectFacts ||
      realFacts || {
        async read() {
          state.factReads++;
          if (!withTokens || state.factFailure) throw new Error("Subject Facts unavailable");
          return {
            subjectIdentifier,
            sourceVersion: "1",
            profile: { username: "test", name: "测试", phone: "17721462865" },
            employments: [],
          };
        },
      };
    const custom =
      customState &&
      createCustomSsoComposition({
        authorization: {
          kernel,
          clients,
          admission: {
            evaluate() {
              throw new Error("Custom SSO admission is not configured in this fixture");
            },
          },
          redis: customState.redis,
          namespace: customState.namespace,
          codeTtlSeconds: ttl.code,
          continuationTtlSeconds: ttl.continuation,
        },
        access: { credentials, tokenTtlSeconds },
        subjectFacts: facts,
        operations,
        logger,
        loginEndpoint: "/portal/login",
        retryAfterSeconds: 3,
      });
    const composition = createOidcComposition({
      operations,
      subjectFacts: facts,
      logger,
      loginEndpoint: "/portal/login",
      secureCookies,
      issuers,
      wechatQrEnabled: authorization.wechatQr,
      trustProxy: trustProxy,
      clientAuthRateLimiter:
        clientAuthWindowSeconds === undefined
          ? undefined
          : createOidcClientAuthRateLimiter({
              redis: {
                async eval(script, count, ...args) {
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
      authorization: {
        kernel,
        clients,
        admission: authorization.admission ?? {
          evaluate() {
            throw new Error("OIDC admission is not configured in this fixture");
          },
        },
        redis: oidcState.adapter,
        namespace: oidcState.namespace,
        codeTtlSeconds: ttl.code,
        continuationTtlSeconds: ttl.continuation,
      },
      logout: { verification: signing, confirmationTtlSeconds: ttl.continuation },
      ...(withTokens
        ? {
            tokens: {
              credentials,
              tokenTtlSeconds,
              failureEffectTimeoutMs: 25,
              signing: {
                jwks: signing.jwks,
                async sign(claims: Record<string, unknown>) {
                  state.signatures++;
                  if (state.signFailure) throw new Error("Signing unavailable");
                  const started = performance.now();
                  const result = await signing.sign(claims);
                  state.signingMs += performance.now() - started;
                  return result;
                },
              },
            },
          }
        : {}),
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
    if (joint) app.onError(createErrorHandler(logger));
    app.route("/oidc", composition.router);
    if (custom) app.route("/sso", custom.router);
    if (stopped) throw new Error("OIDC fixture stopped during initialization");
    const server = withTokens ? Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch }) : undefined;
    if (server) resources.push(() => server.stop(true));
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
        if (match) cookies.set(match[1]!, match[2]!);
      }
    }
    async function request(path: string, options: RequestInit = {}) {
      const input = {
        ...(joint ? { signal: AbortSignal.timeout(5000) } : {}),
        ...options,
        redirect: "manual" as const,
        headers: {
          "X-IAM-Entry-Network": entry,
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          ...options.headers,
        },
      };
      const response = server ? await fetch(`${server.url.origin}${path}`, input) : await app.request(path, input);
      storeCookies(response);
      return response;
    }
    async function login() {
      if (state.loginFailure) throw new Error("OIDC fixture session setup failed");
      const token = await createTestUserSession(kernel, operations, subjectIdentifier);
      cookies.set("global_session", token);
      return token;
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
      ...custom,
      operations,
      issuers,
      setEntry(value: "internal" | "external") {
        entry = value;
      },
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
        otherClients.set(code, { ...client, clientCode: code });
      },
      async setClient(transform: (value: ClientSnapshotValue) => ClientSnapshotValue) {
        client = transform(client);
        await snapshots.invalidateClient(clientId);
      },
    };
  } catch (failure) {
    return await cleanupAfterFixtureFailure(failure, close);
  }
}
