import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  customSsoClientRuntimeCacheKey,
} from "@iam/api-core/custom-sso";
import { hashSecret } from "@iam/api-core/security";
import {
  cleanupRedisKeysAddedSince,
  createRedisKeyInventoryPort,
  inventoryRedisKeys,
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
  seedProcessSmokeClientBinding,
  seedProcessSmokeCredential,
  seedProcessSmokePrincipalSession,
} from "@iam/api-core/testing/process-smoke-redis-server";
import {
  ApiErrorCode,
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
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
const lookupHmacId = "entry-external";
const lookupHmacSecret = "api-entry-external-secret-that-is-at-least-32-bytes";
const loginCredentialPrivateKey = "319b4e59ca80d7b4cc35955b63da4edf1ed51772ec8f33c0a4f769dda7b9fc65";
const clientCode = "ticket12-independent";
const gatewayClientCode = "ticket12-public-gateway";
const originalSecret = "ticket12-original-secret";
const rotatedSecret = "ticket12-rotated-secret";
const callbackEndpoint = "https://ticket12-independent.example.test/callback";
const redirectUri = "https://ticket12-independent.example.test/complete";
const gatewayRetryRedirectUri = "https://ticket12-gateway.example.test/pnr-complete";
const subjectIdentifier = "00000000-0000-4000-8000-000000000098";
const subjectAccessTransitionId = "10000000-0000-4000-8000-000000000098";
const principalToken = `iam_ps_${"q".repeat(43)}`;
const gatewayPrincipalToken = `iam_ps_${"r".repeat(43)}`;
const gatewayLocalToken = `iam_ls_${"s".repeat(43)}`;
const gatewayReenabledPrincipalToken = `iam_ps_${"t".repeat(43)}`;
const gatewayReenabledLocalToken = `iam_ls_${"u".repeat(43)}`;
const reenabledSubjectAccessTransitionId = "10000000-0000-4000-8000-000000000097";
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

function createSeedCollector() {
  const values = new Map<string, string>();
  return {
    set(key: string, value: string) {
      values.set(key, value);
    },
    values,
  };
}

function seedExternalSessionState(
  collector: ReturnType<typeof createSeedCollector>,
  namespace: string,
) {
  seedProcessSmokePrincipalSession(collector, {
    externalToken: principalToken,
    lookupHmacId,
    lookupHmacSecret,
    namespace,
    principalSessionId: `principal-${randomUUID()}`,
    subjectAccessTransitionId,
    subjectIdentifier,
  });
  collector.set(
    `subject-access:v1:record:${subjectIdentifier}`,
    enabledBarrier(),
  );
  collector.set(
    `user-profile:subject-facts:${subjectIdentifier}`,
    subjectFactsPayload(sourceDirtyVersion, "Ticket 12 User"),
  );
}

function seedGatewayPublicEntry(
  collector: ReturnType<typeof createSeedCollector>,
  namespace: string,
  options: {
    localToken?: string;
    principalToken?: string;
    subjectAccessTransitionId?: string;
    writeRuntimeCache?: boolean;
  } = {},
) {
  const principalSessionId = `principal-gateway-${randomUUID()}`;
  const bindingId = `binding-gateway-${randomUUID()}`;
  const metadata = {
    version: 1,
    mode: CustomSsoClientMode.Gateway,
    configVersion: 1,
  };
  seedProcessSmokePrincipalSession(collector, {
    externalToken: options.principalToken ?? gatewayPrincipalToken,
    lookupHmacId,
    lookupHmacSecret,
    namespace,
    principalSessionId,
    subjectAccessTransitionId:
      options.subjectAccessTransitionId ?? subjectAccessTransitionId,
    subjectIdentifier,
  });
  seedProcessSmokeClientBinding(collector, {
    bindingId,
    clientCode: gatewayClientCode,
    lookupHmacId,
    lookupHmacSecret,
    metadata,
    namespace,
    principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    subjectAccessTransitionId:
      options.subjectAccessTransitionId ?? subjectAccessTransitionId,
    subjectIdentifier,
  });
  seedProcessSmokeCredential(collector, {
    bindingId,
    clientCode: gatewayClientCode,
    credentialId: `credential-${randomUUID()}`,
    credentialType: "local_session",
    externalToken: options.localToken ?? gatewayLocalToken,
    lookupHmacId,
    lookupHmacSecret,
    metadata,
    namespace,
    principalSessionId,
    protocol: "custom-sso",
    renewalPolicy: "extend_with_principal",
    subjectAccessTransitionId:
      options.subjectAccessTransitionId ?? subjectAccessTransitionId,
    subjectIdentifier,
  });
  if (options.writeRuntimeCache === false)
    return;
  collector.set(
    customSsoClientRuntimeCacheKey(gatewayClientCode),
    JSON.stringify({
      version: 1,
      generation: "0",
      clientCode: gatewayClientCode,
      expiresAt: Date.now() + 10 * 60_000,
      client: {
        id: 900_097,
        clientCode: gatewayClientCode,
        clientName: "Ticket 12 public Gateway",
        status: ClientStatus.Enable,
        isDelete: false,
        customSsoEnabled: true,
        customSsoConfig: {
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
        },
        customSsoConfigVersion: 1,
      },
    }),
  );
}

function enabledBarrier(
  transitionId: string = subjectAccessTransitionId,
) {
  return JSON.stringify({
    version: 1,
    subjectIdentifier,
    state: "enabled",
    transitionId,
    updatedAt: new Date().toISOString(),
  });
}

function subjectFactsPayload(version: string, name: string) {
  return JSON.stringify({
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
  });
}

async function publicUserInfo(
  origin: string,
  signal: AbortSignal,
  localToken: string = gatewayLocalToken,
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

async function probeGatewayProjectionRetry(
  origin: string,
  signal: AbortSignal,
  sql: ReturnType<typeof postgres>,
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
) {
  const grant = await authorize(origin, "independent-pnr-retry-state", signal);
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
    code: grant.code,
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
          await transaction`DELETE FROM client WHERE client_code = ${clientCode}`;
        });
      });
      const redis = new Redis(redisUrl, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
      });
      registerCleanup(() => redis.disconnect());
      const redisInventory = createRedisKeyInventoryPort(redis);
      const existingKeys = await inventoryRedisKeys(redisInventory);
      registerCleanup(async () => {
        await cleanupRedisKeysAddedSince(redisInventory, existingKeys);
      });
      const originalSecretHash = await hashSecret(originalSecret, 4);
      const rotatedSecretHash = await hashSecret(rotatedSecret, 4);
      const namespace = `sess:api-real-entry:${randomUUID().replaceAll("-", "")}:`;
      let logCapture: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
      registerCleanup(() => logCapture?.dispose());

      await sql.begin(async (transaction) => {
        await transaction`DELETE FROM user_profile_dirty WHERE user_id = ${userId}`;
        await transaction`DELETE FROM user_profile WHERE user_id = ${userId} OR subject_identifier = ${subjectIdentifier}`;
        await transaction`DELETE FROM client WHERE client_code = ${clientCode}`;
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

      const collector = createSeedCollector();
      seedExternalSessionState(collector, namespace);
      seedGatewayPublicEntry(collector, namespace);
      for (const key of collector.values.keys()) {
        if (existingKeys.has(key)) {
          throw new Error(
            `dedicated API Redis test instance already contains owned key ${key}`,
          );
        }
      }
      await redis.mset([...collector.values].flat());

      const issuedCodes: string[] = [];
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

          const first = await authorize(origin, "ticket12-state-first", signal);
          issuedCodes.push(first.code);
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
          );
          const {
            code: projectionRetryCode,
            ...independentGrantProjectionRetry
          } = await probeIndependentGrantProjectionRetry(origin, signal, sql);
          issuedCodes.push(projectionRetryCode);

          await sql`
            UPDATE client
            SET custom_sso_secret_hash = ${rotatedSecretHash},
                custom_sso_config_version = 2,
                update_time = NOW()
            WHERE client_code = ${clientCode}
          `;
          await redis.del(customSsoClientRuntimeCacheKey(clientCode));
          const rotated = await authorize(origin, "ticket12-state-rotated", signal);
          issuedCodes.push(rotated.code);
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
            signal,
          );
          issuedCodes.push(beforeDisable.code);
          await sql`
            UPDATE client
            SET custom_sso_enabled = FALSE,
                custom_sso_config_version = 3,
                update_time = NOW()
            WHERE client_code = ${clientCode}
          `;
          await redis.del(customSsoClientRuntimeCacheKey(clientCode));
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
            headers: { cookie: `global_session=${principalToken}` },
            redirect: "manual",
            signal,
          });
          const disabledAuthorizeBody = await disabledAuthorize.json() as Record<string, unknown>;

          const publicPositive = await publicUserInfo(origin, signal);
          await redis.del(`subject-access:v1:record:${subjectIdentifier}`);
          const unavailable = await publicUserInfo(origin, signal);
          await redis.set(`subject-access:v1:record:${subjectIdentifier}`, enabledBarrier());
          const steadyResponses = [];
          for (let request = 0; request < 20; request += 1)
            steadyResponses.push(await publicUserInfo(origin, signal));
          const steadyUnavailable = steadyResponses.filter(
            response => response.status === 503,
          ).length;
          await redis.set(
            `subject-access:v1:record:${subjectIdentifier}`,
            JSON.stringify({
              version: 1,
              subjectIdentifier,
              state: "disabled",
              transitionId: subjectAccessTransitionId,
              updatedAt: new Date().toISOString(),
            }),
          );
          const disabledSubject = await publicUserInfo(origin, signal);
          await redis.set(
            `subject-access:v1:record:${subjectIdentifier}`,
            enabledBarrier(reenabledSubjectAccessTransitionId),
          );
          const oldSessionAfterReenable = await publicUserInfo(origin, signal);
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
          await redis.set(
            `user-profile:subject-facts:${subjectIdentifier}`,
            subjectFactsPayload("99", "Ticket 12 User Re-enabled"),
          );
          const reenabledCollector = createSeedCollector();
          seedGatewayPublicEntry(reenabledCollector, namespace, {
            localToken: gatewayReenabledLocalToken,
            principalToken: gatewayReenabledPrincipalToken,
            subjectAccessTransitionId: reenabledSubjectAccessTransitionId,
            writeRuntimeCache: false,
          });
          await redis.mset([...reenabledCollector.values].flat());
          const newSessionAfterReenable = await publicUserInfo(
            origin,
            signal,
            gatewayReenabledLocalToken,
          );

          return {
            disabledAuthorize: {
              body: disabledAuthorizeBody,
              status: disabledAuthorize.status,
            },
            disabledGrant,
            disabledSubject,
            first,
            firstExchange,
            gatewayProjectionRetry,
            independentGrantProjectionRetry,
            newSessionAfterReenable,
            oldSecret,
            oldSessionAfterReenable,
            publicPositive,
            replay,
            rotated,
            rotatedExchange,
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
        principalToken,
        gatewayLocalToken,
        gatewayReenabledLocalToken,
        ...issuedCodes,
      ]) {
        expect(output).not.toContain(sensitiveValue);
      }
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
