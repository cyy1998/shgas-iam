import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import { createClientSnapshotMaintenanceTestFixture } from "@iam/api-core/client-snapshot/testing";
import { createRedisLoginRestrictionStore } from "@iam/api-core/login-restriction";
import { hashSecret } from "@iam/api-core/security";
import { createSubjectAccessBootstrap } from "@iam/api-core/subject-access";
import { parseDedicatedRedisTestUrl } from "@iam/api-core/testing/external-test-resources";
import { runProcessCommandSmoke, spawnOwnedProcessTree, terminateProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { createLoginCredential, UserType } from "@iam/contracts";
import { createOfflineGrantVerifier } from "@iam/custom-sso/maintenance";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { createJobQueue } from "@iam/jobs";
import { createOfflineOidcVerifier } from "@iam/oidc/offline-maintenance";
import { createOfflineSessionVerifier } from "@iam/session-kernel/maintenance";
import { createSessionMaintenanceTestFixture } from "@iam/session-kernel/testing";
import { createSubjectFactsReader, createSubjectFactsRedisCache, UserProfileDetailDocumentSchema } from "@iam/user-profile-read-model";
import Redis from "ioredis";
import { sm2 } from "sm-crypto";
import { createApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createEntryEnvironment } from "../process/api-env.fixture";
import { startB648Source, writeB648OidcState } from "./b648-source-runtime.fixture";
import { upgradeBrowser, upgradeRedirectUri } from "./dual-entry-upgrade-http.fixture";
import { verifyUpgradeSource } from "./dual-entry-upgrade.fixture";
import { withOidcConformanceLifecycle } from "./oidc-conformance-lifecycle.fixture";

const sourceRevision = "b6481f2de5c2930fc381d99e70520e0783091e9d";
const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

async function allocatePort() {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port!;
  await server.stop(true);
  return port;
}

/** Explicit, exclusive-resource rehearsal. Historical state is written only by the frozen HTTP runtimes. */
export async function runB648Upgrade(sourceDirectory: string, evidenceDirectory: string) {
  const report = await withOidcConformanceLifecycle(async (lifecycle) => {
    await mkdir(evidenceDirectory, { recursive: true });
    const verifiedSourceFiles = await verifyUpgradeSource(sourceDirectory, sourceRevision);
    const lockfileDigest = digest(await readFile(join(sourceDirectory, "pnpm-lock.yaml")));
    const redisUrl = process.env.IAM_API_TEST_REDIS_URL;
    assert.ok(redisUrl, "Dedicated IAM_API_TEST_REDIS_URL is required");
    const redisConfig = parseDedicatedRedisTestUrl({ name: "IAM_API_TEST_REDIS_URL", value: redisUrl });
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
    lifecycle.own(() => redis.disconnect());
    const observer = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
    lifecycle.own(() => observer.disconnect());
    // Source Provider/redemption are global owners: a random namespace alone is not sufficient isolation.
    assert.equal(await redis.dbsize(), 0, "b648 rehearsal requires an empty, task-exclusive Redis logical DB");
    const pg = await createApiPostgresTestHarness({ migrationsFolder: join(sourceDirectory, "packages/db/src/migrations") });
    lifecycle.own(() => pg.close());
    const namespace = `iam206:${randomUUID()}`;
    const oidcNamespace = `${namespace}:oidc`;
    const subjectIdentifier = randomUUID();
    const username = `iam206-${randomUUID()}`;
    const password = "Iam206!synthetic-password";
    const oldSecret = "iam206-synthetic-old-secret";
    const managedClient = `managed-${randomUUID()}`;
    const businessClient = `business-${randomUUID()}`;
    const oidcClient = `oidc-${randomUUID()}`;
    const clientCodes = [managedClient, businessClient, oidcClient];
    const apiPort = await allocatePort();
    const providerPort = await allocatePort();
    let sourceRouting = true;
    const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      const url = new URL(request.url);
      const port = sourceRouting && url.pathname.startsWith("/oidc") ? providerPort : apiPort;
      const forwarded = new Request(`http://127.0.0.1:${port}${url.pathname}${url.search}`, request);
      forwarded.headers.set("X-IAM-Entry-Network", "external");
      forwarded.headers.set("Connection", "close");
      return await fetch(forwarded, { redirect: "manual" });
    } });
    lifecycle.own(() => proxy.stop(true));
    const origin = `http://127.0.0.1:${proxy.port}`;
    const landing = `${origin}/work/orders?view=all`;
    const keys = sm2.generateKeyPairHex();
    const environment = createEntryEnvironment({ hostname: "127.0.0.1", port: apiPort, temporaryDirectory: evidenceDirectory, attemptNumber: 1 }, {
      IAM_API_DATABASE_URL: pg.databaseUrl,
      IAM_API_REDIS_HOST: redisConfig.host,
      IAM_API_REDIS_PORT: String(redisConfig.port),
      IAM_API_REDIS_PASSWORD: redisConfig.password,
      IAM_API_REDIS_DB: String(redisConfig.db),
      IAM_API_SESSION_KERNEL_NAMESPACE: namespace,
      IAM_API_OIDC_NAMESPACE: oidcNamespace,
      IAM_API_SSO_INTERNAL_ORIGIN: origin,
      IAM_API_SSO_EXTERNAL_ORIGIN: origin,
      IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ "entry-smoke": keys.privateKey }),
    });
    const credential = () => createLoginCredential({ username, password, kid: "entry-smoke", publicKey: keys.publicKey, now: Date.now(), nonce: randomUUID() });
    const commands: unknown[] = [];
    const sql = pg.sql;
    const journal = new URL(pg.databaseUrl).searchParams.get("search_path")!;
    const commandUrl = new URL(pg.databaseUrl);
    commandUrl.searchParams.set("options", `-csearch_path=${journal}`);
    async function command(script: string, args: string[], database = false, expectedExitCode = 0) {
      await lifecycle.checkpoint(script);
      const argv = [...args, ...(database ? ["--migrations-schema", journal] : [])];
      let processId: number | undefined;
      const result = await runProcessCommandSmoke({
        label: `b648 rehearsal ${script}`,
        completionTimeoutMs: 75000,
        cleanupTimeoutMs: 5000,
        expectedExitCode,
        maxOutputBytes: 256 * 1024,
        start: () => {
          const child = spawnOwnedProcessTree({ executable: process.execPath, args: ["--no-env-file", "run", script, ...argv], cwd: join(workspace, "apps/worker"), env: {
            ...environment,
            DATABASE_URL: commandUrl.href,
            IAM_WORKER_DATABASE_URL: commandUrl.href,
            IAM_WORKER_REDIS_HOST: redisConfig.host,
            IAM_WORKER_REDIS_PORT: String(redisConfig.port),
            IAM_WORKER_REDIS_PASSWORD: redisConfig.password,
            IAM_WORKER_REDIS_DB: String(redisConfig.db),
          } });
          processId = child.pid;
          return child;
        },
      });
      assert.ok(processId);
      assert.ok(!result.output.includes(oldSecret));
      const line = result.output.split(/\r?\n/u).find(line => line.includes("{\"version\""));
      const report = line ? JSON.parse(line.slice(line.indexOf("{"))) : undefined;
      commands.push({ script, args: argv, processId, expectedExitCode, report });
      await writeFile(join(evidenceDirectory, "commands.json"), JSON.stringify(commands, null, 2));
      return report;
    }
    const stage = (mode: string, flags: string[] = []) => command("scripts/b648-upgrade/index.ts", [mode, "--writers-stopped", ...flags], true);
    async function baseline(keys: string[]) {
      const observations = [];
      for (const key of keys.sort()) {
        const bytes = await observer.dumpBuffer(key);
        if (bytes)
          observations.push({ key, valueDigest: digest(bytes), absoluteExpiry: await observer.pexpiretime(key) });
      }
      return observations;
    }
    await lifecycle.checkpoint("seed");
    const passwordHash = await hashSecret(password, 4);
    const oldSecretHash = await hashSecret(oldSecret, 4);
    const [user] = await sql`INSERT INTO "user" (subject_identifier, username, name, password, mobile_phone) VALUES (${subjectIdentifier}, ${username}, 'Upgrade User', ${passwordHash}, '+8613800000206') RETURNING id`;
    assert.ok(user);
    const detail = UserProfileDetailDocumentSchema.parse({ id: user.id, username, name: "Upgrade User", mobile: "+8613800000206", wxId: null, userType: UserType.Formal, orderNum: 999999, status: 1, isDelete: false, createTime: new Date(), updateTime: new Date(), employments: [], roles: [], privileges: [] });
    await sql`INSERT INTO user_profile (user_id, subject_identifier, username, name, mobile, status, is_delete, search_visible, profile_schema_version, source_dirty_version, detail, search_doc, subject_facts, rebuilt_at) VALUES (${user.id}, ${subjectIdentifier}, ${username}, 'Upgrade User', '+8613800000206', 1, FALSE, TRUE, 3, 1, ${JSON.stringify(detail)}::jsonb, '{}'::jsonb, '{"employments":[]}'::jsonb, NOW())`;
    await sql`INSERT INTO user_profile_dirty (user_id, dirty_version, status, reason_codes, dirty_at, processed_at) VALUES (${user.id}, 1, 'processed', '["user-updated"]'::jsonb, NOW(), NOW())`;
    for (const code of clientCodes) {
      const custom = code === oidcClient ? null : { mode: code === managedClient ? "gateway" : "independent", ...(code === managedClient ? { orcas: { enabled: false } } : {}), ...(code === businessClient ? { callbackEndpoint: upgradeRedirectUri, logoutEndpoint: "https://rp.example/logout" } : {}), validRedirectUrls: [`${origin}/work/*`], subjectClaims: ["subjectIdentifier", "profile:username"] };
      const oidc = code !== oidcClient ? null : { clientType: "confidential", tokenEndpointAuthMethod: "client_secret_basic", redirectUris: [upgradeRedirectUri], postLogoutRedirectUris: [upgradeRedirectUri], allowedScopes: ["openid", "profile"] };
      await sql`INSERT INTO client (client_code, client_name, client_secret, ext_attributes, custom_sso_enabled, custom_sso_config, custom_sso_secret_hash, custom_sso_config_version, oidc_enabled, oidc_config, oidc_secret_hash, oidc_config_version) VALUES (${code}, 'Upgrade client', ${`internal-${code}`}, '{}'::jsonb, ${custom !== null}, ${custom ? JSON.stringify(custom) : null}::jsonb, ${code === businessClient ? oldSecretHash : null}, ${custom ? 1 : 0}, ${oidc !== null}, ${oidc ? JSON.stringify(oidc) : null}::jsonb, ${oidc ? oldSecretHash : null}, ${oidc ? 1 : 0})`;
    }
    await sql`INSERT INTO role (role_code, role_name, client_id) SELECT 'upgrade-role', 'Upgrade Role', id FROM client WHERE client_code=${businessClient}`;
    await createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
    const facts = await createSubjectFactsReader({ db: pg.db, cache: createSubjectFactsRedisCache(redis) }).read(subjectIdentifier);
    assert.ok(facts);
    const restriction = createRedisLoginRestrictionStore({ redis });
    for (let i = 0; i < 5; i++)
      await restriction.recordFailure({ userId: user.id + 1000, triggerMethod: "password", failureMember: randomUUID() });
    const queue = createJobQueue({ name: "iam206-preservation", redis: redisConfig });
    lifecycle.own(() => queue.close());
    await queue.add("retained", { synthetic: true }, { jobId: randomUUID(), delay: 3600000 });
    const old = await startB648Source({ sourceDirectory, environment, origin, apiPort, providerPort, logDirectory: evidenceDirectory });
    lifecycle.own(() => old.stop());
    await lifecycle.checkpoint("source-ready");
    const browser = upgradeBrowser(origin);
    const login = async (jar: ReturnType<typeof upgradeBrowser>) => {
      const response = await jar.request("/auth/login/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: credential() }) });
      assert.equal(response.status, 200, `Password login failed: ${await response.text()}`);
      assert.ok(jar.cookies.get("global_session"));
    };
    await login(browser);
    const authorize = (client: string) => `/sso/authorize?${new URLSearchParams({ client, redirectUrl: landing, state: "b648-preserved-state" })}`;
    async function customCode(client: string) {
      const response = await browser.request(authorize(client));
      assert.equal(response.status, 302);
      const location = new URL(response.headers.get("location")!);
      assert.ok(location.searchParams.get("code"));
      return location;
    }
    async function customExchange(code: URL, secret: string) {
      return await browser.request("/sso/token", { method: "POST", headers: { "Authorization": `Basic ${Buffer.from(`${businessClient}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: code.searchParams.get("code")!, redirect_uri: landing }) });
    }
    const managedIssued = await customCode(managedClient);
    const managedDone = await browser.request(managedIssued.href);
    assert.equal(managedDone.status, 302);
    const managedToken = new URL(managedDone.headers.get("location")!).searchParams.get("token")!;
    assert.ok(managedToken);
    const businessDone = await customExchange(await customCode(businessClient), oldSecret);
    assert.equal(businessDone.status, 200);
    const businessToken = (await businessDone.json()).data.sid;
    const oldCodes = [await customCode(managedClient), await customCode(businessClient)];
    for (const [client, token] of [[managedClient, managedToken], [businessClient, businessToken]])
      assert.equal((await browser.request("/public/user-info", { headers: { Client: client!, Authorization: token! } })).status, 200);
    const anonymousCustom = upgradeBrowser(origin);
    const sourceLoginRedirect = await anonymousCustom.request(authorize(managedClient));
    assert.equal(sourceLoginRedirect.status, 302);
    const sourceLogin = new URL(sourceLoginRedirect.headers.get("location")!);
    assert.equal(sourceLogin.pathname, "/login");
    assert.equal(sourceLogin.searchParams.get("client"), managedClient);
    assert.equal(sourceLogin.searchParams.get("redirectUrl"), landing);
    const continuationPath = `/sso/login-guard?${sourceLogin.searchParams}`;
    const sourceGuard = await browser.request(continuationPath);
    assert.equal(sourceGuard.status, 200);
    assert.equal((await sourceGuard.json()).data.decision, "continue");
    const oidc = await writeB648OidcState({ origin, clientCode: oidcClient, secret: oldSecret, rootCookies: browser.cookies });
    await lifecycle.checkpoint("source-written");
    const oldRoot = new Map(browser.cookies);
    await old.stop();
    // Let the maintenance owners select their exact opaque keys; the consumer never copies private prefixes/decoders.
    const targetKeys = new Set<string>();
    const ownerScan = {
      async scan(cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) {
        const page = await observer.scan(cursor, match, pattern, count, limit);
        for (const key of page[1])
          targetKeys.add(key);
        return page;
      },
    };
    await createOfflineSessionVerifier(ownerScan, namespace).verify();
    await createOfflineGrantVerifier(ownerScan).verify();
    await createOfflineOidcVerifier(ownerScan).verify();
    const snapshotKeys = createClientSnapshotMaintenanceTestFixture(redis, () => {});
    for (const client of clientCodes) {
      for (const key of snapshotKeys.trackClient(client))
        targetKeys.add(key);
    }
    const nonTarget = await baseline((await observer.keys("*")).filter(key => !targetKeys.has(key)));
    assert.ok(nonTarget.length > 5);
    const pgBaseline = {
      users: Array.from(await sql`SELECT to_jsonb(t) AS value FROM "user" t ORDER BY id`),
      roles: Array.from(await sql`SELECT to_jsonb(t) AS value FROM role t ORDER BY id`),
      audit: Array.from(await sql`SELECT to_jsonb(t) AS value FROM audit_log t ORDER BY id`),
      clients: Array.from(await sql`SELECT id, client_code, client_secret, client_name, status, is_delete, ext_attributes FROM client ORDER BY id`),
    };
    assert.ok(pgBaseline.audit.length > 0);
    await stage("preflight");
    await stage("expand");
    await stage("prepare");
    const inventory = await stage("inventory");
    const manifestPath = join(evidenceDirectory, "manifest.json");
    const receiptPath = join(evidenceDirectory, "database-receipt.json");
    await writeFile(manifestPath, JSON.stringify({ version: 1, layout: "dual-to-single-v1", clients: inventory.report.clients.map((row: { clientCode: string; sourceDigest: string; credentialId: string }) => ({ clientCode: row.clientCode, sourceDigest: row.sourceDigest, credentialId: row.credentialId })) }));
    const manifestFlags = ["--manifest", manifestPath];
    const receiptFlags = [...manifestFlags, "--receipt", receiptPath];
    await stage("apply", manifestFlags);
    await stage("verify", manifestFlags);
    await stage("contract", receiptFlags);
    await stage("finalize", receiptFlags);
    await stage("verify-final", receiptFlags);
    const sourceScope = ["--layout", "source", "--owner", "all", "--kernel-namespace", namespace, "--writers-stopped", "--drained"];
    const initialState = await command("online-auth:state", ["inventory", ...sourceScope]);
    assert.equal(initialState.status, "completed");
    for (const owner of initialState.owners) {
      // b648 has already retired the redemption writer; the source owner still gates any restored inventory.
      if (owner.owner !== "source-custom-grants")
        assert.ok(owner.matching > 0, `HTTP writer inventory required: ${JSON.stringify(owner)}`);
    }
    const corrupt = await createSessionMaintenanceTestFixture(redis, namespace, () => {}).seedCorruptSource();
    const corruptDump = await redis.dumpBuffer(corrupt);
    const failed = await command("online-auth:state", ["apply", ...sourceScope], false, 1);
    assert.notEqual(failed.status, "completed");
    assert.deepEqual(await redis.dumpBuffer(corrupt), corruptDump);
    await command("online-auth:state", ["verify", ...sourceScope], false, 1);
    // Only the deliberately introduced fault is repaired; real unknown source state would keep the window closed.
    await redis.unlink(corrupt);
    await command("online-auth:state", ["apply", ...sourceScope]);
    const cleared = await command("online-auth:state", ["verify", ...sourceScope]);
    assert.ok(cleared.owners.every((owner: { matching: number }) => owner.matching === 0));
    const targetScope = ["--layout", "unified", "--owner", "all", "--kernel-namespace", namespace, "--custom-namespace", namespace, "--oidc-namespace", oidcNamespace, "--writers-stopped", "--drained"];
    for (const mode of ["inventory", "apply", "verify"])
      await command("online-auth:state", [mode, ...targetScope]);
    await createClientSnapshotMaintenanceTestFixture(redis, () => {}).seedInvalidClientPayload(managedClient);
    await command("client-snapshot:repair", ["--all", "--writers-stopped", "--drained"]);
    await command("client-snapshot:verify", ["--all", "--writers-stopped", "--drained"]);
    const preservation = [];
    for (const item of nonTarget) {
      const bytes = await observer.dumpBuffer(item.key);
      const absoluteExpiry = await observer.pexpiretime(item.key);
      const naturallyExpired = !bytes && item.absoluteExpiry >= 0 && item.absoluteExpiry <= Date.now();
      if (!naturallyExpired) {
        assert.ok(bytes);
        assert.equal(digest(bytes), item.valueDigest);
        assert.equal(absoluteExpiry, item.absoluteExpiry);
      }
      preservation.push({ keyDigest: digest(item.key), valueDigest: item.valueDigest, absoluteExpiry: item.absoluteExpiry, status: naturallyExpired ? "naturally-expired" : "retained" });
    }
    assert.deepEqual(Array.from(await sql`SELECT to_jsonb(t) AS value FROM "user" t ORDER BY id`), pgBaseline.users);
    assert.deepEqual(Array.from(await sql`SELECT to_jsonb(t) AS value FROM role t ORDER BY id`), pgBaseline.roles);
    assert.deepEqual(Array.from(await sql`SELECT to_jsonb(t) AS value FROM audit_log t ORDER BY id`), pgBaseline.audit);
    assert.deepEqual(Array.from(await sql`SELECT id, client_code, client_secret, client_name, status, is_delete, ext_attributes FROM client ORDER BY id`), pgBaseline.clients);
    const snapshot = await createClientSnapshots({ redis, source: createClientSnapshotRepository(pg.db) }).client.acquire(managedClient);
    assert.equal(snapshot.kind, "present");
    if (snapshot.kind === "present")
      assert.equal("callbackEndpoint" in snapshot.value.ssoConfig!, false);
    sourceRouting = false;
    const current = spawnOwnedProcessTree({ executable: process.execPath, args: ["--no-env-file", "run", "src/index.ts"], cwd: join(workspace, "apps/api"), env: environment });
    lifecycle.own(() => terminateProcessTree(current, { timeoutMs: 5000 }));
    let spawnError: unknown;
    current.once("error", (error) => {
      spawnError = error;
    });
    let currentLog = "";
    current.stdout?.on("data", chunk => currentLog = `${currentLog}${chunk}`.slice(-262144));
    current.stderr?.on("data", chunk => currentLog = `${currentLog}${chunk}`.slice(-262144));
    lifecycle.own(() => writeFile(join(evidenceDirectory, "target-api.log"), currentLog));
    const deadline = Date.now() + 30000;
    while (true) {
      await lifecycle.checkpoint("target-readiness");
      let ready = false;
      try {
        ready = (await fetch(`http://127.0.0.1:${apiPort}/ready`, { signal: AbortSignal.timeout(1000) })).status === 200;
      }
      catch { /* Readiness polling only. */ }
      if (ready)
        break;
      assert.ok(!spawnError && current.exitCode === null && Date.now() < deadline, `Latest API readiness failed: ${currentLog}`);
      await Bun.sleep(100);
    }
    const replay = upgradeBrowser(origin, oldRoot);
    for (const [client, token] of [[managedClient, managedToken], [businessClient, businessToken]])
      assert.equal((await replay.request("/public/user-info", { headers: { Client: client!, Authorization: token! } })).status, 401);
    assert.equal((await replay.request(oldCodes[0]!.href)).status, 401);
    const secrets = await sql`SELECT client_code, sso_secret FROM client WHERE client_code IN (${businessClient}, ${oidcClient})`;
    const businessSecret = secrets.find(row => row.client_code === businessClient)!.sso_secret;
    const oidcSecret = secrets.find(row => row.client_code === oidcClient)!.sso_secret;
    assert.notEqual(businessSecret, oldSecret);
    assert.notEqual(oidcSecret, oldSecret);
    assert.equal((await customExchange(oldCodes[1]!, businessSecret)).status, 400);
    const oldGuard = await replay.request(continuationPath);
    assert.equal(oldGuard.status, 200);
    assert.equal((await oldGuard.json()).data.decision, "login");
    const oldRootAuthorization = await upgradeBrowser(origin, oldRoot).request(authorize(managedClient));
    assert.equal(oldRootAuthorization.status, 302);
    assert.equal(new URL(oldRootAuthorization.headers.get("location")!, origin).pathname, "/login");
    assert.equal((await replay.request("/oidc/me", { headers: { Authorization: `Bearer ${oidc.token}` } })).status, 401);
    const oldOidcExchange = await replay.request("/oidc/token", { method: "POST", headers: { "Authorization": `Basic ${Buffer.from(`${oidcClient}:${oidcSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: oidc.code, redirect_uri: upgradeRedirectUri, code_verifier: oidc.verifier }) });
    assert.equal(oldOidcExchange.status, 400);
    assert.equal((await upgradeBrowser(origin, oidc.continuation.cookies).request(oidc.continuation.guardPath)).status, 400);
    assert.equal((await upgradeBrowser(origin, oidc.continuation.cookies).request(oidc.continuation.resumePath)).status, 400);
    await login(browser);
    const newManaged = await browser.request((await customCode(managedClient)).href);
    assert.equal(newManaged.status, 302);
    const newLanding = new URL(newManaged.headers.get("location")!);
    assert.equal(newLanding.origin, origin);
    assert.equal(newLanding.pathname, "/work/orders");
    assert.equal(newLanding.searchParams.get("view"), "all");
    assert.equal(newLanding.searchParams.get("state"), "b648-preserved-state");
    assert.ok(newLanding.searchParams.get("token"));
    const businessCode = await customCode(businessClient);
    assert.equal((await customExchange(businessCode, oldSecret)).status, 400);
    const newBusiness = await customExchange(businessCode, businessSecret);
    assert.equal(newBusiness.status, 200);
    const newBusinessToken = (await newBusiness.json()).data.sid;
    for (const [client, token] of [[managedClient, newLanding.searchParams.get("token")!], [businessClient, newBusinessToken]])
      assert.equal((await browser.request("/public/user-info", { headers: { Client: client!, Authorization: token! } })).status, 200);
    const newOidc = await writeB648OidcState({ origin, clientCode: oidcClient, secret: oidcSecret, rootCookies: browser.cookies });
    assert.deepEqual(newOidc.jwks, oidc.jwks, "The existing signing key set must survive Client Secret rotation");
    await lifecycle.checkpoint("target-smoke-passed");
    const report = { sourceRevision, verifiedSourceFiles, lockfileDigest, sourceProcesses: { api: old.apiProcessId, provider: old.providerProcessId }, targetProcess: current.pid, commands, preservation, postgresPreservation: Object.fromEntries(Object.entries(pgBaseline).map(([name, rows]) => [name, { count: rows.length, digest: digest(JSON.stringify(rows)) }])), oldCredentialsRejected: true, newManagedBusinessOidcPassed: true, jwksRetained: true, customContinuation: "b648-original-query-and-root-cookie; no unified continuation writer", targetEnvironmentOperated: false };
    return report;
  });
  await writeFile(join(evidenceDirectory, "report.json"), JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const sourceDirectory = process.argv[2];
  assert.ok(sourceDirectory, "Explicit fixed b648 source directory required");
  const evidenceDirectory = process.argv[3] ?? await mkdtemp(join(tmpdir(), "iam206-upgrade-"));
  process.stdout.write(`b648 upgrade evidence: ${evidenceDirectory}\n`);
  await runB648Upgrade(sourceDirectory, evidenceDirectory);
  process.stdout.write(`b648 upgrade passed; evidence: ${evidenceDirectory}\n`);
}

if (import.meta.main) {
  // eslint-disable-next-line antfu/no-top-level-await -- Explicit source rehearsal owns its process and resource lifetime.
  await main();
}
