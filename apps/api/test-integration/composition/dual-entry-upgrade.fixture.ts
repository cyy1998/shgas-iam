import type { OidcConformanceLifecycle } from "./oidc-conformance-lifecycle.fixture";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import { createRedisSubjectAccessStore, SubjectAccessRecordV1Schema } from "@iam/api-core/subject-access";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { ClientSsoProtocol, SubjectClaim } from "@iam/contracts";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { createInternalUserProfileQueryRepository, createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/user-profile-read-model";
import {
  replayUpgradeLogout,
  upgradeBrowser,
  upgradeCode,
  upgradeContinuation,
  upgradeExchange,
  upgradeLogin,
  upgradeLogout,
  upgradeMint,
  upgradeRedirectUri,
  upgradeUseToken,
} from "./dual-entry-upgrade-http.fixture";
import { withOidcConformanceLifecycle } from "./oidc-conformance-lifecycle.fixture";
import { createOidcConformanceCandidate } from "./oidc-conformance.fixture";

const sourceRevision = "5c6707efbf2069649f2c3ea4396bffbd28dcab96";
const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
type Candidate = Awaited<ReturnType<typeof createOidcConformanceCandidate>>;

/** Archive checkouts have no .git. Verify every tracked blob against the fixed source tree before opening resources. */
async function verifySource(sourceDirectory: string) {
  const { stdout } = await promisify(execFile)("git", ["ls-tree", "-r", "-z", sourceRevision], {
    cwd: workspaceRoot,
    maxBuffer: 8 * 1024 * 1024,
  });
  let files = 0;
  for (const entry of stdout.split("\0").filter(Boolean)) {
    const match = /^\d+ blob ([a-f0-9]+)\t(.+)$/u.exec(entry);
    assert.ok(match, "Fixed upgrade source must contain only file blobs");
    const bytes = await readFile(join(sourceDirectory, match[2]!));
    const digest = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    assert.equal(digest, match[1], `Fixed source file differs: ${match[2]}`);
    files++;
  }
  assert.ok(files > 0);
  return files;
}

async function oldProcess(candidate: Candidate, sourceDirectory: string, args: string[], label: string) {
  const env = candidate.resourceEnvironment;
  let processId: number | undefined;
  const invocation = { executable: process.execPath, args: ["--no-env-file", ...args], cwd: join(sourceDirectory, "apps/worker") };
  const result = await runProcessCommandSmoke({
    label,
    completionTimeoutMs: 30000,
    cleanupTimeoutMs: 5000,
    expectedExitCode: 0,
    start: () => {
      const child = spawnOwnedProcessTree({
        ...invocation,
        env: {
          ...env,
          IAM_WORKER_REDIS_HOST: env.IAM_API_REDIS_HOST,
          IAM_WORKER_REDIS_PORT: env.IAM_API_REDIS_PORT,
          IAM_WORKER_REDIS_PASSWORD: env.IAM_API_REDIS_PASSWORD,
          IAM_WORKER_REDIS_DB: env.IAM_API_REDIS_DB,
          UPGRADE_REDIS_URL: process.env.IAM_API_TEST_REDIS_URL,
          UPGRADE_KERNEL_NAMESPACE: candidate.namespace,
          UPGRADE_OIDC_NAMESPACE: candidate.oidcNamespace,
        },
      });
      processId = child.pid;
      return child;
    },
  });
  assert.ok(processId, "Owned old-source process must expose its PID");
  return { ...result, processId, invocation };
}

async function seedOldVariants(candidate: Candidate, sourceDirectory: string) {
  // Eval resolves public exports from the fixed workspace. No old source is imported into the new API process.
  const script = `
    import Redis from "ioredis";
    import { createSessionMaintenanceTestFixture } from "@iam/session-kernel/testing";
    import { createCustomSsoMaintenanceTestFixture } from "@iam/custom-sso/testing";
    import { createOidcMaintenanceTestFixture } from "@iam/oidc/testing";
    const redis = new Redis(process.env.UPGRADE_REDIS_URL, { maxRetriesPerRequest: 0, retryStrategy: () => null });
    try {
      const track = () => {};
      await createSessionMaintenanceTestFixture(redis, process.env.UPGRADE_KERNEL_NAMESPACE, track).seedUnified();
      await createCustomSsoMaintenanceTestFixture(redis, process.env.UPGRADE_KERNEL_NAMESPACE, track).seedUnified();
      await createOidcMaintenanceTestFixture(redis, process.env.UPGRADE_OIDC_NAMESPACE, track).seedUnified();
      console.log("old-owner-variants-seeded");
    } finally { redis.disconnect(); }
  `;
  const result = await oldProcess(candidate, sourceDirectory, ["--eval", script], "fixed old owner variants");
  assert.ok(result.output.includes("old-owner-variants-seeded"));
}

async function maintenance(candidate: Candidate, sourceDirectory: string, mode: string) {
  const result = await oldProcess(candidate, sourceDirectory, ["run", "online-auth:state", "--", mode, "--layout", "unified", "--owner", "all", "--kernel-namespace", candidate.namespace, "--custom-namespace", candidate.namespace, "--oidc-namespace", candidate.oidcNamespace, "--writers-stopped", "--drained"], `fixed old Worker ${mode}`);
  const line = result.output.split(/\r?\n/u).find(line => line.includes("{\"version\":1,"));
  assert.ok(line, "Worker must emit its safe structured report");
  const report = JSON.parse(line.slice(line.indexOf("{\"version\":1,")));
  assert.equal(report.status, "completed");
  assert.equal(report.layout, "unified");
  assert.equal(report.owners.length, 3);
  for (const owner of report.owners) {
    assert.equal(owner.status, "completed");
    assert.equal(owner.unknown, 0);
    assert.equal(owner.changed, 0);
    if (mode === "verify")
      assert.equal(owner.matching, 0, "Independent full verify must observe no owned keys");
    if (mode === "inventory")
      assert.ok(owner.matching > 0, "Each old owner must have real inventory");
  }
  return { ...report, processId: result.processId, invocation: result.invocation };
}

async function ownerBaseline(candidate: Candidate) {
  const { db, sql } = candidate.postgresHarness;
  const snapshots = createClientSnapshots({ redis: candidate.redis, source: createClientSnapshotRepository(db) });
  const facts = await createSubjectFactsReader({ db, cache: createSubjectFactsRedisCache(candidate.redis) })
    .read(candidate.subjectIdentifier);
  assert.ok(facts, "Real published Facts must be readable");
  const profile = await createInternalUserProfileQueryRepository(db).getCurrentByUsername(candidate.username);
  assert.ok(profile, "Real Profile must be readable");
  const accessRaw = await createRedisSubjectAccessStore({ redis: candidate.redis }).read(candidate.subjectIdentifier);
  assert.ok(accessRaw);
  const access = SubjectAccessRecordV1Schema.parse(JSON.parse(accessRaw));
  assert.equal(access.state, "enabled");
  const client = [];
  for (const code of [candidate.clientId, candidate.secondClientId]) {
    const ordinary = await snapshots.client.acquire(code);
    const credential = await snapshots.credential.acquire(code);
    assert.equal(ordinary.kind, "present");
    assert.equal(credential.kind, "present");
    client.push({ ordinary, credential });
  }
  const accounts = await sql`SELECT to_jsonb(u) AS value FROM "user" u ORDER BY id`;
  const clients = await sql`SELECT to_jsonb(c) AS value FROM client c ORDER BY id`;
  const audit = await sql`SELECT to_jsonb(a) AS value FROM audit_log a ORDER BY id`;
  assert.ok(audit.length > 0, "Real HTTP authentication must create audit evidence");
  return { facts, profile, access, client, accounts: [...accounts], clients: [...clients], audit: [...audit] };
}

async function redisBaseline(candidate: Candidate) {
  const targetPrefixes = [`${candidate.namespace}:unified:v1:`, `${candidate.namespace}:custom-sso:v1:`, `${candidate.oidcNamespace}:oidc:v1:`];
  const keys = new Set<string>();
  let cursor = "0";
  do {
    const page = await candidate.redis.scan(cursor, "COUNT", 100);
    cursor = page[0];
    for (const key of page[1]) {
      if (!targetPrefixes.some(prefix => key.startsWith(prefix)))
        keys.add(key);
    }
  } while (cursor !== "0");
  const observations = [];
  for (const key of [...keys].sort()) {
    const dump = await candidate.redis.dumpBuffer(key);
    const expiresAt = await candidate.redis.pexpiretime(key);
    if (dump)
      observations.push({ key, digest: createHash("sha256").update(dump).digest("hex"), expiresAt });
  }
  return observations;
}

async function compareRedis(candidate: Candidate, before: Awaited<ReturnType<typeof redisBaseline>>) {
  let naturallyExpired = 0;
  const observations = [];
  for (const observation of before) {
    const dump = await candidate.redis.dumpBuffer(observation.key);
    const expiry = await candidate.redis.pexpiretime(observation.key);
    const valueDigest = dump ? createHash("sha256").update(dump).digest("hex") : null;
    const evidence = {
      keyDigest: createHash("sha256").update(observation.key).digest("hex"),
      before: { valueDigest: observation.digest, absoluteExpiry: observation.expiresAt },
      after: { valueDigest, absoluteExpiry: expiry },
    };
    if (!dump && observation.expiresAt >= 0 && observation.expiresAt <= Date.now()) {
      naturallyExpired++;
      observations.push({ ...evidence, status: "naturally-expired" });
      continue;
    }
    assert.ok(dump, "Maintenance must retain non-target Redis values");
    assert.equal(createHash("sha256").update(dump).digest("hex"), observation.digest, "Non-target bytes changed");
    assert.equal(expiry, observation.expiresAt, "Non-target absolute expiry changed");
    observations.push({ ...evidence, status: "retained" });
  }
  return { compared: before.length, naturallyExpired, observations };
}

function ownerDigests(baseline: Awaited<ReturnType<typeof ownerBaseline>>) {
  return Object.fromEntries(Object.entries(baseline).map(([owner, value]) => [owner, {
    valueDigest: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    ...(Array.isArray(value) ? { records: value.length } : {}),
  }]));
}

/** Explicit operational rehearsal, separate from routine composition; a missing source fails instead of skipping. */
export async function runDualEntryUpgradeRehearsal(options: {
  sourceDirectory: string;
  logPath: string;
  lifecycle?: OidcConformanceLifecycle;
}) {
  const checkpoint = async (phase: string) => options.lifecycle?.checkpoint(phase);
  await checkpoint("upgrade-source-verification");
  const verifiedSourceFiles = await verifySource(options.sourceDirectory);
  await checkpoint("upgrade-source-verified");
  const candidate = await createOidcConformanceCandidate({
    issuerMode: "dual",
    source: { sourceDirectory: options.sourceDirectory, sourceRevision },
    redirectUris: [upgradeRedirectUri],
    postLogoutRedirectUris: [upgradeRedirectUri],
    logPath: options.logPath,
    lifecycle: options.lifecycle,
  });
  const sentinels = ["login-restriction", "bull", "sms-code", "nonce"].map(owner => `${owner}:${candidate.namespace}:opaque`);
  try {
    const sql = candidate.postgresHarness.sql;
    const config = {
      protocol: ClientSsoProtocol.CustomSso,
      callbackEndpoint: upgradeRedirectUri,
      validRedirectUrls: [upgradeRedirectUri],
      subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
    };
    await sql`UPDATE client SET sso_config = ${JSON.stringify(config)}::jsonb WHERE client_code = ${candidate.secondClientId}`;
    for (const key of sentinels)
      await candidate.redis.set(key, "opaque non-session preservation fixture", "PX", 600000);
    const origin = candidate.externalOrigin;
    const root = upgradeBrowser(origin);
    await upgradeLogin(candidate, root);
    const custom = await upgradeMint(candidate, root, true);
    const oidc = await upgradeMint(candidate, root, false);
    const customCode = await upgradeCode(candidate, root, true);
    const oidcCode = await upgradeCode(candidate, root, false);
    const customContinuation = await upgradeContinuation(candidate, origin, true);
    const oidcContinuation = await upgradeContinuation(candidate, origin, false);
    const logout = await upgradeLogout(root, oidc.idToken);
    const oldCookies = new Map(root.cookies);
    const jwksResponse = await root.request("/oidc/jwks");
    assert.equal(jwksResponse.status, 200);
    const oldJwks = await jwksResponse.json();
    await checkpoint("upgrade-before-old-variants");
    await seedOldVariants(candidate, options.sourceDirectory);
    await checkpoint("upgrade-old-variants-complete");
    await candidate.stopCandidate();
    const ownersBefore = await ownerBaseline(candidate);
    const redisBefore = await redisBaseline(candidate);
    const namespaces = { kernel: candidate.namespace, custom: candidate.namespace, oidc: candidate.oidcNamespace };
    const baselineEvidence = {
      namespaces,
      owners: ownerDigests(ownersBefore),
      redis: redisBefore.map(observation => ({
        keyDigest: createHash("sha256").update(observation.key).digest("hex"),
        valueDigest: observation.digest,
        absoluteExpiry: observation.expiresAt,
      })),
    };
    await writeFile(`${options.logPath}.baseline.json`, JSON.stringify(baselineEvidence, null, 2));
    await checkpoint("upgrade-before-inventory");
    const inventory = await maintenance(candidate, options.sourceDirectory, "inventory");
    await writeFile(`${options.logPath}.inventory.json`, JSON.stringify(inventory, null, 2));
    await checkpoint("upgrade-before-apply");
    const apply = await maintenance(candidate, options.sourceDirectory, "apply");
    await writeFile(`${options.logPath}.apply.json`, JSON.stringify(apply, null, 2));
    await checkpoint("upgrade-before-verify");
    const verify = await maintenance(candidate, options.sourceDirectory, "verify");
    await writeFile(`${options.logPath}.verify.json`, JSON.stringify(verify, null, 2));
    await checkpoint("upgrade-verify-complete");
    assert.equal(new Set([inventory.processId, apply.processId, verify.processId]).size, 3);
    const preservation = await compareRedis(candidate, redisBefore);
    const ownersAfter = await ownerBaseline(candidate);
    const baselineDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    assert.equal(baselineDigest(ownersAfter), baselineDigest(ownersBefore), "Independent non-session owner data changed");
    const ownerPreservation = { before: ownerDigests(ownersBefore), after: ownerDigests(ownersAfter) };
    await writeFile(`${options.logPath}.preservation.json`, JSON.stringify({ ownerPreservation, preservation }, null, 2));
    await checkpoint("upgrade-before-new-candidate");
    await candidate.restartCandidate();
    for (const entry of Object.values(candidate.origins)) {
      await checkpoint("upgrade-new-entry");
      const keyResponse = await upgradeBrowser(entry).request("/oidc/jwks");
      const keys = await keyResponse.json();
      assert.deepEqual(keys, oldJwks, "Upgrade must retain signing keys");
      const oldArtifacts = [[true, customCode, custom.token], [false, oidcCode, oidc.token]] as const;
      for (const [isCustom, code, token] of oldArtifacts) {
        const exchanged = await upgradeExchange(candidate, upgradeBrowser(entry, oldCookies), isCustom, code);
        assert.equal(exchanged.status, 400, "Old Code must never resume issuance");
        const used = await upgradeUseToken(candidate, upgradeBrowser(entry), isCustom, token);
        assert.equal(used.status, 401, "Old online Token must be unusable");
      }
      for (const continuation of [customContinuation, oidcContinuation]) {
        const cookies = new Map([...continuation.cookies, ...oldCookies]);
        const guarded = await upgradeBrowser(entry, cookies).request(continuation.guardPath);
        assert.equal(guarded.status, 400, "Old continuation must be rejected");
        const resumed = await upgradeBrowser(entry, cookies).request(continuation.resumePath);
        assert.equal(resumed.status, 400, "Old continuation cannot resume authorization");
      }
      const ended = await replayUpgradeLogout(upgradeBrowser(entry, logout.cookies), logout.xsrf);
      assert.equal(ended.status, 400, "Old logout confirmation must be rejected");
      const oldRoot = upgradeBrowser(entry, oldCookies);
      const authorization = await oldRoot.request(`/sso/authorize?${new URLSearchParams({ client: candidate.secondClientId, redirectUrl: upgradeRedirectUri })}`);
      assert.equal(authorization.status, 302);
      assert.equal(new URL(authorization.headers.get("location")!, entry).pathname, "/login", "Old root must require reauthentication");
      const fresh = upgradeBrowser(entry);
      await upgradeLogin(candidate, fresh);
      await upgradeMint(candidate, fresh, true);
      const newOidc = await upgradeMint(candidate, fresh, false);
      const confirmation = await upgradeLogout(fresh, newOidc.idToken);
      const confirmed = await replayUpgradeLogout(fresh, confirmation.xsrf);
      assert.equal(confirmed.status, 303, "New entry must complete logout");
      await checkpoint("upgrade-new-entry-complete");
    }
    return { sourceRevision, verifiedSourceFiles, namespaces, inventory, apply, verify, preservation, ownerPreservation, newIssuers: Object.values(candidate.origins).map(origin => `${origin}/oidc`), oldHttpWriter: "passed", independentOwnerPreservation: "passed", oldReplayRejected: "passed", newEntries: 2 };
  }
  finally {
    try {
      await candidate.redis.unlink(...sentinels);
    }
    finally {
      await candidate.close();
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2, "Usage: bun run dual-entry-upgrade.fixture.ts --source-directory <fixed-old-workspace>");
  assert.equal(args[0], "--source-directory");
  const directory = await mkdtemp(join(tmpdir(), "iam200-upgrade-"));
  process.stdout.write(`Dual-entry upgrade evidence: ${directory}\n`);
  const report = await withOidcConformanceLifecycle(async lifecycle =>
    await runDualEntryUpgradeRehearsal({ sourceDirectory: args[1]!, logPath: join(directory, "api.log"), lifecycle }));
  await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`Dual-entry upgrade passed; safe evidence: ${directory}\n`);
}

if (import.meta.main) {
  // eslint-disable-next-line antfu/no-top-level-await -- Explicit rehearsal owns candidate cleanup through completion.
  await main();
}
