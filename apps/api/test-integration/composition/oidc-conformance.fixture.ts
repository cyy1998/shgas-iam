import type { OidcConformanceLifecycle } from "./oidc-conformance-lifecycle.fixture";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashSecret } from "@iam/api-core/security";
import { createSubjectAccessBootstrap } from "@iam/api-core/subject-access";
import { cleanupRedisKeysMatchingOwnerMarkers, createRedisKeyInventoryPort, parseDedicatedRedisTestUrl } from "@iam/api-core/testing/external-test-resources";
import { spawnOwnedProcessTree, terminateProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { ClientSsoProtocol, createLoginCredential, OidcClientType, OidcScope, UserType } from "@iam/contracts";
import { UserProfileDetailDocumentSchema } from "@iam/user-profile-read-model";
import Redis from "ioredis";
import { sm2 } from "sm-crypto";
import { createApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createEntryEnvironment } from "../process/api-env.fixture";
import { runConformanceCleanup } from "./oidc-conformance-lifecycle.fixture";

/** Caller supplies dedicated PG/Redis; this fixture never starts Docker or reads runtime env files. */
export async function createOidcConformanceCandidate(options: {
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  tls?: { keyPath: string; certPath: string };
  logPath: string;
  lifecycle?: OidcConformanceLifecycle;
}) {
  const checkpoint = async (phase: string) => options.lifecycle?.checkpoint(phase);
  await checkpoint("setup");
  const redisUrl = process.env.IAM_API_TEST_REDIS_URL;
  if (!redisUrl)
    throw new Error("IAM_API_TEST_REDIS_URL is required");
  const redisConfig = parseDedicatedRedisTestUrl({ name: "IAM_API_TEST_REDIS_URL", value: redisUrl });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "iam195-candidate-"));
  const cleanups: (() => unknown | Promise<unknown>)[] = [];
  function registerCleanup(cleanup: () => unknown | Promise<unknown>) {
    let pending = true;
    const once = async () => {
      if (!pending)
        return;
      pending = false;
      await cleanup();
    };
    cleanups.push(once);
    options.lifecycle?.own(once);
  }
  registerCleanup(() => rm(temporaryDirectory, { recursive: true, force: true }));
  async function close() {
    const failures: unknown[] = [];
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        await runConformanceCleanup(cleanup);
      }
      catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "OIDC candidate cleanup failed");
  }
  try {
    await writeFile(`${options.logPath}.owner.json`, JSON.stringify({ temporaryDirectory }));
    await checkpoint("temporary-directory-ready");
    const pg = await createApiPostgresTestHarness();
    registerCleanup(() => pg.close());
    await checkpoint("postgres-ready");
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    registerCleanup(() => redis.disconnect());
    const namespace = `oidc-conformance:${randomUUID()}`;
    const subjectIdentifier = randomUUID();
    const username = `oidc-${randomUUID()}`;
    const clientId = `oidc-${randomUUID()}`;
    const publicClientId = `oidc-${randomUUID()}`;
    const secondClientId = `oidc-${randomUUID()}`;
    registerCleanup(() => cleanupRedisKeysMatchingOwnerMarkers({
      diagnosticLabel: "OIDC conformance candidate",
      redis: createRedisKeyInventoryPort(redis),
      ownerMarkers: new Set([namespace, subjectIdentifier, username, clientId, publicClientId, secondClientId]),
    }));
    const password = "Conformance195!synthetic";
    const secret = "conformance195-synthetic-secret-for-local-testing";
    const passwordHash = await hashSecret(password, 4);
    await checkpoint("before-seed");
    const sql = pg.sql;
    const [user] = await sql`INSERT INTO "user" (subject_identifier, username, name, password, mobile_phone) VALUES (${subjectIdentifier}, ${username}, 'Conformance User', ${passwordHash}, '+8613800000195') RETURNING id`;
    if (!user)
      throw new Error("Synthetic user insert did not return an id");
    const detail = UserProfileDetailDocumentSchema.parse({ id: user.id, username, name: "Conformance User", mobile: "+8613800000195", wxId: null, userType: UserType.Formal, orderNum: 999999, status: 1, isDelete: false, createTime: new Date(), updateTime: new Date(), employments: [], roles: [], privileges: [] });
    await sql`INSERT INTO user_profile (user_id, subject_identifier, username, name, mobile, status, is_delete, search_visible, profile_schema_version, source_dirty_version, detail, search_doc, subject_facts, rebuilt_at) VALUES (${user.id}, ${subjectIdentifier}, ${username}, 'Conformance User', '+8613800000195', 1, FALSE, TRUE, 3, 1, ${JSON.stringify(detail)}::jsonb, '{}'::jsonb, '{"employments":[]}'::jsonb, NOW())`;
    await sql`INSERT INTO user_profile_dirty (user_id, dirty_version, status, reason_codes, dirty_at, processed_at) VALUES (${user.id}, 1, 'processed', '["user-updated"]'::jsonb, NOW(), NOW())`;
    for (const code of [clientId, secondClientId, publicClientId]) {
      const config = {
        protocol: ClientSsoProtocol.Oidc,
        clientType: code === publicClientId ? OidcClientType.Public : OidcClientType.Confidential,
        redirectUris: options.redirectUris,
        postLogoutRedirectUris: options.postLogoutRedirectUris,
        allowedScopes: [OidcScope.OpenId, OidcScope.Profile, OidcScope.Phone],
      };
      await sql`INSERT INTO client (client_code, client_name, client_secret, status, is_delete, ext_attributes, sso_enabled, sso_config, sso_secret, sso_credential_id, sso_secret_updated_at) VALUES (${code}, 'Conformance synthetic client', ${`internal-${code}`}, 1, FALSE, '{}'::jsonb, TRUE, ${JSON.stringify(config)}::jsonb, ${code === publicClientId ? null : secret}, ${code === publicClientId ? null : randomUUID()}, ${code === publicClientId ? null : new Date().toISOString()})`;
    }
    await createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
    await checkpoint("redis-seeded");
    const allocation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = allocation.port!;
    await allocation.stop(true);
    const internalOrigin = `http://127.0.0.1:${port}`;
    const proxy = options.tls
      ? Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          tls: { key: await readFile(options.tls.keyPath), cert: await readFile(options.tls.certPath) },
          async fetch(request) {
            const incoming = new URL(request.url);
            return await fetch(new Request(`${internalOrigin}${incoming.pathname}${incoming.search}`, request), { redirect: "manual" });
          },
        })
      : undefined;
    if (proxy)
      registerCleanup(() => proxy.stop(true));
    await checkpoint("before-api-start");
    const origin = proxy ? `https://127.0.0.1:${proxy.port}` : internalOrigin;
    const context = { attemptNumber: 1, hostname: "127.0.0.1", port, temporaryDirectory };
    const loginKeys = sm2.generateKeyPairHex();
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
        IAM_API_LOGIN_ENDPOINT: `${origin}/login`,
        IAM_API_OIDC_ISSUER: `${origin}/oidc`,
        IAM_API_OIDC_PUBLIC_ORIGIN: origin,
        IAM_API_SSO_INTERNAL_ORIGIN: origin,
        IAM_API_SSO_EXTERNAL_ORIGIN: origin,
        IAM_API_OIDC_COOKIE_SECURE: String(Boolean(proxy)),
        IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ "entry-smoke": loginKeys.privateKey }),
      }),
    });
    let log = "";
    const capture = (chunk: unknown) => {
      log = `${log}${String(chunk)}`.slice(-2 * 1024 * 1024);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    registerCleanup(async () => {
      try {
        await terminateProcessTree(child, { timeoutMs: 5000 });
      }
      finally {
        await writeFile(options.logPath, log, "utf8");
      }
    });
    await writeFile(`${options.logPath}.owner.json`, JSON.stringify({ pid: child.pid, port, proxyPort: proxy?.port, namespace, temporaryDirectory, schema: new URL(pg.databaseUrl).searchParams.get("search_path") }));
    const deadline = Date.now() + 30000;
    while (true) {
      await checkpoint("api-readiness");
      let ready = false;
      try {
        ready = (await fetch(`${internalOrigin}/ready`, { signal: AbortSignal.timeout(1000) })).status === 200;
      }
      catch {
        /* Readiness only; behavioral requests are never retried. */
      }
      if (ready)
        break;
      if (child.exitCode !== null || Date.now() >= deadline)
        throw new Error(`Candidate API did not become ready: ${log}`);
      await Bun.sleep(100);
    }
    await checkpoint("api-ready");
    return {
      origin,
      clientId,
      publicClientId,
      secondClientId,
      secret,
      subjectIdentifier,
      username,
      loginCredential: { username, password, kid: "entry-smoke", publicKey: loginKeys.publicKey },
      close,
      credential() {
        return createLoginCredential({ username, password, kid: "entry-smoke", publicKey: loginKeys.publicKey, now: Date.now(), nonce: randomUUID() });
      },
    };
  }
  catch (error) {
    try {
      await close();
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Candidate setup and cleanup failed");
    }
    throw error;
  }
}
