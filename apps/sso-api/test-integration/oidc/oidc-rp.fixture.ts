import { randomUUID } from "node:crypto";
import { ClientSsoProtocol, OidcClientType, OidcScope } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import {
  createSubjectAccessBarrier,
  requireSubjectAccessOperation,
  type SubjectAccessOperation,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { parseDedicatedRedisTestUrl } from "@iam/test-support/external-test-resources";
import { createProtocolOperations } from "@sso-api/composition/sessions";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import { createSsoApiApp } from "../../src/app";
import { parseSsoApiEnv } from "../../src/env";
import { createEntryEnvironment } from "../support/api-env.fixture";
import { closeApiRedisConnection, ownApiTestExecutor } from "../support/fixture-lifecycle";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createTestUserSession } from "../support/test-user-session.fixture";
import { publishUserDocument } from "../support/user-document.fixture";
import { cleanupAfterFixtureFailure, closeFixtureResources } from "./oidc.fixture";

export async function createOidcRpFixture(redirectUri: string) {
  const redisUrl = process.env.IAM_TEST_REDIS_URL;
  if (!redisUrl) throw new Error("IAM_TEST_REDIS_URL is required");
  parseDedicatedRedisTestUrl({ name: "IAM_TEST_REDIS_URL", value: redisUrl });
  const cleanups: (() => unknown | Promise<unknown>)[] = [];
  const registerCleanup = (cleanup: () => unknown | Promise<unknown>) => cleanups.push(cleanup);
  const close = ownApiTestExecutor(() => closeFixtureResources(cleanups.toReversed()));
  try {
    const pg = await createApiPostgresTestHarness(registerCleanup);
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    registerCleanup(() => closeApiRedisConnection(redis));
    const namespace = `oidc-rp:${randomUUID()}`;
    const secret = "rp-synthetic-secret-for-local-testing";
    const kernel = createUnifiedSessionKernel<SubjectAccessOperation>({
      redis,
      namespace,
      userSessionTtlSeconds: 86400,
      clientSessionTtlSeconds: 86400,
      assertOperationActive: requireSubjectAccessOperation,
    });
    const operations = createProtocolOperations(
      kernel,
      createSubjectAccessBarrier({
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
        store: createRedisSubjectAccessStore({ redis }),
      }),
    );
    const fixtureIdentities = new Map<string, string>();
    let nextMobileSuffix = 1;
    async function seedIdentity() {
      const subjectIdentifier = randomUUID();
      const username = `oidc-${randomUUID()}`;
      const clientId = `oidc-${randomUUID()}`;
      const publicClientId = `oidc-${randomUUID()}`;
      const mobile = `+86138${String(nextMobileSuffix++).padStart(8, "0")}`;
      const sql = pg.sql;
      const [user] =
        await sql`INSERT INTO "user" (subject_identifier, username, name, mobile_phone) VALUES (${subjectIdentifier}, ${username}, 'Conformance User', ${mobile}) RETURNING id`;
      if (!user) throw new Error("Synthetic user insert did not return an id");
      await publishUserDocument(pg.db, user.id);
      await sql`INSERT INTO user_document_rebuild_state (user_id, version, status, reason_codes, dirty_at, processed_at) VALUES (${user.id}, 1, 'processed', '["user-updated"]'::jsonb, NOW(), NOW())`;
      for (const code of [clientId, publicClientId]) {
        const config = {
          protocol: ClientSsoProtocol.Oidc,
          clientType: code === publicClientId ? OidcClientType.Public : OidcClientType.Confidential,
          redirectUris: [redirectUri],
          postLogoutRedirectUris: [redirectUri],
          allowedScopes: [OidcScope.OpenId, OidcScope.Profile, OidcScope.Phone],
        };
        await sql`INSERT INTO client (client_code, client_name, client_secret, status, is_delete, ext_attributes, sso_enabled, sso_config, sso_secret, sso_credential_id, sso_secret_updated_at) VALUES (${code}, 'Conformance synthetic client', ${`internal-${code}`}, 1, FALSE, '{}'::jsonb, TRUE, ${JSON.stringify(config)}::jsonb, ${code === publicClientId ? null : secret}, ${code === publicClientId ? null : randomUUID()}, ${code === publicClientId ? null : new Date().toISOString()})`;
      }
      await createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany(
        [{ subjectIdentifier, state: "enabled" }],
        new Date(),
      );
      const fixtureLoginKey = randomUUID();
      fixtureIdentities.set(fixtureLoginKey, subjectIdentifier);
      return { subjectIdentifier, username, clientId, publicClientId, secret, mobile, fixtureLoginKey };
    }

    let runtime: Awaited<ReturnType<typeof createSsoApiApp>> | undefined;
    function listen(network: "internal" | "external") {
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request, server) {
          if (new URL(request.url).pathname === "/__fixture/login") {
            const subject = fixtureIdentities.get(request.headers.get("X-Fixture-Login-Key") ?? "");
            if (request.method !== "POST" || !subject) return new Response(null, { status: 404 });
            const bearer = await createTestUserSession(kernel, operations, subject);
            return new Response(null, {
              headers: { "Set-Cookie": `global_session=${bearer}; Path=/; HttpOnly; SameSite=Lax` },
            });
          }
          const forwarded = new Request(request);
          forwarded.headers.set("X-IAM-Entry-Network", network);
          const peer = server.requestIP(request);
          if (peer) forwarded.headers.set("X-Forwarded-For", peer.address);
          return runtime?.app.fetch(forwarded) ?? new Response(null, { status: 503 });
        },
      });
      return server;
    }
    const internal = listen("internal");
    registerCleanup(() => internal.stop(true));
    const external = listen("external");
    registerCleanup(() => external.stop(true));
    const origins = { internal: internal.url.origin, external: external.url.origin };
    const env = parseSsoApiEnv(
      createEntryEnvironment(
        { hostname: "127.0.0.1", port: internal.port!, temporaryDirectory: "/tmp" },
        {
          IAM_SSO_API_DATABASE_URL: pg.databaseUrl,
          IAM_SSO_API_REDIS_URL: redisUrl,
          IAM_SSO_API_SESSION_KERNEL_NAMESPACE: namespace,
          IAM_SSO_API_OIDC_NAMESPACE: `${namespace}:oidc`,
          IAM_SSO_API_LOG_LEVEL: "silent",
          IAM_SSO_API_LOGIN_ENDPOINT: "/login",
          IAM_SSO_API_SSO_INTERNAL_ORIGIN: origins.internal,
          IAM_SSO_API_SSO_EXTERNAL_ORIGIN: origins.external,
        },
      ),
    );
    runtime = await createSsoApiApp({ env });
    const closeRuntime = runtime.close;
    cleanups.splice(cleanups.length - 2, 0, closeRuntime);
    return {
      origins,
      async createIdentity(publicClientAdmissionFilter?: Record<string, unknown>) {
        const identity = await seedIdentity();
        if (publicClientAdmissionFilter) {
          await pg.db
            .update(clients)
            .set({ admissionEnabled: true, admissionFilter: publicClientAdmissionFilter })
            .where(eq(clients.clientCode, identity.publicClientId));
        }
        return identity;
      },
    };
  } catch (error) {
    return await cleanupAfterFixtureFailure(error, close);
  }
}
