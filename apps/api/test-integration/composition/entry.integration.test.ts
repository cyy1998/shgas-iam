import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import { createHash, createPublicKey, randomInt, randomUUID, verify } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
  createSubjectAccessOperations,
  createUnifiedSubjectAccessSessionRevocation,
  requireSubjectAccessOperation,
} from "@iam/api-core/subject-access";
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
  createProcessSmokeSuite,
  FatalReadinessError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, OidcClientType, OidcScope, SubjectClaim } from "@iam/contracts";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import { createSubjectFactsRedisCache } from "@iam/user-profile-read-model/subject-facts";
import { afterEach, expect, test } from "bun:test";
import Redis from "ioredis";
import { createApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createEntryEnvironment } from "../process/api-env.fixture";

requireDedicatedPostgresTestUrl({
  name: "IAM_API_TEST_DATABASE_URL",
  value: requireExternalTestUrl({
    environment: process.env,
    lane: "API composition",
    name: "IAM_API_TEST_DATABASE_URL",
  }),
  forbidden: [
    { name: "DATABASE_URL", value: process.env.DATABASE_URL },
    { name: "IAM_API_DATABASE_URL", value: process.env.IAM_API_DATABASE_URL },
  ],
});
const redisUrl = requireExternalTestUrl({
  environment: process.env,
  lane: "API composition",
  name: "IAM_API_TEST_REDIS_URL",
});
const redisConfig = parseDedicatedRedisTestUrl({ name: "IAM_API_TEST_REDIS_URL", value: redisUrl });
const suite = createProcessSmokeSuite({
  label: "unified API production entry",
  temporaryDirectoryPrefix: "iam-api-unified-",
  hostname: "localhost",
});
afterEach(suite.cleanup);

test(
  "production API serves root, Custom and OIDC with one live session generation and shared PostgreSQL/Redis owners",
  async () => {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const pg = await createApiPostgresTestHarness();
      const sql = pg.sql;
      registerCleanup(() => pg.close());
      const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
      registerCleanup(() => redis.disconnect());
      const subjectIdentifier = randomUUID();
      const userId = randomInt(100000000, 1000000000);
      const namespace = `api194:${randomUUID()}`;
      const custom = `custom-${randomUUID()}`;
      const managed = `managed-${randomUUID()}`;
      const oidc = `oidc-${randomUUID()}`;
      const redirectUri = "https://rp.example/complete";
      const secret = "original-secret";
      const rotatedSecret = "rotated-secret";
      registerCleanup(async () => {
        await cleanupRedisKeysMatchingOwnerMarkers({
          diagnosticLabel: "API unified composition",
          ownerMarkers: new Set([namespace, subjectIdentifier, custom, managed, oidc]),
          redis: createRedisKeyInventoryPort(redis),
        });
      });
      registerCleanup(async () => {
        await sql`DELETE FROM user_profile_dirty WHERE user_id = ${userId}`;
        await sql`DELETE FROM user_profile WHERE subject_identifier = ${subjectIdentifier}`;
        await sql`DELETE FROM client WHERE client_code IN (${custom}, ${managed}, ${oidc})`;
      });
      const facts = {
        schemaVersion: 3 as const,
        sourceDirtyVersion: "1",
        publishedAt: new Date().toISOString(),
        subjectIdentifier,
        profile: { username: "production194", name: "Published Name", phone: null },
        facts: { employments: [] },
      };
      await sql`INSERT INTO user_profile (user_id, subject_identifier, username, name, mobile, wx_id, status, is_delete, search_visible, profile_schema_version, source_dirty_version, detail, search_doc, subject_facts, rebuilt_at) VALUES (${userId}, ${subjectIdentifier}, 'production194', 'Published Name', NULL, NULL, 1, FALSE, TRUE, 3, 1, '{}'::jsonb, '{}'::jsonb, ${JSON.stringify(facts.facts)}::jsonb, NOW())`;
      await sql`INSERT INTO user_profile_dirty (user_id, dirty_version, status, reason_codes, dirty_at, processed_at) VALUES (${userId}, 1, 'processed', '["user-updated"]'::jsonb, NOW(), NOW())`;
      const factsCache = createSubjectFactsRedisCache(redis);
      await factsCache.publish(facts);
      const clientConfig = {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Business,
        callbackEndpoint: "https://rp.example/callback",
        validRedirectUrls: [redirectUri],
        subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
      };
      for (const code of [custom, managed]) {
        await sql`INSERT INTO client (client_code, client_name, client_secret, status, is_delete, ext_attributes, sso_enabled, sso_config, sso_secret, sso_credential_id, sso_secret_updated_at) VALUES (${code}, 'API Custom fixture', ${`internal-${code}`}, 1, FALSE, '{}'::jsonb, TRUE, ${JSON.stringify(clientConfig)}::jsonb, ${secret}, ${randomUUID()}, NOW())`;
      }
      await sql`INSERT INTO client (client_code, client_name, client_secret, status, is_delete, ext_attributes, sso_enabled, sso_config, sso_secret, sso_credential_id, sso_secret_updated_at) VALUES (${oidc}, 'API OIDC fixture', 'unused-internal', 1, FALSE, '{}'::jsonb, TRUE, ${JSON.stringify({ protocol: ClientSsoProtocol.Oidc, clientType: OidcClientType.Confidential, redirectUris: [redirectUri], postLogoutRedirectUris: [redirectUri], allowedScopes: [OidcScope.OpenId, OidcScope.Profile] })}::jsonb, ${secret}, ${randomUUID()}, NOW())`;
      const snapshots = createClientSnapshots({
        redis,
        source: {
          loadClient: async () => {
            throw new Error("Invalidation owner never reads PostgreSQL");
          },
          loadCredential: async () => null,
        },
      });
      const barrier = createSubjectAccessBarrier({
        store: createRedisSubjectAccessStore({ redis }),
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
      });
      await createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany(
        [{ subjectIdentifier, state: "enabled" }],
        new Date(),
      );
      const kernel = createUnifiedSessionKernel<SubjectAccessOperation>({
        redis,
        namespace,
        userSessionTtlSeconds: 86400,
        clientSessionTtlSeconds: 3600,
        assertOperationActive: requireSubjectAccessOperation,
      });
      let operations: ReturnType<typeof createSubjectAccessOperations>;
      const revocation = createUnifiedSubjectAccessSessionRevocation(kernel, {
        run: callback => operations.run(callback),
      });
      operations = createSubjectAccessOperations({ barrier, revocation });
      async function root() {
        return await operations.run(async (operation) => {
          const permission = await operation.acquireForAuthentication(subjectIdentifier);
          return await kernel
            .forOperation(operation)
            .createUserSession({
              subjectIdentifier,
              subjectContext: operation.getSubjectContext(permission),
              amr: ["pwd"],
            });
        });
      }
      const browser = await root();
      const otherBrowser = await root();
      let capture: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
      registerCleanup(() => capture?.dispose());
      const result = await suite.run({
        start(context) {
          const child = spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts"],
            cwd: fileURLToPath(new URL("../../", import.meta.url)),
            env: createEntryEnvironment(context, {
              IAM_API_DATABASE_URL: pg.databaseUrl,
              IAM_API_REDIS_HOST: redisConfig.host,
              IAM_API_REDIS_PORT: String(redisConfig.port),
              IAM_API_REDIS_PASSWORD: redisConfig.password,
              IAM_API_REDIS_DB: String(redisConfig.db),
              IAM_API_SESSION_KERNEL_NAMESPACE: namespace,
              IAM_API_OIDC_NAMESPACE: `${namespace}:oidc`,
              IAM_API_USER_SESSION_TTL_SECONDS: "86400",
              IAM_API_CLIENT_SESSION_TTL_SECONDS: "3600",
              IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "900",
              IAM_API_LOGIN_ENDPOINT: "/custom-entry",
            }),
          });
          capture = createBoundedProcessLogCapture(child, { maxBytes: 128 * 1024 });
          return child;
        },
        childReadinessEvidence: context => `server: http://${context.hostname}:${context.port}`,
        async probe(context, signal) {
          const origin = `http://${context.hostname}:${context.port}`;
          const readiness = await fetch(`${origin}/ready`, { signal });
          if (readiness.status !== 200)
            return undefined;
          const request = (path: string, init: RequestInit = {}) =>
            fetch(`${origin}${path}`, { ...init, headers: { "X-IAM-Entry-Network": "external", ...init.headers }, redirect: "manual", signal });
          async function authorize(client = custom, bearer = browser.bearer) {
            const response = await request(
              `/sso/authorize?${new URLSearchParams({ client, redirectUrl: redirectUri, state: "opaque-production-state" })}`,
              { headers: { Cookie: `global_session=${bearer}` } },
            );
            expect(response.status).toBe(302);
            return new URL(response.headers.get("location")!);
          }
          const exchange = (code: string, password = secret) =>
            request("/sso/token", {
              method: "POST",
              headers: {
                "Authorization": `Basic ${Buffer.from(`${custom}:${password}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ code, redirect_uri: redirectUri }),
            });
          const info = (token: string, client = custom) =>
            request("/public/user-info", { headers: { Authorization: token, Client: client } });
          try {
            await sql`UPDATE client SET sso_config = ${JSON.stringify({ protocol: clientConfig.protocol, callbackType: ClientSsoCallbackType.Managed, validRedirectUrls: clientConfig.validRedirectUrls, subjectClaims: clientConfig.subjectClaims, orcas: { enabled: false } })}::jsonb WHERE client_code = ${managed}`;
            await snapshots.invalidateClient(managed);
            const health = await request("/oidc/health");
            expect(health.status).toBe(200);
            const needsLogin = await request(
              `/sso/authorize?${new URLSearchParams({ client: custom, redirectUrl: redirectUri })}`,
            );
            expect(needsLogin.status).toBe(302);
            expect(needsLogin.headers.get("location")).toStartWith("/custom-entry?");
            const discovery = await request("/oidc/.well-known/openid-configuration");
            expect(await discovery.json()).toMatchObject({
              issuer: `${origin}/oidc`,
              authorization_endpoint: `${origin}/oidc/auth`,
              token_endpoint: `${origin}/oidc/token`,
              userinfo_endpoint: `${origin}/oidc/me`,
            });
            const jwks = await request("/oidc/jwks");
            const keys = await jwks.json();
            expect(keys.keys[0]).toMatchObject({ kid: "api-process", alg: "RS256" });
            expect(keys.keys.map((key: { kid: string }) => key.kid)).toEqual(["api-process", "api-previous"]);
            for (const key of keys.keys) expect(key).not.toHaveProperty("d");
            const before = await operations.run(operation =>
              kernel.forOperation(operation).resolveUserSession(browser.bearer),
            );
            const accepted = await authorize();
            const sessions = await operations.run(operation =>
              kernel
                .forOperation(operation)
                .listSessions({ kind: "clientSession", subjectIdentifier, offset: 0, limit: 10 }),
            );
            expect(sessions.records).toHaveLength(1);
            const relationship = sessions.records[0]!;
            expect(relationship.expiresAt - relationship.createdAt).toBe(3600000);
            expect(relationship.expiresAt).toBeLessThan(browser.observation.userSession.expiresAt);
            expect(accepted.searchParams.get("state")).toBe("opaque-production-state");
            const firstCode = accepted.searchParams.get("code")!;
            const firstResponse = await exchange(firstCode);
            expect(firstResponse.status).toBe(200);
            const first = (await firstResponse.json()).data;
            expect(typeof first.sid).toBe("string");
            expect(typeof first.ttl).toBe("number");
            expect(first.ttl).toBeGreaterThan(850);
            expect(first.ttl).toBeLessThanOrEqual(900);
            expect(first.subject.subjectIdentifier).toBe(subjectIdentifier);
            expect(first.subject.profile.name).toBe("Published Name");
            const firstInfo = await info(first.sid);
            expect(firstInfo.status).toBe(200);
            const replay = await exchange(firstCode);
            expect(replay.status).toBeGreaterThanOrEqual(400);
            expect(replay.headers.get("X-IAM-Client-Session-Revocation")).not.toBeNull();
            const afterReplay = await info(first.sid);
            expect(afterReplay.status).toBe(401);
            const rotatedCode = (await authorize()).searchParams.get("code")!;
            await sql`UPDATE client SET sso_secret = ${rotatedSecret}, sso_credential_id = ${randomUUID()}, sso_secret_updated_at = NOW() WHERE client_code = ${custom}`;
            await snapshots.invalidateClient(custom);
            const oldSecret = await exchange(rotatedCode);
            expect(oldSecret.status).toBe(400);
            const rotatedResponse = await exchange(rotatedCode, rotatedSecret);
            expect(rotatedResponse.status).toBe(200);
            const rotated = (await rotatedResponse.json()).data;
            await sql`UPDATE client SET status = ${ClientStatus.Maintenance} WHERE client_code = ${custom}`;
            await snapshots.invalidateClient(custom);
            const maintenance = await info(rotated.sid);
            expect(maintenance.status).toBe(503);
            expect(maintenance.headers.get("retry-after")).toBe("7");
            expect(maintenance.headers.getSetCookie()).toEqual([]);
            await sql`UPDATE client SET status = ${ClientStatus.Enable} WHERE client_code = ${custom}`;
            await snapshots.invalidateClient(custom);
            const resumed = await info(rotated.sid);
            expect(resumed.status).toBe(200);
            const managedLocation = await authorize(managed);
            const callback = await request(managedLocation.pathname + managedLocation.search);
            expect(callback.status).toBe(302);
            expect(callback.headers.getSetCookie()[0]).toContain("HttpOnly");
            const managedToken = new URL(callback.headers.get("location")!).searchParams.get("token")!;
            const managedInfo = await info(managedToken, managed);
            expect(managedInfo.status).toBe(200);
            const authz = await request("/auth/authz", {
              headers: { "Authorization": managedToken, "Client": managed, "X-Forwarded-Uri": "/home" },
            });
            expect(authz.status).toBe(200);
            expect(authz.headers.get("X-User-Info")).not.toBeNull();
            const internalAuthz = await request("/auth/internal-authz", {
              headers: { apikey: `internal-${managed}` },
            });
            expect(internalAuthz.status).toBe(200);
            const verifier = "production-pkce-verifier-abcdefghijklmnopqrstuvwxyz";
            const challenge = createHash("sha256").update(verifier).digest("base64url");
            const authorization = await request(
              `/oidc/auth?${new URLSearchParams({ client_id: oidc, redirect_uri: redirectUri, response_type: "code", scope: "openid profile", code_challenge: challenge, code_challenge_method: "S256", state: "oidc-production-state" })}`,
              { headers: { Cookie: `global_session=${browser.bearer}` } },
            );
            expect(authorization.status).toBe(303);
            const oidcCode = new URL(authorization.headers.get("location")!).searchParams.get("code")!;
            const token = await request("/oidc/token", {
              method: "POST",
              headers: {
                "Authorization": `Basic ${Buffer.from(`${oidc}:${secret}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code: oidcCode,
                redirect_uri: redirectUri,
                code_verifier: verifier,
              }),
            });
            expect(token.status).toBe(200);
            const oidcTokens = await token.json();
            expect(typeof oidcTokens.id_token).toBe("string");
            const jwt = oidcTokens.id_token.split(".");
            const signingPublicKey = createPublicKey({ key: keys.keys[0], format: "jwk" });
            expect(
              verify(
                "RSA-SHA256",
                Buffer.from(`${jwt[0]}.${jwt[1]}`),
                signingPublicKey,
                Buffer.from(jwt[2], "base64url"),
              ),
            ).toBe(true);
            const claims = JSON.parse(Buffer.from(jwt[1], "base64url").toString("utf8"));
            expect(claims.iss).toBe(`${origin}/oidc`);
            expect(claims.aud).toBe(oidc);
            const me = await request("/oidc/me", {
              headers: { Authorization: `Bearer ${oidcTokens.access_token}` },
            });
            expect(me.status).toBe(200);
            expect(await me.json()).toMatchObject({ sub: subjectIdentifier });
            const blocking = await barrier.beginBlocking(subjectIdentifier);
            const temporary = await info(rotated.sid);
            expect(temporary.status).toBe(503);
            expect(temporary.headers.getSetCookie()).toEqual([]);
            await barrier.rollback(blocking);
            const after = await operations.run(operation =>
              kernel.forOperation(operation).resolveUserSession(browser.bearer),
            );
            if (before.status !== "resolved" || after.status !== "resolved")
              throw new Error("Root unexpectedly terminated");
            expect(after.value.userSession.expiresAt).toBe(before.value.userSession.expiresAt);
            const logout = await request(`/sso/logout?${new URLSearchParams({ redirectUrl: redirectUri })}`, {
              headers: { Cookie: `global_session=${browser.bearer}` },
            });
            expect(logout.status).toBe(302);
            expect(logout.headers.getSetCookie()).toContainEqual(expect.stringContaining("global_session=;"));
            const denied = await info(rotated.sid);
            expect(denied.status).toBe(401);
            const deniedOidc = await request("/oidc/me", {
              headers: { Authorization: `Bearer ${oidcTokens.access_token}` },
            });
            expect(deniedOidc.status).toBe(401);
            const other = await operations.run(operation =>
              kernel.forOperation(operation).resolveUserSession(otherBrowser.bearer),
            );
            expect(other.status).toBe("resolved");
            return true;
          }
          catch (cause) {
            throw new FatalReadinessError("Unified API production behavior failed", { cause });
          }
        },
      });
      expect(result).toBe(true);
      await suite.cleanup();
    });
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);
