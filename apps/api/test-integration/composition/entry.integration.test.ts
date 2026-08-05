import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import type { SubjectFactsCacheRecordV1 } from "@iam/user-profile-read-model/subject-facts";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  invalidateCustomSsoClientRuntime,
} from "@iam/api-core/custom-sso";
import { hashSecret } from "@iam/api-core/security";
import { createSessionKernel } from "@iam/api-core/session/kernel";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
  createSubjectAccessPrincipalValidator,
} from "@iam/api-core/subject-access";
import {
  createCustomSsoCleanupRedisHarness,
  resolveCustomSsoCleanupRedisResource,
} from "@iam/api-core/testing/custom-sso-cleanup-redis-harness";
import {
  cleanupRedisKeysMatchingOwnerMarkers,
  createRedisKeyInventoryPort,
  parseDedicatedRedisTestUrl,
  requireDedicatedPostgresTestUrl,
  requireExternalTestUrl,
  runWithOwnedTestResources,
} from "@iam/api-core/testing/external-test-resources";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  FatalReadinessError,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import {
  ApiErrorCode,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import {
  createSubjectFactsRedisInspector,
  createSubjectFactsRedisPublisher,
} from "@iam/user-profile-read-model/subject-facts";
import { afterEach, describe, expect, test } from "bun:test";
import Redis from "ioredis";
import postgres from "postgres";

const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
const databaseUrlName = "IAM_API_TEST_DATABASE_URL";
const redisUrlName = "IAM_API_TEST_REDIS_URL";
const databaseUrl = requireDedicatedPostgresTestUrl({
  forbidden: [
    { name: "DATABASE_URL", value: process.env.DATABASE_URL },
    { name: "IAM_API_DATABASE_URL", value: process.env.IAM_API_DATABASE_URL },
  ],
  name: databaseUrlName,
  value: requireExternalTestUrl({
    environment: process.env,
    lane: "the explicit API external lane",
    name: databaseUrlName,
  }),
});
const redisUrl = requireExternalTestUrl({
  environment: process.env,
  lane: "the explicit API external lane",
  name: redisUrlName,
});
const redisConfig = parseDedicatedRedisTestUrl({
  name: redisUrlName,
  value: redisUrl,
});
const cleanupRedisResource = resolveCustomSsoCleanupRedisResource(process.env);
const lookupHmacId = "entry-external";
const lookupHmacSecret = "api-entry-external-secret-that-is-at-least-32-bytes";
const loginCredentialPrivateKey = "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65";
const subjectIdentifier = randomUUID();
const resourceSuffix = subjectIdentifier.replaceAll("-", "");
const clientCode = `ticket01-independent-${resourceSuffix}`;
const gatewayClientCode = `ticket01-public-gateway-${resourceSuffix}`;
const originalSecret = "ticket12-original-secret";
const rotatedSecret = "ticket12-rotated-secret";
const callbackEndpoint = "https://ticket12-independent.example.test/callback";
const redirectUri = "https://ticket12-independent.example.test/complete";
const gatewayRetryRedirectUri = "https://ticket12-gateway.example.test/pnr-complete";
const legacyGlobalSessionId = `legacy-global-${resourceSuffix}`;
const legacyAuthorizationCode = `legacy-code-${resourceSuffix}`;
const legacyLocalSessionId = `legacy-local-${resourceSuffix}`;
const legacyPayloadRef = `legacy-payload-${resourceSuffix}`;
const legacyPayloadKey = `custom-sso:local-session-payload:${legacyPayloadRef}`;
const legacyRedirectUri = "https://ticket12-gateway.example.test/legacy-complete";
const cleanupSentinelKey = `iam:test:cleanup:sentinel:${resourceSuffix}`;
const legacyArtifactEntries = new Map([
  [`global_session:${legacyGlobalSessionId}`, "legacy-principal-session"],
  [`auth_code:${legacyAuthorizationCode}`, "legacy-authorization-grant"],
  [`local_${gatewayClientCode}_session:${legacyLocalSessionId}`, "legacy-local-session"],
  [`local_session_reverse:${legacyLocalSessionId}`, "legacy-reverse-index"],
  [`local_session_set:${legacyGlobalSessionId}`, "legacy-session-set"],
  [legacyPayloadKey, "legacy-payload"],
]);
const userId = 900_098;
const sourceDirtyVersion = "98";
const externalEntry = createProcessSmokeSuite({
  label: "API explicit external entry",
  temporaryDirectoryPrefix: "iam-api-entry-external-",
  hostname: "localhost",
});

afterEach(externalEntry.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(
  context: ProcessSmokeAttemptContext,
  namespace: string,
) {
  const origin = entryOrigin(context);
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_API_DATABASE_URL: databaseUrl,
      IAM_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_API_SMS_SIGNATURE_KEY: "unreachable-external-signature",
      IAM_API_SMS_URL: "http://127.0.0.1:1/sms",
      IAM_API_SESSION_DEFAULT_TTL_SECONDS: "3600",
      IAM_API_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS: "3600",
      IAM_API_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS: "3600",
      IAM_API_AUTH_CODE_TTL_SECONDS: "300",
      IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: "7",
      IAM_API_ORCAS_URL: "http://127.0.0.1:1/orcas",
      IAM_API_PORT: String(context.port),
      IAM_API_WECHAT_CORP_ID: "unreachable-external-corp",
      IAM_API_WECHAT_CORP_SECRET: "unreachable-external-secret",
      IAM_API_MAGIC_CODE: "000000",
      IAM_API_REDIS_HOST: redisConfig.host,
      IAM_API_REDIS_PORT: String(redisConfig.port),
      IAM_API_REDIS_PASSWORD: redisConfig.password,
      IAM_API_REDIS_DB: String(redisConfig.db),
      IAM_API_LOGIN_ENDPOINT: "/login",
      IAM_API_SSO_INTERNAL_ORIGIN: origin,
      IAM_API_SSO_EXTERNAL_ORIGIN: origin,
      IAM_API_AUTHORIZATION_ENDPOINT: "/sso/authorize",
      IAM_API_LOGOUT_ENDPOINT: "/sso/logout",
      IAM_API_THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
      IAM_API_LOG_LEVEL: "info",
      IAM_API_LOG_FORMAT: "json",
      IAM_API_CAP_ENABLED: "false",
      IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "entry-external",
      IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({
        "entry-external": loginCredentialPrivateKey,
      }),
      IAM_API_SESSION_KERNEL_NAMESPACE: namespace,
      IAM_API_SESSION_LOOKUP_HMAC_CURRENT_ID: lookupHmacId,
      IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: lookupHmacSecret,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

async function probeApiDocs(origin: string, signal: AbortSignal) {
  const response = await fetch(`${origin}/public/doc`, { signal });
  if (response.status !== 200)
    return false;
  const document = await response.json() as Record<string, unknown>;
  if (document.openapi !== "3.1.0") {
    throw new PortCollisionError(
      "port did not serve the API OpenAPI document",
    );
  }
  return true;
}

async function authorize(
  origin: string,
  state: string,
  principalToken: string,
  signal: AbortSignal,
) {
  const url = new URL(`${origin}/sso/authorize`);
  url.search = new URLSearchParams({
    client: clientCode,
    redirectUrl: redirectUri,
    state,
  }).toString();
  const response = await fetch(url, {
    headers: { cookie: `global_session=${principalToken}` },
    redirect: "manual",
    signal,
  });
  const location = response.headers.get("location");
  if (response.status !== 302 || location === null) {
    throw new FatalReadinessError(
      `Independent authorize returned unexpected ${response.status}/${location}`,
    );
  }
  const callback = new URL(location);
  const code = callback.searchParams.get("code");
  if (
    callback.origin + callback.pathname !== callbackEndpoint
    || callback.searchParams.get("client") !== clientCode
    || callback.searchParams.get("redirectUrl") !== redirectUri
    || callback.searchParams.get("state") !== state
    || code === null
  ) {
    throw new FatalReadinessError("Independent authorize did not preserve its callback contract");
  }
  return { code, status: response.status };
}

async function exchange(
  origin: string,
  code: string,
  secret: string,
  signal: AbortSignal,
) {
  const response = await fetch(`${origin}/sso/token`, {
    body: new URLSearchParams({ code, redirect_uri: redirectUri }),
    headers: {
      "Authorization": `Basic ${Buffer.from(`${clientCode}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal,
  });
  return {
    body: await response.json() as Record<string, unknown>,
    retryAfter: response.headers.get("retry-after"),
    setCookie: response.headers.get("set-cookie"),
    status: response.status,
  };
}

function createProductionOwnerSeed(redis: Redis, namespace: string) {
  const random = { uuid: randomUUID };
  const subjectAccessBootstrap = createSubjectAccessBootstrap({
    random,
    redis,
  });
  const subjectAccess = createSubjectAccessBarrier({
    clock: { nowDate: () => new Date() },
    random,
    store: createRedisSubjectAccessStore({ redis }),
  });
  const sessionKernel = createSessionKernel({
    redis: redis as SessionKernelRedis,
    config: {
      namespace,
      principalIdleTtlMs: 60 * 60 * 1_000,
      principalAbsoluteTtlMs: 60 * 60 * 1_000,
      lookupHmacKeys: {
        current: {
          id: lookupHmacId,
          secret: lookupHmacSecret,
        },
      },
    },
    principalAccessFence: createSubjectAccessPrincipalValidator(subjectAccess),
  });
  return {
    sessionKernel,
    subjectAccess,
    subjectAccessBootstrap,
    subjectFacts: createSubjectFactsRedisPublisher(redis),
    subjectFactsInspector: createSubjectFactsRedisInspector(redis),
  };
}

async function seedPrincipalSession(
  owners: ReturnType<typeof createProductionOwnerSeed>,
  diagnosticLabel: string,
) {
  const principal = await owners.sessionKernel.createPrincipalSession(
    subjectIdentifier,
    { amr: ["password"], sessionKind: "browser_user" },
  );
  if (principal.status !== "created")
    throw new Error(`${diagnosticLabel} seed failed: ${principal.status}`);
  if (principal.externalToken === undefined)
    throw new Error(`${diagnosticLabel} seed returned no external token`);
  return {
    externalToken: principal.externalToken,
    session: principal.value,
  };
}

async function seedLogoutSession(
  owners: ReturnType<typeof createProductionOwnerSeed>,
) {
  const principal = await seedPrincipalSession(
    owners,
    "API composition logout Principal Session",
  );
  const binding = await owners.sessionKernel.createClientBinding({
    cleanupRefs: [{
      protocol: "custom-sso",
      kind: "local_session_payload",
      ref: legacyPayloadRef,
    }],
    clientCode,
    metadata: {
      version: 1,
      mode: CustomSsoClientMode.Independent,
      configVersion: 1,
    },
    principalSessionId: principal.session.principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
  });
  if (binding.status !== "created")
    throw new Error(`API composition logout binding seed failed: ${binding.status}`);
  return {
    bindingId: binding.value.bindingId,
    externalToken: principal.externalToken,
  };
}

async function seedExternalSessionState(
  owners: ReturnType<typeof createProductionOwnerSeed>,
) {
  const bootstrap = await owners.subjectAccessBootstrap.seedMany([{
    state: "enabled",
    subjectIdentifier,
  }], new Date());
  if (bootstrap.seeded !== 1)
    throw new Error("API composition Subject Access fixture was not newly seeded");
  const principal = await seedPrincipalSession(
    owners,
    "API composition Independent Principal Session",
  );
  const facts = await owners.subjectFacts.publish(
    subjectFactsRecord(sourceDirtyVersion, "Ticket 12 User"),
  );
  if (facts.status !== "published")
    throw new Error(`API composition Subject Facts seed failed: ${facts.status}`);
  return {
    principalToken: principal.externalToken,
  };
}

async function seedGatewayPublicEntry(
  owners: ReturnType<typeof createProductionOwnerSeed>,
) {
  const metadata = {
    version: 1,
    mode: CustomSsoClientMode.Gateway,
    configVersion: 1,
  };
  const principal = await seedPrincipalSession(
    owners,
    "API composition Gateway Principal Session",
  );
  const binding = await owners.sessionKernel.createClientBinding({
    clientCode: gatewayClientCode,
    metadata,
    principalSessionId: principal.session.principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
  });
  if (binding.status !== "created")
    throw new Error(`API composition Gateway Client Binding seed failed: ${binding.status}`);
  const credential = await owners.sessionKernel.issueCredential({
    bindingId: binding.value.bindingId,
    clientCode: gatewayClientCode,
    credentialType: "local_session",
    metadata: { ...metadata, orcasId: `orcas-${resourceSuffix}` },
    principalSessionId: principal.session.principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    tokenKind: "localSession",
  });
  if (credential.status !== "created")
    throw new Error(`API composition Gateway Local Session seed failed: ${credential.status}`);
  if (credential.externalToken === undefined)
    throw new Error("API composition Gateway Local Session seed returned no external token");

  const staleMetadata = { ...metadata, configVersion: 0 };
  const staleBinding = await owners.sessionKernel.createClientBinding({
    clientCode: gatewayClientCode,
    metadata: staleMetadata,
    principalSessionId: principal.session.principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
  });
  if (staleBinding.status !== "created") {
    throw new Error(
      `API composition stale Gateway Client Binding seed failed: ${staleBinding.status}`,
    );
  }
  const staleCredential = await owners.sessionKernel.issueCredential({
    bindingId: staleBinding.value.bindingId,
    clientCode: gatewayClientCode,
    credentialType: "local_session",
    metadata: staleMetadata,
    principalSessionId: principal.session.principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    tokenKind: "localSession",
  });
  if (staleCredential.status !== "created") {
    throw new Error(
      `API composition stale Gateway Local Session seed failed: ${staleCredential.status}`,
    );
  }
  if (staleCredential.externalToken === undefined) {
    throw new Error(
      "API composition stale Gateway Local Session seed returned no external token",
    );
  }
  return {
    localToken: credential.externalToken,
    principalToken: principal.externalToken,
    staleLocalToken: staleCredential.externalToken,
  };
}

function subjectFactsRecord(version: string, name: string): SubjectFactsCacheRecordV1 {
  return {
    schemaVersion: 1,
    sourceDirtyVersion: version,
    publishedAt: new Date().toISOString(),
    subjectIdentifier,
    profile: {
      username: "ticket12-user",
      name,
      phone: null,
    },
    facts: {
      employments: [{
        isPrimary: true,
        organization: {
          code: "ticket12-department",
          name: "Ticket 12 Department",
          type: "department",
          path: [{
            code: "ticket12-department",
            name: "Ticket 12 Department",
            type: "department",
          }],
        },
        position: { code: "engineer", name: "Engineer" },
        clientAuthorizations: [{
          clientCode,
          roles: [{ code: "ticket12:user", privileges: ["ticket12:read"] }],
        }],
      }],
    },
  };
}

async function publicUserInfo(
  origin: string,
  signal: AbortSignal,
  localToken: string,
) {
  const response = await fetch(`${origin}/public/user-info`, {
    headers: {
      Client: gatewayClientCode,
      Cookie: `local_${gatewayClientCode}_session=${localToken}`,
    },
    signal,
  });
  return {
    body: await response.json() as Record<string, unknown>,
    retryAfter: response.headers.get("retry-after"),
    setCookie: response.headers.get("set-cookie"),
    status: response.status,
  };
}

async function gatewayAuthz(
  origin: string,
  signal: AbortSignal,
  localToken: string,
) {
  const response = await fetch(`${origin}/auth/authz`, {
    headers: {
      "Client": gatewayClientCode,
      "Cookie": `local_${gatewayClientCode}_session=${localToken}`,
      "X-Forwarded-Uri": "/gateway/composition",
    },
    signal,
  });
  const body = await response.json() as Record<string, unknown>;
  const encoded = response.headers.get("X-User-Info");
  if (
    response.status !== 200
    || body.code !== 200
    || typeof body.data !== "string"
    || encoded !== body.data
  ) {
    throw new FatalReadinessError(
      `Gateway authz projection returned unexpected ${response.status}/${String(body.code)}`,
    );
  }
  try {
    return {
      body,
      decoded: JSON.parse(
        Buffer.from(encoded, "base64").toString("utf8"),
      ) as Record<string, unknown>,
      setCookie: response.headers.get("set-cookie"),
      status: response.status,
    };
  }
  catch (error) {
    throw new FatalReadinessError(
      "Gateway authz projection was not valid Base64 JSON",
      { cause: error },
    );
  }
}

async function logoutPrincipalSession(
  origin: string,
  signal: AbortSignal,
  principalToken: string,
) {
  const redirectUrl = `${origin}/logout-complete`;
  const url = new URL(`${origin}/sso/logout`);
  url.search = new URLSearchParams({
    redirectUrl,
    token: principalToken,
  }).toString();
  const response = await fetch(url, { redirect: "manual", signal });
  return {
    location: response.headers.get("location"),
    status: response.status,
  };
}

async function createClientNotificationObserver() {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.writeHead(204);
    response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (typeof address !== "object" || address === null)
    throw new Error("API composition client notification observer did not bind a port");
  return {
    close: async () => await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
    endpoint: `http://127.0.0.1:${address.port}/legacy-client-logout`,
    requests,
  };
}

async function probeLegacyArtifactRejection(
  origin: string,
  signal: AbortSignal,
) {
  const authorizeUrl = new URL(`${origin}/sso/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client: gatewayClientCode,
    redirectUrl: legacyRedirectUri,
    token: legacyGlobalSessionId,
  }).toString();
  const authorize = await fetch(authorizeUrl, { redirect: "manual", signal });
  const authorizeLocation = authorize.headers.get("location");

  const callbackUrl = new URL(`${origin}/sso/callback`);
  callbackUrl.search = new URLSearchParams({
    client: gatewayClientCode,
    code: legacyAuthorizationCode,
    redirectUrl: legacyRedirectUri,
  }).toString();
  const callback = await fetch(callbackUrl, { redirect: "manual", signal });
  const legacyCookie = `local_${gatewayClientCode}_session=${legacyLocalSessionId}`;
  const userInfo = await fetch(`${origin}/public/user-info`, {
    headers: { Client: gatewayClientCode, Cookie: legacyCookie },
    signal,
  });
  const authz = await fetch(`${origin}/auth/authz`, {
    headers: {
      "Client": gatewayClientCode,
      "Cookie": legacyCookie,
      "X-Forwarded-Uri": "/gateway/legacy-cutover-composition",
    },
    signal,
  });

  return {
    authorizeRedirectedToLogin: authorize.status === 302
      && authorizeLocation !== null
      && new URL(authorizeLocation, origin).pathname === "/login",
    authorizeStatus: authorize.status,
    authzStatus: authz.status,
    callbackStatus: callback.status,
    userInfoStatus: userInfo.status,
  };
}

async function probeGatewayProjectionRetry(
  origin: string,
  signal: AbortSignal,
  sql: ReturnType<typeof postgres>,
  gatewayPrincipalToken: string,
  registerAuthorizationCode: (code: string) => Promise<void>,
) {
  const authorizeUrl = new URL(`${origin}/sso/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client: gatewayClientCode,
    redirectUrl: gatewayRetryRedirectUri,
    state: "gateway-pnr-retry-state",
  }).toString();
  const authorizeResponse = await fetch(authorizeUrl, {
    headers: { cookie: `global_session=${gatewayPrincipalToken}` },
    redirect: "manual",
    signal,
  });
  const callbackLocation = authorizeResponse.headers.get("location");
  if (authorizeResponse.status !== 302 || callbackLocation === null) {
    throw new FatalReadinessError(
      `Gateway PNR authorize returned unexpected ${authorizeResponse.status}`,
    );
  }
  const issuedCallback = new URL(callbackLocation);
  const authorizationCode = issuedCallback.searchParams.get("code");
  if (authorizationCode === null)
    throw new FatalReadinessError("Gateway PNR authorize returned no code");
  await registerAuthorizationCode(authorizationCode);
  const localCallback = new URL(
    `${issuedCallback.pathname}${issuedCallback.search}`,
    origin,
  );
  const loginCallback = await fetch(localCallback, {
    headers: { cookie: `global_session=${gatewayPrincipalToken}` },
    redirect: "manual",
    signal,
  });
  const loginLocation = loginCallback.headers.get("location");
  if (loginCallback.status !== 302 || loginLocation === null) {
    throw new FatalReadinessError(
      `Gateway PNR login callback returned unexpected ${loginCallback.status}`,
    );
  }
  const completed = new URL(loginLocation);
  const localToken = completed.searchParams.get("token");
  if (
    completed.origin + completed.pathname !== gatewayRetryRedirectUri
    || completed.searchParams.get("state") !== "gateway-pnr-retry-state"
    || localToken === null
  ) {
    throw new FatalReadinessError(
      "Gateway PNR login did not deliver the original flow",
    );
  }

  await sql`
    UPDATE user_profile_dirty
    SET status = 'processing',
        processed_at = NULL,
        update_time = NOW()
    WHERE user_id = ${userId}
  `;
  const firstUserInfo = await publicUserInfo(origin, signal, localToken);

  await sql`
    UPDATE user_profile_dirty
    SET status = 'processed',
        processed_at = NOW(),
        update_time = NOW()
    WHERE user_id = ${userId}
  `;
  const retryUserInfo = await publicUserInfo(origin, signal, localToken);
  const retryData = retryUserInfo.body.data as Record<string, unknown> | undefined;

  return {
    firstUserInfo,
    loginCallback: {
      setCookie: loginCallback.headers.get("set-cookie"),
      status: loginCallback.status,
    },
    retryUserInfo: {
      setCookie: retryUserInfo.setCookie,
      status: retryUserInfo.status,
      subjectIdentifier: retryData?.subjectIdentifier,
    },
  };
}

async function probeIndependentGrantProjectionRetry(
  origin: string,
  signal: AbortSignal,
  sql: ReturnType<typeof postgres>,
  principalToken: string,
  registerAuthorizationCode: (code: string) => Promise<void>,
) {
  const grant = await authorize(
    origin,
    "independent-pnr-retry-state",
    principalToken,
    signal,
  );
  await registerAuthorizationCode(grant.code);
  await sql`
    UPDATE user_profile_dirty
    SET status = 'processing',
        processed_at = NULL,
        update_time = NOW()
    WHERE user_id = ${userId}
  `;
  const firstExchange = await exchange(
    origin,
    grant.code,
    originalSecret,
    signal,
  );

  await sql`
    UPDATE user_profile_dirty
    SET status = 'processed',
        processed_at = NOW(),
        update_time = NOW()
    WHERE user_id = ${userId}
  `;
  const retryExchange = await exchange(
    origin,
    grant.code,
    originalSecret,
    signal,
  );
  const retryData = retryExchange.body.data as Record<string, unknown> | undefined;
  const retrySubject = retryData?.subject as Record<string, unknown> | undefined;

  return {
    firstExchange,
    retryExchange: {
      setCookie: retryExchange.setCookie,
      status: retryExchange.status,
      subjectIdentifier: retrySubject?.subjectIdentifier,
    },
  };
}

describe("API explicit external entry", () => {
  test("runs Independent rotation/replay and public Subject Access through real PostgreSQL and Redis", async () => {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const sql = postgres(databaseUrl, { max: 1 });
      registerCleanup(async () => await sql.end({ timeout: 5 }));
      registerCleanup(async () => {
        await sql.begin(async (transaction) => {
          await transaction`DELETE FROM user_profile_dirty WHERE user_id = ${userId}`;
          await transaction`DELETE FROM user_profile WHERE user_id = ${userId} OR subject_identifier = ${subjectIdentifier}`;
          await transaction`
            DELETE FROM client
            WHERE client_code IN (${clientCode}, ${gatewayClientCode})
          `;
        });
      });
      const redis = new Redis(redisUrl, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
      });
      registerCleanup(() => redis.disconnect());
      const observerRedis = new Redis(redisUrl, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
      });
      registerCleanup(() => observerRedis.disconnect());
      const cleanupHarness = await createCustomSsoCleanupRedisHarness(
        cleanupRedisResource,
      );
      registerCleanup(async () => await cleanupHarness.close());
      const notificationObserver = await createClientNotificationObserver();
      registerCleanup(async () => await notificationObserver.close());
      const redisInventory = createRedisKeyInventoryPort(observerRedis);
      const namespace = `sess:api-real-entry:${resourceSuffix}:`;
      const ownedRedisMarkers = new Set([
        namespace,
        subjectIdentifier,
        clientCode,
        gatewayClientCode,
        legacyGlobalSessionId,
        legacyAuthorizationCode,
        legacyLocalSessionId,
        legacyPayloadRef,
      ]);
      registerCleanup(async () => {
        await cleanupRedisKeysMatchingOwnerMarkers({
          diagnosticLabel: "API composition",
          ownerMarkers: ownedRedisMarkers,
          redis: redisInventory,
        });
      });
      const originalSecretHash = await hashSecret(originalSecret, 4);
      const rotatedSecretHash = await hashSecret(rotatedSecret, 4);
      const productionOwners = createProductionOwnerSeed(redis, namespace);
      const observerOwners = createProductionOwnerSeed(observerRedis, namespace);
      let logCapture: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
      registerCleanup(() => logCapture?.dispose());

      await sql.begin(async (transaction) => {
        await transaction`DELETE FROM user_profile_dirty WHERE user_id = ${userId}`;
        await transaction`DELETE FROM user_profile WHERE user_id = ${userId} OR subject_identifier = ${subjectIdentifier}`;
        await transaction`
          DELETE FROM client
          WHERE client_code IN (${clientCode}, ${gatewayClientCode})
        `;
        await transaction`
          INSERT INTO client (
            client_code,
            client_name,
            client_secret,
            status,
            is_delete,
            ext_attributes,
            custom_sso_enabled,
            custom_sso_config,
            custom_sso_secret_hash,
            custom_sso_config_version
          )
          VALUES (
            ${clientCode},
            'Ticket 12 Independent',
            'unused-generic-client-placeholder',
            1,
            FALSE,
            '{}'::jsonb,
            TRUE,
            ${transaction.json({
              mode: "independent",
              validRedirectUrls: [redirectUri],
              subjectClaimCatalogVersion: 1,
              subjectClaims: [
                "subjectIdentifier",
                "profile:username",
                "profile:name",
                "profile:employments",
                "iam:authorization",
              ],
              callbackEndpoint,
              logoutEndpoint: "https://ticket12-independent.example.test/logout",
            })},
            ${originalSecretHash},
            1
          )
        `;
        await transaction`
          INSERT INTO client (
            client_code,
            client_name,
            client_secret,
            status,
            is_delete,
            ext_attributes,
            custom_sso_enabled,
            custom_sso_config,
            custom_sso_secret_hash,
            custom_sso_config_version
          )
          VALUES (
            ${gatewayClientCode},
            'Ticket 12 public Gateway',
            'unused-generic-client-placeholder',
            1,
            FALSE,
            '{}'::jsonb,
            TRUE,
            ${transaction.json({
              mode: CustomSsoClientMode.Gateway,
              orcas: { enabled: false },
              subjectClaimCatalogVersion: 1,
              subjectClaims: [
                SubjectClaim.SubjectIdentifier,
                SubjectClaim.ProfileUsername,
                SubjectClaim.ProfileName,
                SubjectClaim.ProfileEmployments,
                SubjectClaim.IamAuthorization,
              ],
              validRedirectUrls: ["https://ticket12-gateway.example.test/*"],
            })},
            NULL,
            1
          )
        `;
        await transaction`
          INSERT INTO user_profile (
            user_id,
            subject_identifier,
            username,
            name,
            mobile,
            wx_id,
            status,
            is_delete,
            search_visible,
            profile_schema_version,
            source_dirty_version,
            detail,
            search_doc,
            subject_facts,
            rebuilt_at
          )
          VALUES (
            ${userId},
            ${subjectIdentifier},
            'ticket12-user',
            'Ticket 12 User',
            NULL,
            NULL,
            1,
            FALSE,
            TRUE,
            1,
            ${sourceDirtyVersion},
            '{}'::jsonb,
            '{}'::jsonb,
            ${transaction.json({ employments: [] })},
            NOW()
          )
        `;
        await transaction`
          INSERT INTO user_profile_dirty (
            user_id,
            dirty_version,
            status,
            reason_codes,
            dirty_at,
            processed_at
          )
          VALUES (
            ${userId},
            ${sourceDirtyVersion},
            'processed',
            '["user-updated"]'::jsonb,
            NOW(),
            NOW()
          )
        `;
      });

      // Retired legacy artifact shapes have no production owner. They are the
      // only raw fixture inputs here; every current session is created below
      // through Session Kernel and its real Subject Access fence.
      const ordinaryLegacyArtifactEntries = new Map(legacyArtifactEntries);
      ordinaryLegacyArtifactEntries.set(
        legacyPayloadKey,
        notificationObserver.endpoint,
      );
      await redis.mset(
        ...[...ordinaryLegacyArtifactEntries].flatMap(entry => entry),
      );
      await cleanupHarness.seed(new Map([
        ...legacyArtifactEntries,
        [cleanupSentinelKey, "must-survive-cleanup"],
      ]));

      const independentSession = await seedExternalSessionState(productionOwners);
      const gatewaySession = await seedGatewayPublicEntry(productionOwners);
      const logoutSession = await seedLogoutSession(productionOwners);
      const [initialAccess] = await observerOwners.subjectAccessBootstrap.inspectMany([
        subjectIdentifier,
      ]);
      const [initialFacts] = await observerOwners.subjectFactsInspector.inspectMany([
        subjectIdentifier,
      ]);
      expect(initialAccess).toMatchObject({
        status: "valid",
        record: { state: "enabled", subjectIdentifier },
      });
      expect(initialFacts).toMatchObject({
        status: "valid",
        record: { sourceDirtyVersion, subjectIdentifier },
      });
      expect(
        await observerOwners.sessionKernel.resolvePrincipalSession(
          independentSession.principalToken,
        ),
      ).toMatchObject({ status: "resolved" });
      expect(
        await observerOwners.sessionKernel.resolveCredential(
          gatewaySession.localToken,
        ),
      ).toMatchObject({ status: "resolved" });
      expect(
        await observerOwners.sessionKernel.resolveClientBindingById(
          logoutSession.bindingId,
        ),
      ).toMatchObject({
        status: "resolved",
        value: {
          cleanupRefs: [{
            protocol: "custom-sso",
            kind: "local_session_payload",
            ref: legacyPayloadRef,
          }],
        },
      });

      const issuedCodes: string[] = [];
      async function registerAuthorizationCode(code: string) {
        const artifact = await observerOwners.sessionKernel.resolveProtocolArtifact(code);
        if (artifact.status !== "resolved") {
          throw new Error(
            `API composition could not observe an issued authorization code: ${artifact.status}`,
          );
        }
        issuedCodes.push(code);
        ownedRedisMarkers.add(artifact.value.artifactId);
      }
      let reenabledGatewaySession:
        Awaited<ReturnType<typeof seedGatewayPublicEntry>> | undefined;
      const result = await externalEntry.run({
        start(context) {
          const child = spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts"],
            cwd: apiRoot,
            env: createEntryEnvironment(context, namespace),
          });
          logCapture = createBoundedProcessLogCapture(child, { maxBytes: 128 * 1024 });
          return child;
        },
        async probe(context, signal) {
          const origin = entryOrigin(context);
          if (!await probeApiDocs(origin, signal))
            return undefined;

          const first = await authorize(
            origin,
            "ticket12-state-first",
            independentSession.principalToken,
            signal,
          );
          await registerAuthorizationCode(first.code);
          const firstExchange = await exchange(
            origin,
            first.code,
            originalSecret,
            signal,
          );
          const replay = await exchange(origin, first.code, originalSecret, signal);
          const gatewayProjectionRetry = await probeGatewayProjectionRetry(
            origin,
            signal,
            sql,
            gatewaySession.principalToken,
            registerAuthorizationCode,
          );
          const independentGrantProjectionRetry
            = await probeIndependentGrantProjectionRetry(
              origin,
              signal,
              sql,
              independentSession.principalToken,
              registerAuthorizationCode,
            );

          await sql`
            UPDATE client
            SET custom_sso_secret_hash = ${rotatedSecretHash},
                custom_sso_config_version = 2,
                update_time = NOW()
            WHERE client_code = ${clientCode}
          `;
          await invalidateCustomSsoClientRuntime(redis, clientCode);
          const rotated = await authorize(
            origin,
            "ticket12-state-rotated",
            independentSession.principalToken,
            signal,
          );
          await registerAuthorizationCode(rotated.code);
          const oldSecret = await exchange(
            origin,
            rotated.code,
            originalSecret,
            signal,
          );
          const rotatedExchange = await exchange(
            origin,
            rotated.code,
            rotatedSecret,
            signal,
          );

          const beforeDisable = await authorize(
            origin,
            "ticket12-state-before-disable",
            independentSession.principalToken,
            signal,
          );
          await registerAuthorizationCode(beforeDisable.code);
          await sql`
            UPDATE client
            SET custom_sso_enabled = FALSE,
                custom_sso_config_version = 3,
                update_time = NOW()
            WHERE client_code = ${clientCode}
          `;
          await invalidateCustomSsoClientRuntime(redis, clientCode);
          const disabledGrant = await exchange(
            origin,
            beforeDisable.code,
            rotatedSecret,
            signal,
          );
          const disabledAuthorizeUrl = new URL(`${origin}/sso/authorize`);
          disabledAuthorizeUrl.search = new URLSearchParams({
            client: clientCode,
            redirectUrl: redirectUri,
          }).toString();
          const disabledAuthorize = await fetch(disabledAuthorizeUrl, {
            headers: {
              cookie: `global_session=${independentSession.principalToken}`,
            },
            redirect: "manual",
            signal,
          });
          const disabledAuthorizeBody = await disabledAuthorize.json() as Record<string, unknown>;

          const publicPositive = await publicUserInfo(
            origin,
            signal,
            gatewaySession.localToken,
          );
          const authzPositive = await gatewayAuthz(
            origin,
            signal,
            gatewaySession.localToken,
          );
          const legacyKeysRejectedBeforeCleanup
            = await probeLegacyArtifactRejection(origin, signal);
          const logoutPayloadBefore = await observerRedis.get(legacyPayloadKey);
          const logout = await logoutPrincipalSession(
            origin,
            signal,
            logoutSession.externalToken,
          );
          const logoutPayloadAfter = await observerRedis.get(legacyPayloadKey);
          const cleanupApply = await cleanupHarness.runCleanup("--apply", 0);
          const cleanupVerify = await cleanupHarness.runCleanup("--verify", 0);
          const cleanupOutput = `${cleanupApply.output}\n${cleanupVerify.output}`;
          const legacyKeysRejectedAfterCleanup
            = await probeLegacyArtifactRejection(origin, signal);
          const publicAfterCleanup = await publicUserInfo(
            origin,
            signal,
            gatewaySession.localToken,
          );
          const authzAfterCleanup = await gatewayAuthz(
            origin,
            signal,
            gatewaySession.localToken,
          );
          const staleGateway = await publicUserInfo(
            origin,
            signal,
            gatewaySession.staleLocalToken,
          );
          const temporaryBlock = await productionOwners.subjectAccess.beginBlocking(
            subjectIdentifier,
          );
          const unavailable = await publicUserInfo(
            origin,
            signal,
            gatewaySession.localToken,
          );
          await productionOwners.subjectAccess.rollback(temporaryBlock);
          const steadyResponses = [];
          for (let request = 0; request < 20; request += 1) {
            steadyResponses.push(await publicUserInfo(
              origin,
              signal,
              gatewaySession.localToken,
            ));
          }
          const steadyUnavailable = steadyResponses.filter(
            response => response.status === 503,
          ).length;
          const disableTransition = await productionOwners.subjectAccess.beginBlocking(
            subjectIdentifier,
          );
          await productionOwners.subjectAccess.prepareRepair(
            disableTransition,
            "disabled",
          );
          await productionOwners.subjectAccess.finalize(
            disableTransition,
            "disabled",
          );
          const disabledSubject = await publicUserInfo(
            origin,
            signal,
            gatewaySession.localToken,
          );
          const reenableTransition = await productionOwners.subjectAccess.beginBlocking(
            subjectIdentifier,
          );
          await productionOwners.subjectAccess.prepareRepair(
            reenableTransition,
            "enabled",
          );
          await productionOwners.subjectAccess.finalize(
            reenableTransition,
            "enabled",
          );
          const oldSessionAfterReenable = await publicUserInfo(
            origin,
            signal,
            gatewaySession.localToken,
          );
          await sql`
            UPDATE user_profile
            SET source_dirty_version = '99',
                name = 'Ticket 12 User Re-enabled',
                rebuilt_at = NOW()
            WHERE user_id = ${userId}
          `;
          await sql`
            UPDATE user_profile_dirty
            SET dirty_version = '99',
                status = 'processed',
                processed_at = NOW()
            WHERE user_id = ${userId}
          `;
          await productionOwners.subjectFacts.publish(
            subjectFactsRecord("99", "Ticket 12 User Re-enabled"),
          );
          reenabledGatewaySession = await seedGatewayPublicEntry(productionOwners);
          const newSessionAfterReenable = await publicUserInfo(
            origin,
            signal,
            reenabledGatewaySession.localToken,
          );

          return {
            disabledAuthorize: {
              body: disabledAuthorizeBody,
              status: disabledAuthorize.status,
            },
            authzAfterCleanup,
            authzPositive,
            cleanupOutput,
            disabledGrant,
            disabledSubject,
            first,
            firstExchange,
            gatewayProjectionRetry,
            independentGrantProjectionRetry,
            legacyKeysRejectedAfterCleanup,
            legacyKeysRejectedBeforeCleanup,
            logout,
            logoutPayloadAfter,
            logoutPayloadBefore,
            notificationRequests: [...notificationObserver.requests],
            newSessionAfterReenable,
            oldSecret,
            oldSessionAfterReenable,
            publicPositive,
            publicAfterCleanup,
            replay,
            rotated,
            rotatedExchange,
            staleGateway,
            steadyMetric: {
              requests: steadyResponses.length,
              unavailable: steadyUnavailable,
              unavailableRate: steadyUnavailable / steadyResponses.length,
            },
            unavailable,
          };
        },
        childReadinessEvidence: context => `server: ${entryOrigin(context)}`,
      });

      if (reenabledGatewaySession === undefined)
        throw new Error("API composition did not create the re-enabled Gateway session");
      const [finalAccess] = await observerOwners.subjectAccessBootstrap.inspectMany([
        subjectIdentifier,
      ]);
      const [finalFacts] = await observerOwners.subjectFactsInspector.inspectMany([
        subjectIdentifier,
      ]);
      expect(finalAccess).toMatchObject({
        status: "valid",
        record: { state: "enabled", subjectIdentifier },
      });
      expect(finalFacts).toMatchObject({
        status: "valid",
        record: {
          profile: { name: "Ticket 12 User Re-enabled" },
          sourceDirtyVersion: "99",
          subjectIdentifier,
        },
      });
      expect(
        await observerOwners.sessionKernel.resolveCredential(
          gatewaySession.localToken,
        ),
      ).not.toMatchObject({ status: "resolved" });
      expect(
        await observerOwners.sessionKernel.resolveCredential(
          reenabledGatewaySession.localToken,
        ),
      ).toMatchObject({ status: "resolved" });
      expect(
        await observerOwners.sessionKernel.resolvePrincipalSession(
          logoutSession.externalToken,
        ),
      ).not.toMatchObject({ status: "resolved" });
      expect(
        await observerOwners.sessionKernel.resolveClientBindingById(
          logoutSession.bindingId,
        ),
      ).not.toMatchObject({ status: "resolved" });
      expect(await cleanupHarness.inventory()).toEqual(new Map([
        [cleanupSentinelKey, "must-survive-cleanup"],
      ]));

      expect(result.first).toMatchObject({ status: 302 });
      expect(result.gatewayProjectionRetry).toEqual({
        loginCallback: {
          setCookie: expect.stringContaining(
            `local_${gatewayClientCode}_session=`,
          ),
          status: 302,
        },
        firstUserInfo: {
          body: {
            code: ApiErrorCode.SubjectProjectionNotReady,
            data: null,
            message: "主体信息暂未就绪",
          },
          retryAfter: "7",
          setCookie: null,
          status: 503,
        },
        retryUserInfo: {
          setCookie: null,
          status: 200,
          subjectIdentifier,
        },
      });
      expect(result.independentGrantProjectionRetry).toEqual({
        firstExchange: {
          body: {
            code: ApiErrorCode.SubjectProjectionNotReady,
            data: null,
            message: "主体信息暂未就绪",
          },
          retryAfter: "7",
          setCookie: null,
          status: 503,
        },
        retryExchange: {
          setCookie: null,
          status: 200,
          subjectIdentifier,
        },
      });
      expect(result.firstExchange).toMatchObject({
        status: 200,
        setCookie: null,
        body: {
          code: 200,
          data: {
            sid: expect.stringMatching(/^iam_ls_/u),
            subject: {
              version: 1,
              subjectIdentifier,
              profile: {
                username: "ticket12-user",
                name: "Ticket 12 User",
              },
              authorization: {
                roles: ["ticket12:user"],
                privileges: ["ticket12:read"],
              },
            },
          },
        },
      });
      expect(result.replay.status).not.toBe(200);
      expect(result.rotated).toMatchObject({ status: 302 });
      expect(result.oldSecret.status).not.toBe(200);
      expect(result.rotatedExchange).toMatchObject({ status: 200 });
      expect(result.disabledGrant.status).not.toBe(200);
      expect(result.disabledAuthorize).toMatchObject({
        status: 400,
        body: { code: ApiErrorCode.InvalidSsoClient },
      });
      expect(result.publicPositive).toMatchObject({
        status: 200,
        setCookie: null,
        body: {
          code: 200,
          data: {
            version: 1,
            subjectIdentifier,
          },
        },
      });
      expect(result.authzPositive).toMatchObject({
        body: { code: 200, data: expect.any(String), message: "success" },
        decoded: {
          version: 1,
          subjectIdentifier,
          username: "ticket12-user",
          name: "Ticket 12 User",
        },
        setCookie: null,
        status: 200,
      });
      expect(result.authzPositive.decoded).not.toHaveProperty("orcasId");
      expect(result.logout).toEqual({
        location: expect.stringContaining("/logout-complete"),
        status: 302,
      });
      expect({
        after: result.logoutPayloadAfter,
        before: result.logoutPayloadBefore,
      }).toEqual({
        after: notificationObserver.endpoint,
        before: notificationObserver.endpoint,
      });
      expect(result.notificationRequests).toEqual([]);
      expect(result.legacyKeysRejectedBeforeCleanup).toEqual({
        authorizeRedirectedToLogin: true,
        authorizeStatus: 302,
        authzStatus: 401,
        callbackStatus: 401,
        userInfoStatus: 401,
      });
      expect(result.legacyKeysRejectedAfterCleanup)
        .toEqual(result.legacyKeysRejectedBeforeCleanup);
      expect(result.publicAfterCleanup).toEqual(result.publicPositive);
      expect(result.authzAfterCleanup).toEqual(result.authzPositive);
      expect(result.cleanupOutput).toContain(
        "Legacy cleanup custom-sso-cutover apply completed: matched 6, deleted 6.",
      );
      expect(result.cleanupOutput).toContain(
        "Legacy cleanup custom-sso-cutover verify completed: matched 0, deleted 0.",
      );
      expect(result.staleGateway).toMatchObject({
        status: 401,
      });
      expect(result.unavailable).toMatchObject({
        status: 503,
        setCookie: null,
        body: { code: ApiErrorCode.SubjectAccessUnavailable },
      });
      expect(result.steadyMetric).toEqual({
        requests: 20,
        unavailable: 0,
        unavailableRate: 0,
      });
      expect(result.disabledSubject.status).toBe(401);
      expect(result.disabledSubject.setCookie).toContain(
        `local_${gatewayClientCode}_session=`,
      );
      expect(result.oldSessionAfterReenable.status).toBe(401);
      expect(result.newSessionAfterReenable).toMatchObject({
        status: 200,
        setCookie: null,
        body: {
          code: 200,
          data: {
            subjectIdentifier,
            profile: { name: "Ticket 12 User Re-enabled" },
          },
        },
      });

      const output = logCapture?.snapshot() ?? "";
      for (const sensitiveValue of [
        originalSecret,
        rotatedSecret,
        independentSession.principalToken,
        gatewaySession.principalToken,
        gatewaySession.localToken,
        gatewaySession.staleLocalToken,
        logoutSession.externalToken,
        reenabledGatewaySession.principalToken,
        reenabledGatewaySession.localToken,
        ...issuedCodes,
      ]) {
        expect(output).not.toContain(sensitiveValue);
      }
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
