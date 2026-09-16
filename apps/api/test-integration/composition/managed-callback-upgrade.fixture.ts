import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import { createClientSnapshotMaintenanceTestFixture } from "@iam/api-core/client-snapshot/testing";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { SubjectClaim } from "@iam/contracts";
import { observeCustomSsoAuthorizationUpgrade } from "@iam/custom-sso/testing";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import Redis from "ioredis";
import { upgradeBrowser, upgradeLogin, upgradeMint, upgradeRedirectUri } from "./dual-entry-upgrade-http.fixture";
import { verifyUpgradeSource } from "./dual-entry-upgrade.fixture";
import { withOidcConformanceLifecycle } from "./oidc-conformance-lifecycle.fixture";
import { createOidcConformanceCandidate } from "./oidc-conformance.fixture";

const sourceRevision = "7825b22384ac823c8b5c0db905c0141ced264abd";
const workerRoot = fileURLToPath(new URL("../../../worker/", import.meta.url));
const currentMigrations = fileURLToPath(new URL("../../../../packages/db/src/migrations", import.meta.url));
type Candidate = Awaited<ReturnType<typeof createOidcConformanceCandidate>>;

async function command(candidate: Candidate, script: string, args: string[]) {
  const env = candidate.resourceEnvironment;
  let processId: number | undefined;
  const result = await runProcessCommandSmoke({
    label: `same-generation ${script}`,
    completionTimeoutMs: 30000,
    cleanupTimeoutMs: 5000,
    expectedExitCode: 0,
    start: () => {
      const child = spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", script, ...args],
        cwd: workerRoot,
        env: { ...env, IAM_WORKER_DATABASE_URL: candidate.postgresHarness.databaseUrl, IAM_WORKER_REDIS_HOST: env.IAM_API_REDIS_HOST, IAM_WORKER_REDIS_PORT: env.IAM_API_REDIS_PORT, IAM_WORKER_REDIS_PASSWORD: env.IAM_API_REDIS_PASSWORD, IAM_WORKER_REDIS_DB: env.IAM_API_REDIS_DB },
      });
      processId = child.pid;
      return child;
    },
  });
  const line = result.output.split(/\r?\n/u).find(line => line.includes("{\""));
  assert.ok(line, `Official command must emit its structured result: ${result.output}`);
  assert.ok(processId);
  return { ...JSON.parse(line.slice(line.indexOf("{"))), processId, command: [script, ...args] };
}

/** Fixed source API writes normal artifacts; a separate observer compares every retained value and absolute expiry. */
export async function runManagedCallbackUpgrade(sourceDirectory: string, evidenceDirectory: string) {
  const verifiedSourceFiles = await verifyUpgradeSource(sourceDirectory, sourceRevision);
  return await withOidcConformanceLifecycle(async (lifecycle) => {
    const candidate = await createOidcConformanceCandidate({
      redirectUris: [upgradeRedirectUri],
      postLogoutRedirectUris: [upgradeRedirectUri],
      issuerMode: "dual",
      source: { sourceDirectory, sourceRevision },
      migrationsFolder: join(sourceDirectory, "packages/db/src/migrations"),
      logPath: join(evidenceDirectory, "api.log"),
      lifecycle,
    });
    const observer = new Redis(process.env.IAM_API_TEST_REDIS_URL!, { maxRetriesPerRequest: 0 });
    const sentinel = `iam204:${candidate.namespace}:non-owner`;
    try {
      const sourceProcess = JSON.parse(await readFile(join(evidenceDirectory, "api.log.owner.json"), "utf8"));
      const { sql, db, databaseUrl } = candidate.postgresHarness;
      const target = candidate.secondClientId;
      const landing = `${candidate.externalOrigin}/work/orders?view=all`;
      const fixedCallback = `${candidate.externalOrigin}/old/fixed-callback?legacy=1`;
      const config = { protocol: "custom-sso", callbackType: "managed", callbackEndpoint: fixedCallback, validRedirectUrls: [`${candidate.externalOrigin}/work/*`], subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName] };
      await sql`UPDATE client SET sso_config=${JSON.stringify(config)}::jsonb WHERE client_code=${target}`;
      const business = { ...config, callbackType: "business", callbackEndpoint: upgradeRedirectUri };
      await sql`UPDATE client SET sso_config=${JSON.stringify(business)}::jsonb WHERE client_code=${candidate.publicClientId}`;
      await candidate.redis.set(sentinel, "opaque preservation evidence", "PX", 600000);
      let variantProcessId: number | undefined;
      await runProcessCommandSmoke({
        label: "fixed-source Custom writer variants",
        completionTimeoutMs: 30000,
        cleanupTimeoutMs: 5000,
        expectedExitCode: 0,
        start: () => {
          const child = spawnOwnedProcessTree({
            executable: process.execPath,
            cwd: join(sourceDirectory, "apps/worker"),
            args: ["--no-env-file", "--eval", `
              import Redis from "ioredis";
              import { createCustomSsoMaintenanceTestFixture } from "@iam/custom-sso/testing";
              const redis = new Redis(process.env.UPGRADE_REDIS_URL);
              try {
                await createCustomSsoMaintenanceTestFixture(redis, process.env.UPGRADE_NAMESPACE, () => {})
                  .seedUnified(process.env.UPGRADE_CLIENT);
              } finally { redis.disconnect(); }
            `],
            env: { ...candidate.resourceEnvironment, UPGRADE_REDIS_URL: process.env.IAM_API_TEST_REDIS_URL, UPGRADE_NAMESPACE: candidate.namespace, UPGRADE_CLIENT: target },
          });
          variantProcessId = child.pid;
          return child;
        },
      });
      assert.ok(variantProcessId);
      // The frozen owner fixture creates explicit no-TTL/no-index/orphan variants before any real HTTP state.
      // Subsequent HTTP issuance retains its genuine original absolute expiry.
      const root = upgradeBrowser(candidate.externalOrigin);
      await upgradeLogin(candidate, root);
      const authorize = (client: string) => `/sso/authorize?${new URLSearchParams({ client, redirectUrl: landing, state: "retained-state" })}`;
      async function code(client: string, expected: string) {
        const response = await root.request(authorize(client));
        assert.equal(response.status, 302);
        const callback = new URL(response.headers.get("location")!);
        assert.equal(`${callback.origin}${callback.pathname}`, expected);
        assert.ok(callback.searchParams.get("code"));
        return callback;
      }
      async function complete(callback: URL) {
        return await root.request(`/sso/callback?${callback.searchParams}`);
      }
      const issued = await code(target, `${candidate.externalOrigin}/old/fixed-callback`);
      assert.equal(issued.searchParams.get("legacy"), "1", "Source uses the old fixed callback query");
      const completed = await complete(issued);
      assert.equal(completed.status, 302);
      const token = new URL(completed.headers.get("location")!).searchParams.get("token");
      assert.ok(token);
      async function useToken() {
        const response = await root.request("/public/user-info", { headers: { Authorization: token!, Client: target } });
        assert.equal(response.status, 200, "Original managed Token remains usable under its original rules");
      }
      await useToken();
      const oldCode = await code(target, `${candidate.externalOrigin}/old/fixed-callback`);
      await code(candidate.publicClientId, upgradeRedirectUri);
      await upgradeMint(candidate, root, false);
      const anonymous = upgradeBrowser(candidate.externalOrigin);
      const redirect = await anonymous.request(authorize(target));
      assert.equal(redirect.status, 302);
      const continuation = new URL(redirect.headers.get("location")!, candidate.externalOrigin).searchParams.get("ssoReturn");
      assert.ok(continuation);
      const resume = `${authorize(target)}&ssoReturn=${encodeURIComponent(continuation)}`;
      const guard = resume.replace("/sso/authorize", "/sso/login-guard");
      assert.equal((await anonymous.request(guard)).status, 200);
      await candidate.stopCandidate();
      const journal = new URL(databaseUrl).searchParams.get("search_path")!;
      const upgradeArgs = (mode: string) => [mode, "--writers-stopped", "--migrations-schema", journal];
      const inventory = await command(candidate, "client-managed-callback:upgrade", upgradeArgs("inventory"));
      assert.deepEqual(inventory.managedClients, [target]);
      const capturedClients: string[] = [...inventory.managedClients];
      const scope = (client: string) => ["--layout", "unified", "--owner", "custom-sso", "--custom-namespace", candidate.namespace, "--client-code", client, "--artifacts", "authorization", "--writers-stopped", "--drained"];
      const keys = await observer.keys("*");
      const retained = [];
      const observed = await observeCustomSsoAuthorizationUpgrade(observer, candidate.namespace, target);
      const removed = observed.authorizationKeys;
      const removedKeys = new Set(removed);
      const snapshotFixture = createClientSnapshotMaintenanceTestFixture(observer, () => {});
      const snapshotKeys = new Set([candidate.clientId, candidate.publicClientId, target]
        .flatMap(client => snapshotFixture.trackClient(client)));
      for (const key of keys) {
        // Owner observations identify opaque evidence keys only; CLI scope comes from the fixed Client inventory.
        if (removedKeys.has(key) || snapshotKeys.has(key))
          continue;
        const dump = await observer.dumpBuffer(key);
        if (dump)
          retained.push({ key, digest: createHash("sha256").update(dump).digest("hex"), expiry: await observer.pexpiretime(key) });
      }
      assert.ok(removed.length >= 2);
      assert.ok(observed.tokenKeys.length > 0);
      assert.ok(observed.tokenIndexKeys.length > 0);
      const retainedKeys = new Set(retained.map(value => value.key));
      for (const key of [...observed.tokenKeys, ...observed.tokenIndexKeys])
        assert.ok(retainedKeys.has(key), "All observed target Tokens and reverse indexes require preservation evidence");
      await writeFile(join(evidenceDirectory, "baseline.json"), JSON.stringify({
        sourceRevision,
        sourceProcess,
        variantProcessId,
        capturedClients,
        retained: retained.map(item => ({ keyDigest: createHash("sha256").update(item.key).digest("hex"), valueDigest: item.digest, absoluteExpiry: item.expiry })),
      }, null, 2));
      const clientsBefore = Array.from(await sql`SELECT to_jsonb(c) - 'sso_config' AS value FROM client c ORDER BY id`);
      const configApply = await command(candidate, "client-managed-callback:upgrade", upgradeArgs("apply"));
      await migrate(db, { migrationsFolder: currentMigrations, migrationsSchema: journal });
      const configVerify = await command(candidate, "client-managed-callback:upgrade", upgradeArgs("verify"));
      await command(candidate, "client-managed-callback:upgrade", upgradeArgs("apply"));
      const stateReports = [];
      for (const client of capturedClients) {
        for (const mode of ["inventory", "apply", "verify", "apply", "verify"])
          stateReports.push(await command(candidate, "online-auth:state", [mode, ...scope(client)]));
      }
      const snapshotRepair = await command(candidate, "client-snapshot:repair", ["--all", "--writers-stopped", "--drained"]);
      const snapshotVerify = await command(candidate, "client-snapshot:verify", ["--all", "--writers-stopped", "--drained"]);
      const preservation = [];
      for (const item of retained) {
        const dump = await observer.dumpBuffer(item.key);
        const expiry = await observer.pexpiretime(item.key);
        const naturallyExpired = !dump && item.expiry >= 0 && item.expiry <= Date.now();
        if (!naturallyExpired) {
          assert.ok(dump, "Retained state missing");
          assert.equal(createHash("sha256").update(dump).digest("hex"), item.digest);
          assert.equal(expiry, item.expiry);
        }
        preservation.push({ keyDigest: createHash("sha256").update(item.key).digest("hex"), valueDigest: item.digest, absoluteExpiry: item.expiry, status: naturallyExpired ? "naturally-expired" : "retained" });
      }
      assert.equal(await observer.exists(...removed), 0);
      assert.deepEqual(Array.from(await sql`SELECT to_jsonb(c) - 'sso_config' AS value FROM client c ORDER BY id`), clientsBefore);
      const reader = createClientSnapshots({ redis: candidate.redis, source: createClientSnapshotRepository(db) });
      const fresh = await reader.client.acquire(target);
      assert.equal(fresh.kind, "present");
      if (fresh.kind === "present")
        assert.equal("callbackEndpoint" in fresh.value.ssoConfig!, false);
      await candidate.restartCandidate();
      const replay = upgradeBrowser(candidate.externalOrigin, root.cookies);
      assert.equal((await replay.request(`/sso/callback?${oldCode.searchParams}`)).status, 401);
      const oldContinuation = upgradeBrowser(candidate.externalOrigin, new Map([...anonymous.cookies, ...root.cookies]));
      assert.equal((await oldContinuation.request(guard)).status, 400);
      assert.equal((await oldContinuation.request(resume)).status, 400);
      await useToken();
      const newCode = await code(target, `${candidate.externalOrigin}/sso/callback`);
      assert.equal(newCode.searchParams.has("legacy"), false);
      const newCallback = await complete(newCode);
      assert.equal(newCallback.status, 302);
      const destination = new URL(newCallback.headers.get("location")!);
      assert.equal(destination.pathname, "/work/orders");
      assert.equal(destination.searchParams.get("state"), "retained-state");
      assert.equal(destination.searchParams.get("view"), "all");
      await useToken();
      const targetProcess = JSON.parse(await readFile(join(evidenceDirectory, "api.log.owner.json"), "utf8"));
      const report = { sourceRevision, verifiedSourceFiles, sourceProcess, variantProcessId, targetProcess, capturedClients, inventory, configApply, configVerify, stateReports, snapshotRepair, snapshotVerify, preservation, oldFlowsRejected: true, newAuthorizationWithOriginalRoot: true, originalTokenUsable: true };
      await writeFile(join(evidenceDirectory, "report.json"), JSON.stringify(report, null, 2));
      return report;
    }
    finally {
      observer.disconnect();
      await candidate.redis.unlink(sentinel);
      await candidate.close();
    }
  });
}

async function main() {
  const [flag, sourceDirectory] = process.argv.slice(2);
  assert.equal(flag, "--source-directory");
  assert.ok(sourceDirectory);
  const evidence = await mkdtemp(join(tmpdir(), "iam204-upgrade-"));
  process.stdout.write(`Same-generation upgrade evidence: ${evidence}\n`);
  await runManagedCallbackUpgrade(sourceDirectory, evidence);
  process.stdout.write(`Same-generation upgrade passed: ${evidence}\n`);
}

if (import.meta.main) {
  // eslint-disable-next-line antfu/no-top-level-await -- Explicit source rehearsal owns its process and resource lifetime.
  await main();
}
