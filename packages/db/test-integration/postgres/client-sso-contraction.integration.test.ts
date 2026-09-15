import type { PostgresTestHarness } from "./postgres-harness";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ClientSsoConfigSchema } from "@iam/contracts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { createClientSnapshotRepository } from "../../src/client-snapshot";
import { relations } from "../../src/relations";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const folder = new URL("../../src/migrations/", import.meta.url);
const contraction = "20260914173743_confused_mystique";
const migration = new URL(`${contraction}/migration.sql`, folder);
const dropped = ["oidc_enabled", "oidc_config", "oidc_secret_hash", "oidc_config_version", "custom_sso_enabled", "custom_sso_config", "custom_sso_secret_hash", "custom_sso_config_version"];
const oldOidc = { clientType: "confidential", redirectUris: ["https://rp.example/callback"], postLogoutRedirectUris: [], allowedScopes: ["openid"], tokenEndpointAuthMethod: "client_secret_basic" };
const newOidc = ClientSsoConfigSchema.parse({ protocol: "oidc", clientType: "confidential", redirectUris: oldOidc.redirectUris, postLogoutRedirectUris: [], allowedScopes: ["openid"] });
let harness: PostgresTestHarness;
beforeEach(async () => {
  harness = await createPostgresTestHarness();
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && entry.name < contraction && await Bun.file(new URL(`${entry.name}/migration.sql`, folder)).exists())
      await harness.sql.file(fileURLToPath(new URL(`${entry.name}/migration.sql`, folder)), { cache: false });
  }
});
afterEach(async () => {
  await harness?.close();
});
async function seed() {
  const rows = await harness.sql`INSERT INTO client (client_code, client_name, client_secret, ext_attributes,
    oidc_config, oidc_enabled, oidc_secret_hash, oidc_config_version)
    VALUES ('app.web', 'Business', 'independent-internal-credential', '{"business":"retained"}', ${harness.sql.json(oldOidc)}, true, 'old-hash', 1) RETURNING id`;
  await harness.sql`INSERT INTO role (role_code, role_name, client_id) VALUES ('app:role', 'Business role', ${rows[0]!.id})`;
}
async function apply() {
  await harness.sql.begin(async (tx) => {
    await tx.file(migration, { cache: false });
  });
}
async function rows() {
  return await harness.sql`SELECT jsonb_build_object('client', to_jsonb(c) - ${dropped}::text[],
    'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM role r WHERE r.client_id=c.id)) AS value FROM client c ORDER BY c.id`;
}
test("pre-DDL guard retains unconverted configured Clients and their full source layout", async () => {
  await seed();
  const before = await harness.sql`SELECT to_jsonb(c) AS value FROM client c`;
  await expectPostgresErrorCode(apply(), "23514");
  const after = await harness.sql`SELECT to_jsonb(c) AS value FROM client c`;
  expect(after).toEqual(before);
  const columns = await harness.sql`SELECT attname FROM pg_attribute WHERE attrelid='client'::regclass AND attname='oidc_config' AND NOT attisdropped`;
  expect(columns).toHaveLength(1);
});
test("contraction preserves migrated identity, Role, independent Internal credential and strict single-protocol fields", async () => {
  await seed();
  await harness.sql`UPDATE client SET sso_config=${harness.sql.json(newOidc)}, sso_enabled=true,
    sso_secret=${"N".repeat(43)}, sso_credential_id='20000000-0000-4000-8000-000000000001', sso_secret_updated_at=now()`;
  await harness.sql`INSERT INTO client (client_code, client_name, client_secret, ext_attributes) VALUES ('internal', 'Internal only', 'other-internal', '{}')`;
  const before = await rows();
  await apply();
  const after = await rows();
  expect(after).toEqual(before);
  const columns = await harness.sql`SELECT attname FROM pg_attribute WHERE attrelid='client'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname`;
  expect(columns.map(row => row.attname)).toEqual(["client_code", "client_name", "client_secret", "create_time", "description", "ext_attributes", "id", "is_delete", "sso_config", "sso_credential_id", "sso_enabled", "sso_secret", "sso_secret_updated_at", "status", "update_time", "url"]);
  const source = createClientSnapshotRepository(drizzle({ client: harness.sql, relations }));
  const ordinary = await source.loadClient("app.web");
  const credential = await source.loadCredential("app.web");
  expect(ordinary).toEqual({ clientCode: "app.web", status: 1, ssoEnabled: true, ssoConfig: newOidc });
  expect(JSON.stringify(ordinary)).not.toContain("N".repeat(43));
  expect(credential).toMatchObject({ secret: "N".repeat(43), credentialId: "20000000-0000-4000-8000-000000000001" });
  const internal = await source.loadClient("internal");
  expect(internal).toMatchObject({ ssoEnabled: false, ssoConfig: null });
  await expectPostgresErrorCode(harness.sql`UPDATE client SET sso_enabled=true WHERE client_code='internal'`, "23514");
  await expectPostgresErrorCode(harness.sql`UPDATE client SET sso_credential_id=NULL WHERE client_code='app.web'`, "23514");
});
test("hash-only and missing-current-credential upgrades fail before source columns are removed", async () => {
  await seed();
  await harness.sql`UPDATE client SET sso_config=${harness.sql.json(newOidc)}, sso_enabled=true`;
  await expectPostgresErrorCode(apply(), "23514");
  await harness.sql`UPDATE client SET sso_secret='old-hash', sso_credential_id='20000000-0000-4000-8000-000000000001', sso_secret_updated_at=now()`;
  await expectPostgresErrorCode(apply(), "23514");
  const remaining = await harness.sql`SELECT oidc_secret_hash FROM client`;
  expect(remaining[0]?.oidc_secret_hash).toBe("old-hash");
});
test("empty and Internal-only inventories support a fresh installation without inventing SSO", async () => {
  await apply();
  const source = createClientSnapshotRepository(drizzle({ client: harness.sql, relations }));
  const empty = await source.loadClient("missing");
  expect(empty).toBeNull();
  await harness.sql`INSERT INTO client (client_code, client_name, client_secret, ext_attributes) VALUES ('internal', 'Internal', 'only-api', '{}')`;
  const internal = await source.loadClient("internal");
  const secret = await source.loadCredential("internal");
  expect(internal).toMatchObject({ ssoEnabled: false, ssoConfig: null });
  expect(secret).toBeNull();
});
