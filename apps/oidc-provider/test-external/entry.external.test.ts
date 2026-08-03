import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { customSsoClientRuntimeCacheKey } from "@iam/api-core/custom-sso";
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
import { seedProcessSmokePrincipalSession } from "@iam/api-core/testing/process-smoke-redis-server";
import { decodeJwt, exportJWK, generateKeyPair } from "jose";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { createOidcProviderRedisTestHarness } from "../test-redis/redis-test-harness.ts";

const oidcRoot = fileURLToPath(new URL("../", import.meta.url));
const entryListeningEvidence = "OIDC provider listening";
const lookupHmacId = "entry-external";
const lookupHmacSecret = "oidc-entry-external-secret-that-is-at-least-32-bytes";
const subjectIdentifier = "00000000-0000-4000-8000-000000000099";
const subjectAccessTransitionId = "10000000-0000-4000-8000-000000000099";
const username = "oidc-sensitive-username";
const originalName = "OIDC Snapshot Name";
const changedName = "OIDC Current Name Must Not Leak";
const principalToken = `iam_ps_${"p".repeat(43)}`;
const clientId = "oidc-real-entry-observability";
const redirectUri = "https://oidc-real-entry.example.test/callback";
const postLogoutRedirectUri = "https://oidc-real-entry.example.test/logout-complete";
const codeVerifier = "a".repeat(64);
const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
const userId = 900_099;
const sourceDirtyVersion = "99";
const customSsoCacheSentinel = "ticket12-custom-sso-cache-must-remain-unchanged";
const customSsoHashSentinel = "$2b$04$ticket12CustomSsoHashOnlyNotASecretValue";
const databaseUrlName = "IAM_OIDC_PROVIDER_TEST_DATABASE_URL";
const redisUrlName = "IAM_OIDC_PROVIDER_TEST_REDIS_URL";
const databaseUrl = requireDedicatedPostgresTestUrl({
  forbidden: [
    { name: "DATABASE_URL", value: process.env.DATABASE_URL },
    {
      name: "IAM_OIDC_PROVIDER_DATABASE_URL",
      value: process.env.IAM_OIDC_PROVIDER_DATABASE_URL,
    },
  ],
  name: databaseUrlName,
  value: requireExternalTestUrl({
    environment: process.env,
    lane: "the explicit OIDC Provider external lane",
    name: databaseUrlName,
  }),
});
const redisUrl = requireExternalTestUrl({
  environment: process.env,
  lane: "the explicit OIDC Provider external lane",
  name: redisUrlName,
});
const redisConfig = parseDedicatedRedisTestUrl({
  name: redisUrlName,
  value: redisUrl,
});
const externalEntry = createProcessSmokeSuite({
  label: "OIDC provider external entry",
  temporaryDirectoryPrefix: "iam-oidc-entry-external-",
  hostname: "127.0.0.1",
});

afterEach(externalEntry.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(
  context: ProcessSmokeAttemptContext,
  currentJwkJson: string,
  sessionKernelNamespace: string,
) {
  const origin = entryOrigin(context);
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_OIDC_PROVIDER_DATABASE_URL: databaseUrl,
      IAM_OIDC_PROVIDER_REDIS_HOST: redisConfig.host,
      IAM_OIDC_PROVIDER_REDIS_PORT: String(redisConfig.port),
      IAM_OIDC_PROVIDER_REDIS_PASSWORD: redisConfig.password,
      IAM_OIDC_PROVIDER_REDIS_DB: String(redisConfig.db),
      IAM_OIDC_PROVIDER_PORT: String(context.port),
      IAM_OIDC_PROVIDER_LOG_FORMAT: "json",
      IAM_OIDC_PROVIDER_ISSUER: `${origin}/oidc`,
      IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: origin,
      IAM_OIDC_PROVIDER_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
      IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: currentJwkJson,
      IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: sessionKernelNamespace,
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID: lookupHmacId,
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET: lookupHmacSecret,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
}

function createCookieJar() {
  const cookies = new Map([["global_session", principalToken]]);
  return {
    absorb(response: Response) {
      for (const header of response.headers.getSetCookie()) {
        const [pair] = header.split(";", 1);
        const separator = pair?.indexOf("=") ?? -1;
        if (!pair || separator === -1)
          continue;
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value)
          cookies.set(name, value);
        else
          cookies.delete(name);
      }
    },
    header() {
      return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    },
  };
}

async function requestRedirect(
  target: string,
  cookieJar: ReturnType<typeof createCookieJar>,
  signal: AbortSignal,
) {
  const response = await fetch(target, {
    headers: { cookie: cookieJar.header() },
    redirect: "manual",
    signal,
  });
  cookieJar.absorb(response);
  return response;
}

async function runPublicProtocolFlow(input: {
  issuer: string;
  onCodeIssued: () => Promise<void>;
  origin: string;
  signal: AbortSignal;
}) {
  const authorization = new URL(`${input.issuer}/auth`);
  authorization.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile iam:employments iam:authorization",
    state: "real-entry-state",
  }).toString();
  const cookieJar = createCookieJar();
  let next = authorization.href;
  let callback: URL | undefined;
  let authorizeStatus: number | undefined;
  for (let redirects = 0; redirects < 8; redirects += 1) {
    const response = await requestRedirect(next, cookieJar, input.signal);
    authorizeStatus ??= response.status;
    const location = response.headers.get("location");
    if (location === null) {
      throw new FatalReadinessError(
        `OIDC authorization stopped with ${response.status} before the client callback`,
      );
    }
    const target = new URL(location, input.issuer);
    if (target.origin === new URL(redirectUri).origin) {
      callback = target;
      break;
    }
    if (target.origin !== new URL(input.origin).origin) {
      throw new FatalReadinessError(
        `OIDC authorization redirected to unexpected origin ${target.origin}`,
      );
    }
    next = target.href;
  }
  if (callback === undefined)
    throw new FatalReadinessError("OIDC authorization redirect limit exceeded");
  const code = callback.searchParams.get("code");
  if (callback.searchParams.get("state") !== "real-entry-state" || code === null) {
    throw new FatalReadinessError("OIDC authorization callback omitted code or state");
  }

  await input.onCodeIssued();

  const tokenResponse = await fetch(`${input.issuer}/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: input.signal,
  });
  const tokens = await tokenResponse.json() as Record<string, unknown>;
  if (
    tokenResponse.status !== 200
    || typeof tokens.access_token !== "string"
    || typeof tokens.id_token !== "string"
  ) {
    throw new FatalReadinessError(
      `OIDC token exchange returned unexpected ${tokenResponse.status}/${String(tokens.error)}`,
    );
  }

  const userInfoResponse = await fetch(`${input.issuer}/me`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: input.signal,
  });
  const userInfo = await userInfoResponse.json() as Record<string, unknown>;
  if (userInfoResponse.status !== 200 || userInfo.sub !== subjectIdentifier) {
    throw new FatalReadinessError(
      `OIDC UserInfo returned unexpected ${userInfoResponse.status}/${String(userInfo.sub)}`,
    );
  }

  const logout = new URL(`${input.issuer}/session/end`);
  logout.search = new URLSearchParams({
    id_token_hint: tokens.id_token,
    post_logout_redirect_uri: postLogoutRedirectUri,
    state: "real-entry-logout-state",
  }).toString();
  const logoutPrompt = await requestRedirect(logout.href, cookieJar, input.signal);
  const logoutForm = await logoutPrompt.text();
  const action = logoutForm.match(/<form[^>]+action="([^"]+)"/u)?.[1];
  const xsrf = logoutForm.match(/name="xsrf" value="([^"]+)"/u)?.[1];
  if (logoutPrompt.status !== 200 || action === undefined || xsrf === undefined) {
    throw new FatalReadinessError(
      `OIDC logout prompt returned unexpected ${logoutPrompt.status}/${String(action)}`,
    );
  }
  const logoutResponse = await fetch(new URL(action, input.issuer), {
    body: new URLSearchParams({ logout: "yes", xsrf }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cookie": cookieJar.header(),
    },
    method: "POST",
    redirect: "manual",
    signal: input.signal,
  });
  const logoutLocation = logoutResponse.headers.get("location");
  if (
    ![302, 303].includes(logoutResponse.status)
    || logoutLocation === null
    || new URL(logoutLocation, input.issuer).origin !== new URL(postLogoutRedirectUri).origin
  ) {
    throw new FatalReadinessError(
      `OIDC logout returned unexpected ${logoutResponse.status}/${logoutLocation}`,
    );
  }

  return {
    authorizeStatus,
    idTokenClaims: decodeJwt(tokens.id_token),
    logoutStatus: logoutResponse.status,
    tokenStatus: tokenResponse.status,
    userInfo,
    userInfoStatus: userInfoResponse.status,
  };
}

async function probeDiscovery(origin: string, issuer: string, signal: AbortSignal) {
  const response = await fetch(
    `${origin}/oidc/.well-known/openid-configuration`,
    { signal },
  );
  if (response.status !== 200)
    return undefined;
  const discovery = await response.json() as Record<string, unknown>;
  if (discovery.issuer !== issuer) {
    throw new PortCollisionError(
      `port served an unexpected issuer: expected ${issuer}, received ${String(discovery.issuer)}`,
    );
  }
  return discovery;
}

function subjectFacts(name: string) {
  return JSON.stringify({
    schemaVersion: 1,
    sourceDirtyVersion,
    publishedAt: new Date().toISOString(),
    subjectIdentifier,
    profile: {
      username,
      name,
      phone: null,
    },
    facts: {
      employments: [{
        isPrimary: true,
        organization: {
          code: "dept-ticket12",
          name: "Ticket 12 Department",
          type: "department",
          path: [{
            code: "dept-ticket12",
            name: "Ticket 12 Department",
            type: "department",
          }],
        },
        position: { code: "engineer", name: "Engineer" },
        clientAuthorizations: [{
          clientCode: clientId,
          roles: [{ code: "ticket12:user", privileges: ["ticket12:read"] }],
        }],
      }],
    },
  });
}

describe("oIDC provider explicit external entry", () => {
  it("uses real PostgreSQL and Redis while preserving the pre-code snapshot and Custom SSO isolation", async () => {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const sql = postgres(databaseUrl, { max: 1 });
      registerCleanup(async () => await sql.end({ timeout: 5 }));
      registerCleanup(async () => {
        await sql.begin(async (transaction) => {
          await transaction`DELETE FROM user_profile_dirty WHERE user_id = ${userId}`;
          await transaction`DELETE FROM user_profile WHERE user_id = ${userId} OR subject_identifier = ${subjectIdentifier}`;
          await transaction`DELETE FROM "user" WHERE id = ${userId} OR subject_identifier = ${subjectIdentifier}`;
          await transaction`DELETE FROM client WHERE client_code = ${clientId}`;
        });
      });
      const redisHarness = await createOidcProviderRedisTestHarness();
      registerCleanup(async () => await redisHarness.close());
      const redis = await redisHarness.createScope();
      registerCleanup(async () => await redis.close());
      const redisInventory = createRedisKeyInventoryPort(redis.observer);
      const existingKeys = await inventoryRedisKeys(redisInventory);
      registerCleanup(async () => {
        await cleanupRedisKeysAddedSince(redisInventory, existingKeys);
      });
      let logCapture: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
      registerCleanup(() => logCapture?.dispose());

      await sql.begin(async (transaction) => {
        await transaction`DELETE FROM user_profile_dirty WHERE user_id = ${userId}`;
        await transaction`DELETE FROM user_profile WHERE user_id = ${userId} OR subject_identifier = ${subjectIdentifier}`;
        await transaction`DELETE FROM "user" WHERE id = ${userId} OR subject_identifier = ${subjectIdentifier}`;
        await transaction`DELETE FROM client WHERE client_code = ${clientId}`;
        await transaction`
          INSERT INTO client (
            client_code,
            client_name,
            client_secret,
            status,
            is_delete,
            ext_attributes,
            oidc_enabled,
            oidc_config,
            oidc_config_version,
            custom_sso_enabled,
            custom_sso_config,
            custom_sso_secret_hash,
            custom_sso_config_version
          )
          VALUES (
            ${clientId},
            'OIDC external entry',
            'unused-public-client-placeholder',
            1,
            FALSE,
            ${transaction.json({ ticket12IsolationSentinel: true })},
            TRUE,
            ${transaction.json({
              clientType: "public",
              redirectUris: [redirectUri],
              postLogoutRedirectUris: [postLogoutRedirectUri],
              allowedScopes: ["openid", "profile", "iam:employments", "iam:authorization"],
              tokenEndpointAuthMethod: "none",
            })},
            1,
            TRUE,
            ${transaction.json({
              mode: "independent",
              validRedirectUrls: ["https://custom-sso-isolation.example.test/callback"],
              subjectClaimCatalogVersion: 1,
              subjectClaims: ["subjectIdentifier"],
              callbackEndpoint: "https://custom-sso-isolation.example.test/callback",
              logoutEndpoint: "https://custom-sso-isolation.example.test/logout",
            })},
            ${customSsoHashSentinel},
            7
          )
        `;
        await transaction`
          INSERT INTO "user" (
            id,
            subject_identifier,
            username,
            name,
            status,
            is_delete
          )
          VALUES (
            ${userId},
            ${subjectIdentifier},
            ${username},
            ${originalName},
            1,
            FALSE
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
            ${username},
            ${originalName},
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

      const sessionKernelNamespace = `sess:oidc-real-entry:${randomUUID().replaceAll("-", "")}:`;
      const principalSessionId = `principal-${randomUUID()}`;
      const seededValues = new Map<string, string>();
      seedProcessSmokePrincipalSession({
        set(key, value) {
          seededValues.set(key, value);
        },
      }, {
        externalToken: principalToken,
        lookupHmacId,
        lookupHmacSecret,
        namespace: sessionKernelNamespace,
        principalSessionId,
        subjectAccessTransitionId,
        subjectIdentifier,
      });
      const barrierKey = `subject-access:v1:record:${subjectIdentifier}`;
      const factsKey = `user-profile:subject-facts:${subjectIdentifier}`;
      const customSsoKey = customSsoClientRuntimeCacheKey(clientId);
      seededValues.set(barrierKey, JSON.stringify({
        version: 1,
        subjectIdentifier,
        state: "enabled",
        transitionId: subjectAccessTransitionId,
        updatedAt: new Date().toISOString(),
      }));
      seededValues.set(factsKey, subjectFacts(originalName));
      seededValues.set(customSsoKey, customSsoCacheSentinel);
      for (const key of seededValues.keys()) {
        if (existingKeys.has(key)) {
          throw new Error(
            `dedicated OIDC Redis test instance already contains owned key ${key}`,
          );
        }
        redis.trackKey(key);
      }
      await redis.writer.mset([...seededValues].flat());
      redis.trackPrefix(sessionKernelNamespace);

      const { privateKey } = await generateKeyPair(
        "RS256",
        { modulusLength: 2048, extractable: true },
      );
      const currentJwkJson = JSON.stringify({
        ...await exportJWK(privateKey),
        alg: "RS256",
        kid: "real-entry-observability",
        use: "sig",
      });
      const result = await externalEntry.run({
        start(context) {
          logCapture?.dispose();
          const child = spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--import", "tsx", "src/index.ts"],
            cwd: oidcRoot,
            env: createEntryEnvironment(context, currentJwkJson, sessionKernelNamespace),
          });
          logCapture = createBoundedProcessLogCapture(child, { maxBytes: 64 * 1024 });
          return child;
        },
        async probe(context, signal) {
          const origin = entryOrigin(context);
          const issuer = `${origin}/oidc`;
          const discovery = await probeDiscovery(origin, issuer, signal);
          if (discovery === undefined)
            return undefined;
          const protocol = await runPublicProtocolFlow({
            issuer,
            origin,
            signal,
            onCodeIssued: async () => {
              await redis.writer.set(factsKey, subjectFacts(changedName));
            },
          });
          return { discovery, protocol };
        },
        childReadinessEvidence: entryListeningEvidence,
      });

      expect(result.protocol).toMatchObject({
        authorizeStatus: 303,
        idTokenClaims: {
          sub: subjectIdentifier,
        },
        logoutStatus: 303,
        tokenStatus: 200,
        userInfo: {
          "sub": subjectIdentifier,
          "preferred_username": username,
          "name": originalName,
          "iam:employments": [{
            isPrimary: true,
            position: { posCode: "engineer", posName: "Engineer" },
          }],
          "iam:authorization": {
            roles: ["ticket12:user"],
            privileges: ["ticket12:read"],
          },
        },
        userInfoStatus: 200,
      });
      expect(result.protocol.idTokenClaims).not.toHaveProperty("iam:employments");
      expect(result.protocol.idTokenClaims).not.toHaveProperty("iam:authorization");
      expect(JSON.stringify(result.protocol)).not.toContain(changedName);
      expect(await redis.writer.get(customSsoKey)).toBe(customSsoCacheSentinel);

      const [isolatedClient] = await sql<{
        custom_sso_config_version: number;
        custom_sso_enabled: boolean;
        custom_sso_secret_hash: string;
      }[]>`
        SELECT custom_sso_enabled, custom_sso_secret_hash, custom_sso_config_version
        FROM client
        WHERE client_code = ${clientId}
      `;
      expect(isolatedClient).toEqual({
        custom_sso_enabled: true,
        custom_sso_secret_hash: customSsoHashSentinel,
        custom_sso_config_version: 7,
      });

      const output = logCapture?.snapshot() ?? "";
      const observation = output
        .split(/\r?\n/u)
        .map((line) => {
          try {
            return JSON.parse(
              line.replace(/^\[(?:stdout|stderr)\] /u, ""),
            ) as Record<string, unknown>;
          }
          catch {
            return null;
          }
        })
        .find(line => line?.event === "subject_facts.operation.observed");
      expect(observation).toMatchObject({
        event: "subject_facts.operation.observed",
        operation: "cache-read",
        outcome: "hit",
        durationMs: expect.any(Number),
      });
      const serializedObservation = JSON.stringify(observation);
      for (const sensitiveValue of [
        subjectIdentifier,
        username,
        originalName,
        customSsoHashSentinel,
        "user-profile:subject-facts:",
      ]) {
        expect(serializedObservation).not.toContain(sensitiveValue);
      }
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
