import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClientSnapshotMaintenanceTestFixture } from "@iam/api-core/client-snapshot/testing";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { createCustomSsoMaintenanceTestFixture } from "@iam/custom-sso/testing";
import { createOidcMaintenanceTestFixture } from "@iam/oidc/testing";
import { createSessionMaintenanceTestFixture } from "@iam/session-kernel/testing";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createWorkerRedisTestHarness } from "../redis/redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let pg: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
let redis: Awaited<ReturnType<typeof createWorkerRedisTestHarness>>;
let directory: string;
beforeEach(async () => {
  pg = await createWorkerPostgresTestHarness({ b648ClientSource: true });
  redis = await createWorkerRedisTestHarness();
  const existing = await redis.observer.dbsize();
  expect(existing).toBe(0);
  directory = await mkdtemp(join(tmpdir(), "iam-b648-auto-"));
});
afterEach(async () => {
  const results = await Promise.allSettled([pg?.close(), redis?.close()]);
  if (directory) {
    if (!resolve(directory).startsWith(`${resolve(tmpdir())}\\iam-b648-auto-`) && !resolve(directory).startsWith(`${resolve(tmpdir())}/iam-b648-auto-`))
      throw new Error("Unexpected test directory");
    await rm(directory, { recursive: true });
  }
  for (const result of results) {
    if (result.status === "rejected")
      throw result.reason;
  }
});

async function command(expectedExitCode = 0, overrides: NodeJS.ProcessEnv = {}) {
  const result = await runProcessCommandSmoke({
    label: "unattended b648 upgrade",
    completionTimeoutMs: 120_000,
    cleanupTimeoutMs: 5000,
    expectedExitCode,
    maxOutputBytes: 256 * 1024,
    start: () => spawnOwnedProcessTree({
      executable: process.execPath,
      args: ["--no-env-file", "scripts/b648-upgrade/run.ts", "--state-dir", directory, "--migrations-schema", pg.schemaName],
      cwd: workerRoot,
      env: { ...redis.commandEnvironment(directory), IAM_WORKER_DATABASE_URL: pg.commandDatabaseUrl, ...overrides },
    }),
  });
  expect(result.output).not.toContain("private-secret");
  return result.output;
}
const gateway = { mode: "gateway", validRedirectUrls: ["https://business.test/*"], subjectClaims: ["subjectIdentifier"], orcas: { enabled: true } };
const oidc = { clientType: "confidential", redirectUris: ["https://business.test/oidc"], postLogoutRedirectUris: [], allowedScopes: ["openid"], tokenEndpointAuthMethod: "client_secret_basic" };
async function seedDual() {
  await pg.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,
    custom_sso_config,custom_sso_config_version,oidc_config,oidc_config_version,oidc_secret_hash)
    VALUES ('dual','Dual','private-secret','{}',${JSON.stringify(gateway)}::jsonb,1,
    ${JSON.stringify(oidc)}::jsonb,1,'$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuv12345678901')`;
}
async function journal() {
  return Array.from(await pg.sql.unsafe(`SELECT * FROM "${pg.schemaName}".__drizzle_migrations ORDER BY created_at`));
}

test("single entry rejects ambiguous Clients before any database migration write", async () => {
  await seedDual();
  const before = await journal();
  const clients = Array.from(await pg.sql`SELECT * FROM client`);
  const output = await command(1);
  expect(output).toContain("invalid-source-configuration");
  const after = await journal();
  const afterClients = Array.from(await pg.sql`SELECT * FROM client`);
  expect(after).toEqual(before);
  expect(afterClients).toEqual(clients);
}, 30_000);

async function seedSingleClients() {
  await seedDual();
  await pg.sql`UPDATE client SET oidc_config=NULL,oidc_config_version=0,oidc_secret_hash=NULL WHERE client_code='dual'`;
  await pg.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,oidc_config,oidc_config_version,oidc_secret_hash)
    VALUES ('confidential','Confidential','private-secret','{}',${JSON.stringify(oidc)}::jsonb,1,
    '$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuv12345678901')`;
  await pg.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,is_delete)
    VALUES ('empty-deleted','Empty deleted','private-secret','{}',true)`;
  await pg.sql`INSERT INTO role (role_code,role_name,client_id) SELECT 'retained-role','Retained',id FROM client WHERE client_code='confidential'`;
}
const owned = (key: string) => redis.ownedRestoreFixtureKey(key);
async function seedOnlineState() {
  const keys = [
    ...await createSessionMaintenanceTestFixture(redis.writer, "sess:v2:", owned).seedSource(),
    ...await createCustomSsoMaintenanceTestFixture(redis.writer, "iam:session", owned).seedSource(),
    ...await createOidcMaintenanceTestFixture(redis.writer, "iam:oidc", owned).seedSource(),
    ...await createSessionMaintenanceTestFixture(redis.writer, "iam:session", owned).seedUnified(),
    ...await createCustomSsoMaintenanceTestFixture(redis.writer, "iam:session", owned).seedUnified(),
    ...await createOidcMaintenanceTestFixture(redis.writer, "iam:oidc", owned).seedUnified(),
    await createClientSnapshotMaintenanceTestFixture(redis.writer, owned).seedInvalidClientPayload("alpha"),
  ];
  keys.forEach(owned);
  return keys;
}

test("single entry migrates b648, clears all owners and preserves new logins on completed repetition", async () => {
  await seedSingleClients();
  const keys = await seedOnlineState();
  const [sentinel] = await redis.seedNonOwnerSentinels(["subject-facts:"]);
  const originalValue = await redis.observer.dump(sentinel!);
  const originalExpiry = await redis.observer.pexpiretime(sentinel!);
  const roles = Array.from(await pg.sql`SELECT * FROM role`);
  const output = await command();
  expect(output).toContain("\"status\":\"completed\"");
  const finalJournal = await journal();
  expect(finalJournal.at(-1)!.name).toBe("20260916081103_managed_callback_origin");
  const clients = Array.from(await pg.sql`SELECT * FROM client ORDER BY id`);
  expect(clients[0]!.sso_config).toMatchObject({ protocol: "custom-sso", callbackType: "managed" });
  expect(clients[0]!.sso_config).not.toHaveProperty("callbackEndpoint");
  expect(clients[1]!.sso_secret).toHaveLength(43);
  expect(clients[2]!.sso_config).toBeNull();
  expect(clients[2]!.is_delete).toBe(true);
  const remaining = await redis.observer.exists(...keys);
  const retainedValue = await redis.observer.dump(sentinel!);
  const retainedExpiry = await redis.observer.pexpiretime(sentinel!);
  const retainedRoles = Array.from(await pg.sql`SELECT * FROM role`);
  expect(remaining).toBe(0);
  expect(retainedValue).toBe(originalValue);
  expect(retainedExpiry).toBe(originalExpiry);
  expect(retainedRoles).toEqual(roles);
  const newKeys = await createSessionMaintenanceTestFixture(redis.writer, "iam:session", owned).seedUnified();
  const newSnapshot = await createClientSnapshotMaintenanceTestFixture(redis.writer, owned).seedInvalidClientPayload("alpha");
  const again = await command();
  expect(again).toContain("\"alreadyCompleted\":true");
  const remainingNew = await redis.observer.exists(...newKeys, newSnapshot);
  const againClients = Array.from(await pg.sql`SELECT * FROM client ORDER BY id`);
  expect(remainingNew).toBe(newKeys.length + 1);
  expect(againClients).toEqual(clients);
  const state = await readFile(join(directory, "state.json"), "utf8");
  expect(state).not.toContain(clients[1]!.sso_secret);
  expect(output).not.toContain(clients[1]!.sso_secret);
}, 120_000);

test.each([
  { phase: "apply", install: "CREATE FUNCTION interrupt_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-secret'; END $$; CREATE TRIGGER interrupt_upgrade BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION interrupt_upgrade()", remove: "DROP TRIGGER interrupt_upgrade ON client; DROP FUNCTION interrupt_upgrade()", stage: "20260914061007_romantic_maestro" },
  { phase: "contract", install: "CREATE VIEW interrupt_upgrade AS SELECT oidc_config FROM client", remove: "DROP VIEW interrupt_upgrade", stage: "20260914061007_romantic_maestro" },
  { phase: "finalize", install: "CREATE FUNCTION interrupt_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.sso_config ? 'callbackEndpoint' AND NOT (NEW.sso_config ? 'callbackEndpoint') THEN RAISE EXCEPTION 'private-secret'; END IF; RETURN NEW; END $$; CREATE TRIGGER interrupt_upgrade BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION interrupt_upgrade()", remove: "DROP TRIGGER interrupt_upgrade ON client; DROP FUNCTION interrupt_upgrade()", stage: "20260916050609_explicit_callback_type" },
])("same entry resumes after $phase failure with stable credentials and original evidence", async ({ phase, install, remove, stage }) => {
  await seedSingleClients();
  await pg.sql.unsafe(install);
  const failed = await command(1);
  expect(failed).toContain(`"phase":"${phase}"`);
  const failedJournal = await journal();
  expect(failedJournal.at(-1)!.name).toBe(stage);
  const before = await pg.sql`SELECT sso_secret,sso_credential_id FROM client WHERE client_code='confidential'`;
  const originalState = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  await pg.sql.unsafe(remove);
  const resumed = await command();
  expect(resumed).toContain("\"status\":\"completed\"");
  const after = await pg.sql`SELECT sso_secret,sso_credential_id FROM client WHERE client_code='confidential'`;
  if (before[0]!.sso_secret !== null)
    expect(after).toEqual(before);
  const finalState = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
  expect(finalState.manifest).toEqual(originalState.manifest);
  expect(finalState.completion).toBeDefined();
}, 120_000);

test("partial Redis cleanup failure resumes from final database without rotating Secret", async () => {
  await seedSingleClients();
  const keys = await seedOnlineState();
  const username = `upgrade_${randomUUID().replaceAll("-", "")}`;
  await redis.writer.acl("SETUSER", username, "on", ">private-secret", "~*", "+@all", "-del");
  try {
    const env = { IAM_WORKER_REDIS_USERNAME: username, IAM_WORKER_REDIS_PASSWORD: "private-secret" };
    const output = await command(1, env);
    expect(output).toContain("\"phase\":\"source-apply\"");
    const before = Array.from(await pg.sql`SELECT * FROM client ORDER BY id`);
    const state = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
    expect(state.completion).toBeUndefined();
    await redis.writer.acl("SETUSER", username, "+del");
    const resumed = await command(0, env);
    expect(resumed).toContain("\"status\":\"completed\"");
    const after = Array.from(await pg.sql`SELECT * FROM client ORDER BY id`);
    const left = await redis.observer.exists(...keys);
    expect(after).toEqual(before);
    expect(left).toBe(0);
  }
  finally { await redis.writer.acl("DELUSER", username); }
}, 120_000);

test("missing or conflicting recovery evidence is rejected without resuming mutations", async () => {
  await seedSingleClients();
  await pg.sql`CREATE VIEW interrupt_upgrade AS SELECT oidc_config FROM client`;
  await command(1);
  await pg.sql`DROP VIEW interrupt_upgrade`;
  const before = Array.from(await pg.sql`SELECT * FROM client ORDER BY id`);
  const path = join(directory, "state.json");
  const original = await readFile(path, "utf8");
  await unlink(path);
  await command(1);
  await writeFile(path, original.replace(/"resource":"[a-f0-9]+"/u, `"resource":"${"0".repeat(64)}"`));
  await command(1);
  await writeFile(path, original);
  const receiptPath = join(directory, "receipt.json");
  const receipt = await readFile(receiptPath, "utf8");
  await writeFile(receiptPath, receipt.replace(/"manifestDigest":"[a-f0-9]+"/u, `"manifestDigest":"${"0".repeat(64)}"`));
  await command(1);
  const after = Array.from(await pg.sql`SELECT * FROM client ORDER BY id`);
  expect(after).toEqual(before);
  await writeFile(receiptPath, receipt);
  await command();
}, 120_000);

test("unknown Redis records block before database writes and remain intact", async () => {
  await seedSingleClients();
  const key = await createSessionMaintenanceTestFixture(redis.writer, "sess:v2:", owned).seedCorruptSource();
  const before = await journal();
  const value = await redis.observer.dump(key);
  await command(1);
  const after = await journal();
  const retained = await redis.observer.dump(key);
  expect(after).toEqual(before);
  expect(retained).toBe(value);
}, 30_000);

test("resume refuses changed non-target values and TTLs instead of replacing the baseline", async () => {
  await seedSingleClients();
  const [key] = await redis.seedNonOwnerSentinels(["subject-facts:"]);
  const expiry = await redis.observer.pexpiretime(key!);
  await pg.sql`CREATE VIEW interrupt_upgrade AS SELECT oidc_config FROM client`;
  await command(1);
  await pg.sql`DROP VIEW interrupt_upgrade`;
  const before = await journal();
  await redis.writer.pexpireat(key!, expiry + 1000);
  const rejected = await command(1);
  expect(rejected).toContain("\"phase\":\"preservation-preflight\"");
  const after = await journal();
  expect(after).toEqual(before);
  await redis.writer.pexpireat(key!, expiry);
  await command();
}, 120_000);

test("completed state or receipt loss cannot trigger a second cleanup", async () => {
  await seedSingleClients();
  await command();
  const keys = await createSessionMaintenanceTestFixture(redis.writer, "iam:session", owned).seedUnified();
  const statePath = join(directory, "state.json");
  const state = await readFile(statePath, "utf8");
  await unlink(statePath);
  await command(1);
  await writeFile(statePath, state);
  await unlink(join(directory, "receipt.json"));
  await command(1);
  const left = await redis.observer.exists(...keys);
  expect(left).toBe(keys.length);
}, 120_000);
