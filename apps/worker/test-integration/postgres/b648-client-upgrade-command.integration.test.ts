import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ClientSnapshotValueSchema } from "@iam/api-core/client-snapshot";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { ValidatedClientSsoConfigSchema } from "@iam/domain/client/sso-configuration";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
const dbRoot = fileURLToPath(new URL("../../../../packages/db", import.meta.url));
let manifestPath: string;
let receiptPath: string;
let h: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
beforeEach(async () => {
  manifestPath = `${workerRoot}/test-results/b648-${randomUUID()}.json`;
  receiptPath = `${manifestPath}.receipt`;
  h = await createWorkerPostgresTestHarness({ b648ClientSource: true });
  await mkdir(`${workerRoot}/test-results`, { recursive: true });
});
afterEach(async () => {
  if (h)
    await h.close();
  for (const path of [manifestPath, receiptPath, `${manifestPath}.config.ts`]) {
    try {
      await unlink(path);
    }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        throw error;
    }
  }
});

async function command(script: string, args: string[] = [], expectedExitCode = 0, schemaName = h.schemaName) {
  const isDb = script === "db:migrate";
  const configPath = `${manifestPath}.config.ts`;
  const url = new URL(h.commandDatabaseUrl);
  url.searchParams.set("options", `-csearch_path=${schemaName}`);
  if (isDb)
    await writeFile(configPath, `export default { ...${JSON.stringify({ dialect: "postgresql", out: `${dbRoot}/src/migrations`, migrations: { schema: schemaName } })}, dbCredentials: { url: process.env.DATABASE_URL } };`);
  const result = await runProcessCommandSmoke({
    label: `b648 ${script}`,
    start: () => spawnOwnedProcessTree({ executable: process.execPath, args: ["--no-env-file", "run", script, ...args, ...(isDb ? ["--config", configPath] : ["--migrations-schema", schemaName])], cwd: isDb ? dbRoot : workerRoot, env: { ...process.env, DATABASE_URL: url.toString(), IAM_WORKER_DATABASE_URL: url.toString() } }),
    completionTimeoutMs: 75_000,
    cleanupTimeoutMs: 5000,
    maxOutputBytes: 256 * 1024,
    expectedExitCode,
  });
  if (isDb)
    await unlink(configPath);
  expect(result.output).not.toContain("private-secret");
  return result.output;
}
function stage(mode: string, flags: string[] = [], exit = 0) {
  return command("scripts/b648-upgrade/index.ts", [mode, "--writers-stopped", ...flags], exit);
}
async function journal() {
  return Array.from(await h.sql.unsafe(`SELECT name,hash,created_at FROM "${h.schemaName}".__drizzle_migrations ORDER BY created_at`));
}

async function seedClients() {
  const gateway = { mode: "gateway", validRedirectUrls: ["https://*.example.test/work/*"], subjectClaims: ["subjectIdentifier"], orcas: { enabled: true } };
  const independent = { mode: "independent", callbackEndpoint: "https://business.test/sso/callback", logoutEndpoint: "https://business.test/logout", validRedirectUrls: ["https://business.test/*"], subjectClaims: ["subjectIdentifier"] };
  const oidc = { clientType: "confidential", redirectUris: ["https://business.test/oidc"], postLogoutRedirectUris: [], allowedScopes: ["openid"], tokenEndpointAuthMethod: "client_secret_basic" };
  for (const [code, custom, selectedOidc] of [
    ["gateway/特殊", gateway, null],
    ["business", independent, null],
    ["dual", independent, oidc],
    ["oidc", null, oidc],
    ["public", null, { ...oidc, clientType: "public", tokenEndpointAuthMethod: "none" }],
    ["none", null, null],
  ] as const) {
    await h.sql`INSERT INTO client (client_code, client_name, client_secret, ext_attributes,
      custom_sso_enabled, custom_sso_config, custom_sso_secret_hash, custom_sso_config_version,
      oidc_enabled, oidc_config, oidc_secret_hash, oidc_config_version)
      VALUES (${code}, 'Retained', 'private-secret-internal', '{"retained":true}',
      ${custom !== null && code !== "business"}, ${custom ? JSON.stringify(custom) : null}::jsonb,
      ${custom?.mode === "independent" ? "$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuv12345678901" : null}, ${custom ? 1 : 0},
      ${selectedOidc !== null}, ${selectedOidc ? JSON.stringify(selectedOidc) : null}::jsonb,
      ${selectedOidc?.clientType === "confidential" ? "$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuv12345678901" : null}, ${selectedOidc ? 1 : 0})`;
  }
  await h.sql`INSERT INTO role (role_code, role_name, client_id) SELECT 'retained-role', 'Retained', id FROM client WHERE client_code = 'business'`;
}

async function writeManifest(selectProtocol = true) {
  const output = await stage("inventory");
  const line = output.replaceAll("[stdout] ", "").split("\n").find(row => row.startsWith("{\"version\":1"))!;
  const inventory = JSON.parse(line).report;
  const manifest = { version: 1, layout: "dual-to-single-v1", clients: inventory.clients.map((row: { clientCode: string; sourceDigest: string; credentialId: string }) => ({
    clientCode: row.clientCode,
    sourceDigest: row.sourceDigest,
    credentialId: row.credentialId,
  })) };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const manifestFlags = ["--manifest", manifestPath];
  const contractFlags = [...manifestFlags, "--receipt", receiptPath];
  const selected = { ...manifest, clients: manifest.clients.map((row: { clientCode: string }) => selectProtocol && row.clientCode === "dual" ? { ...row, protocol: "custom-sso" } : row) };
  await writeFile(manifestPath, JSON.stringify(selected));
  return { manifestFlags, contractFlags };
}

async function prepareConverted() {
  await seedClients();
  await stage("expand");
  await stage("prepare");
  const flags = await writeManifest();
  await stage("apply", flags.manifestFlags);
  return flags;
}

async function finishConversion(contractFlags: string[]) {
  await stage("contract", contractFlags);
  await stage("finalize", contractFlags);
  await stage("finalize", contractFlags);
  await stage("verify-final", contractFlags);
}

test("exact b648 database reaches strict final readers and preserves identities on repetition", async () => {
  await seedClients();
  const source = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  const roles = Array.from(await h.sql`SELECT * FROM role`);
  const initialJournal = await journal();
  expect(initialJournal.at(-1)?.name).toBe("20260823091908_remove_subject_claim_catalog_version");
  await stage("preflight");
  await stage("expand");
  await stage("expand");
  expect((await journal()).at(-1)?.name).toBe("20260914061007_romantic_maestro");
  await stage("prepare");
  const { manifestFlags, contractFlags } = await writeManifest();
  await stage("apply", manifestFlags);
  const converted = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  expect(converted[0]!.data.sso_config).toMatchObject({ callbackType: "managed", callbackEndpoint: `https://iam-offline-upgrade.invalid/client/${source[0]!.data.id}/sso/callback` });
  expect(converted[1]!.data.sso_config.callbackEndpoint).toBe("https://business.test/sso/callback");
  expect(converted[1]!.data.sso_enabled).toBe(false);
  expect(converted[1]!.data.sso_secret).toHaveLength(43);
  expect(converted[0]!.data.sso_secret).toBeNull();
  expect(converted[4]!.data.sso_secret).toBeNull();
  const removeTarget = (row: typeof converted[number]) => Object.fromEntries(Object.entries(row.data).filter(([key]) => !key.startsWith("sso_")));
  expect(converted.map(removeTarget)).toEqual(source.map(row => row.data));
  await stage("apply", manifestFlags);
  const repeated = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  expect(repeated).toEqual(converted);
  await stage("verify", manifestFlags);
  await stage("contract", contractFlags);
  await stage("contract", contractFlags);
  expect((await journal()).at(-1)?.name).toBe("20260916050609_explicit_callback_type");
  const receipt = await readFile(receiptPath, "utf8");
  for (const row of converted) {
    if (row.data.sso_secret)
      expect(receipt).not.toContain(row.data.sso_secret);
  }
  await stage("finalize", contractFlags);
  await stage("finalize", contractFlags);
  await stage("verify-final", contractFlags);
  const final = Array.from(await h.sql`SELECT * FROM client ORDER BY id`);
  for (const [index, row] of final.entries()) {
    const snapshot = await createClientSnapshotRepository(h.db).loadClient(row.client_code);
    expect(ClientSnapshotValueSchema.safeParse(snapshot).success).toBe(true);
    if (row.sso_config)
      expect(ValidatedClientSsoConfigSchema.safeParse(row.sso_config).success).toBe(true);
    expect(row.sso_secret).toBe(converted[index]!.data.sso_secret);
    expect(row.sso_credential_id).toBe(converted[index]!.data.sso_credential_id);
    expect(row.client_secret).toBe("private-secret-internal");
  }
  expect(final[0]!.sso_config).not.toHaveProperty("callbackEndpoint");
  const retainedRoles = Array.from(await h.sql`SELECT * FROM role`);
  expect(retainedRoles).toEqual(roles);
  const created = await h.sql`INSERT INTO client(client_code,client_name,client_secret,ext_attributes)
    VALUES ('post-upgrade','New Client','private-secret','{}'::jsonb) RETURNING id`;
  expect(created[0]!.id).toBeGreaterThan(final.at(-1)!.id);
}, 180_000);

test.each([
  { name: "changed column default", statements: ["ALTER TABLE client ALTER COLUMN client_name SET DEFAULT 'drift'"], reason: "unsupported-client-constraints-defaults-or-indexes" },
  { name: "1000 Client limit exceeded", statements: ["INSERT INTO client(client_code,client_name,client_secret,ext_attributes) SELECT 'overflow-' || n, 'Bound', 'private-secret', '{}'::jsonb FROM generate_series(1,1000) n"], reason: "source-exceeds-1000-clients" },
  { name: "invalid Gateway redirect pattern", statements: ["UPDATE client SET custom_sso_config = custom_sso_config || '{\"validRedirectUrls\":[\"*\"]}'::jsonb WHERE client_code='gateway/特殊'"], reason: "invalid-source-configuration" },
  { name: "unexpected source column", statements: ["ALTER TABLE client ADD COLUMN drift text"], reason: "unsupported-client-schema" },
  { name: "missing serial default", statements: ["ALTER TABLE client ALTER COLUMN id DROP DEFAULT"], reason: "unsupported-client-id-sequence" },
  { name: "constant serial default", statements: ["ALTER TABLE client ALTER COLUMN id SET DEFAULT 1"], reason: "unsupported-client-id-sequence" },
  { name: "default references another sequence", statements: ["CREATE SEQUENCE wrong_id_seq", "ALTER TABLE client ALTER COLUMN id SET DEFAULT nextval('wrong_id_seq'::regclass)"], reason: "unsupported-client-id-sequence" },
  { name: "sequence no longer owned by Client id", statements: ["ALTER SEQUENCE client_id_seq OWNED BY NONE"], reason: "unsupported-client-id-sequence" },
  { name: "changed sequence increment", statements: ["ALTER SEQUENCE client_id_seq INCREMENT BY 2"], reason: "unsupported-client-id-sequence" },
])("source preflight rejects $name without changing data or journal", async ({ statements, reason }) => {
  await seedClients();
  for (const statement of statements)
    await h.sql.unsafe(statement);
  const before = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  const beforeJournal = await journal();
  const preflight = await stage("preflight", [], 1);
  expect(preflight).toContain(reason);
  const expansion = await stage("expand", [], 1);
  expect(expansion).toContain(reason);
  const after = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  const afterJournal = await journal();
  expect(after).toEqual(before);
  expect(afterJournal).toEqual(beforeJournal);
}, 15_000);

test("dual configuration without explicit selection prevents every apply write", async () => {
  await seedClients();
  await stage("expand");
  await stage("prepare");
  const { manifestFlags } = await writeManifest(false);
  const before = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  const report = await stage("apply", manifestFlags, 1);
  expect(report).toContain("protocol-selection-required");
  const after = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  expect(after).toEqual(before);
}, 20_000);

test("contract refuses an unconverted manifest before dropping source columns", async () => {
  await seedClients();
  await stage("expand");
  await stage("prepare");
  const { contractFlags } = await writeManifest();
  const before = await journal();
  await stage("contract", contractFlags, 1);
  const after = await journal();
  expect(after).toEqual(before);
}, 20_000);

test("independent verify rejects a changed manifest digest", async () => {
  const { manifestFlags } = await prepareConverted();
  await stage("verify", [...manifestFlags, "--manifest-digest", "0".repeat(64)], 1);
}, 20_000);

test("Role source drift blocks contraction independently of prior verification", async () => {
  const { manifestFlags, contractFlags } = await prepareConverted();
  await stage("verify", manifestFlags);
  await h.sql`UPDATE role SET role_name='drift'`;
  const before = await journal();
  await stage("contract", contractFlags, 1);
  const after = await journal();
  expect(after).toEqual(before);
}, 20_000);

test("contraction DDL rollback preserves data and the same receipt resumes successfully", async () => {
  const { contractFlags } = await prepareConverted();
  const converted = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  const before = await journal();
  await h.sql`CREATE VIEW retained_legacy_dependency AS SELECT oidc_config FROM client`;
  await stage("contract", contractFlags, 1);
  const failedJournal = await journal();
  const interrupted = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  expect(failedJournal).toEqual(before);
  expect(interrupted).toEqual(converted);
  const receipt = await readFile(receiptPath, "utf8");
  await h.sql`DROP VIEW retained_legacy_dependency`;
  await stage("contract", contractFlags);
  const resumedReceipt = await readFile(receiptPath, "utf8");
  expect(resumedReceipt).toBe(receipt);
  expect((await journal()).at(-1)?.name).toBe("20260916050609_explicit_callback_type");
}, 30_000);

test("final verification refuses the intermediate callback-address stage", async () => {
  const { contractFlags } = await prepareConverted();
  await stage("contract", contractFlags);
  await stage("verify-final", contractFlags, 1);
}, 20_000);

test("final verification detects retained-fact drift after a complete successful upgrade", async () => {
  const { contractFlags } = await prepareConverted();
  await finishConversion(contractFlags);
  await h.sql`UPDATE client SET client_name='changed' WHERE client_code='business'`;
  await stage("verify-final", contractFlags, 1);
}, 30_000);

test("ordinary Drizzle command completes a fresh installation and reruns the full journal", async () => {
  const schema = `iam205_fresh_${randomUUID().replaceAll("-", "")}`;
  await h.sql.unsafe(`CREATE SCHEMA "${schema}"`);
  try {
    await command("db:migrate", [], 0, schema);
    await command("db:migrate", [], 0, schema);
    const full = await h.sql.unsafe(`SELECT name FROM "${schema}".__drizzle_migrations ORDER BY created_at DESC LIMIT 1`);
    expect(full[0]!.name).toBe("20260916081103_managed_callback_origin");
  }
  finally {
    await h.sql.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
}, 30_000);

test("finalization rejects a conflicting receipt before changing configuration or journal", async () => {
  const { contractFlags } = await prepareConverted();
  await stage("contract", contractFlags);
  const before = Array.from(await h.sql`SELECT sso_config FROM client ORDER BY id`);
  const beforeJournal = await journal();
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.manifestDigest = "0".repeat(64);
  await writeFile(receiptPath, JSON.stringify(receipt));
  await stage("finalize", contractFlags, 1);
  const after = Array.from(await h.sql`SELECT sso_config FROM client ORDER BY id`);
  const afterJournal = await journal();
  expect(after).toEqual(before);
  expect(afterJournal).toEqual(beforeJournal);
}, 30_000);

test("apply rolls back every Client after a write failure and resumes with the original manifest", async () => {
  await seedClients();
  await stage("expand");
  await stage("prepare");
  const { manifestFlags } = await writeManifest();
  const before = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  await h.sql`CREATE FUNCTION reject_sso_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.client_code = 'business' THEN RAISE EXCEPTION 'private-error-%', NEW.sso_secret; END IF; RETURN NEW; END $$`;
  await h.sql`CREATE TRIGGER reject_sso_update BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION reject_sso_update()`;
  const failure = await stage("apply", manifestFlags, 1);
  expect(failure).not.toContain("private-error-");
  const after = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  expect(after).toEqual(before);
  await h.sql`DROP TRIGGER reject_sso_update ON client`;
  await h.sql`DROP FUNCTION reject_sso_update()`;
  await stage("apply", manifestFlags);
  await stage("verify", manifestFlags);
}, 30_000);

test("apply rechecks source facts after waiting for a writer", async () => {
  await seedClients();
  await stage("expand");
  await stage("prepare");
  const { manifestFlags } = await writeManifest();
  const writer = await h.sql.reserve();
  let pending: ReturnType<typeof stage> | undefined;
  try {
    await writer`BEGIN`;
    await writer`UPDATE role SET role_name='Changed role'`;
    pending = stage("apply", manifestFlags, 1);
    let waiting = false;
    const deadline = Date.now() + 5000;
    while (!waiting && Date.now() < deadline) {
      const active = await h.sql`SELECT 1 FROM pg_stat_activity
        WHERE application_name='iam-b648-client-upgrade' AND wait_event_type='Lock'`;
      waiting = active.length > 0;
      if (!waiting)
        await Bun.sleep(20);
    }
    expect(waiting).toBe(true);
    await writer`COMMIT`;
    const output = await pending;
    expect(output).toContain("source-changed-or-missing");
    const changed = await h.sql`SELECT id FROM client WHERE sso_config IS NOT NULL OR sso_secret IS NOT NULL`;
    expect(changed).toHaveLength(0);
  }
  finally {
    await writer`ROLLBACK`;
    writer.release();
    if (pending)
      await pending;
  }
}, 30_000);

test("incomplete manifest prevents every apply write", async () => {
  await seedClients();
  await stage("expand");
  await stage("prepare");
  const { manifestFlags } = await writeManifest();
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.clients.pop();
  await writeFile(manifestPath, JSON.stringify(manifest));
  const before = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  await stage("apply", manifestFlags, 1);
  const after = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  expect(after).toEqual(before);
}, 20_000);

test("independent verification rejects a corrupted converted credential without rewriting it", async () => {
  const { manifestFlags } = await prepareConverted();
  await h.sql`UPDATE client SET sso_secret=custom_sso_secret_hash WHERE client_code='business'`;
  const before = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  await stage("verify", manifestFlags, 1);
  await stage("apply", manifestFlags, 1);
  const after = Array.from(await h.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  expect(after).toEqual(before);
}, 20_000);
