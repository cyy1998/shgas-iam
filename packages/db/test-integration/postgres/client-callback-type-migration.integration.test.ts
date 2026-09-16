import type { PostgresTestHarness } from "./postgres-harness";
import { readdir } from "node:fs/promises";
import { ClientSsoCallbackType, ClientSsoConfigSchema } from "@iam/contracts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { upgradeClientCallbackTypes } from "../../scripts/migrate-client-callback-type";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const folder = new URL("../../src/migrations/", import.meta.url);
const target = "20260916050609_explicit_callback_type";
let harness: PostgresTestHarness;
beforeEach(async () => {
  harness = await createPostgresTestHarness();
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && entry.name < target && await Bun.file(new URL(`${entry.name}/migration.sql`, folder)).exists())
      await harness.sql.file(new URL(`${entry.name}/migration.sql`, folder), { cache: false });
  }
});
afterEach(async () => {
  await harness?.close();
});

async function seed(code: string, callback: string) {
  const config = { protocol: "custom-sso", callbackEndpoint: callback, validRedirectUrls: ["https://app.test/home"], subjectClaims: ["subjectIdentifier"], orcas: { enabled: true } };
  await harness.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,sso_config,sso_enabled,sso_secret,sso_credential_id,sso_secret_updated_at)
    VALUES (${code},'Retained','internal-sentinel','{}',${harness.sql.json(config)},true,'sso-sentinel','20000000-0000-4000-8000-000000000001',now())`;
}

test("backfill uses parsed paths once, reports ORCAS changes and preserves credentials and explicit edits on repeat", async () => {
  await seed("managed", "https://app.test:444/a/../sso/callback?tenant=a");
  await seed("business", "https://app.test/sso/callback/");
  await seed("case", "https://app.test/SSO/callback");
  await harness.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,sso_config)
    VALUES ('z-oidc','OIDC','internal-oidc','{}','{"protocol":"oidc","clientType":"public","redirectUris":["https://app.test/home"],"postLogoutRedirectUris":[],"allowedScopes":["openid"]}'),
      ('z-internal','Internal','internal-only','{}',NULL)`;
  const unaffected = await harness.sql`SELECT to_jsonb(c) AS value FROM client c WHERE client_code LIKE 'z-%' ORDER BY client_code`;
  const before = await harness.sql`SELECT to_jsonb(c) - 'sso_config' AS value FROM client c ORDER BY client_code`;
  const inventory = await upgradeClientCallbackTypes(harness.sql, "inventory");
  expect(inventory.changes).toEqual([
    { clientCode: "business", callbackType: ClientSsoCallbackType.Business, orcasDisabled: true },
    { clientCode: "case", callbackType: ClientSsoCallbackType.Business, orcasDisabled: true },
    { clientCode: "managed", callbackType: ClientSsoCallbackType.Managed, orcasDisabled: false },
  ]);
  await expectPostgresErrorCode(harness.sql.begin(async tx => await tx.file(new URL(`${target}/migration.sql`, folder))), "23514");
  const applied = await upgradeClientCallbackTypes(harness.sql, "apply");
  expect(applied.changes).toEqual(inventory.changes);
  const after = await harness.sql`SELECT to_jsonb(c) - 'sso_config' AS value FROM client c ORDER BY client_code`;
  expect(after).toEqual(before);
  const configs = await harness.sql`SELECT client_code,sso_config FROM client WHERE client_code NOT LIKE 'z-%' ORDER BY client_code`;
  for (const row of configs) expect(ClientSsoConfigSchema.safeParse(row.sso_config).success).toBe(true);
  expect(configs[0]!.sso_config.orcas.enabled).toBe(false);
  expect(configs[2]!.sso_config.callbackEndpoint).toBe("https://app.test:444/a/../sso/callback?tenant=a");
  const retained = await harness.sql`SELECT to_jsonb(c) AS value FROM client c WHERE client_code LIKE 'z-%' ORDER BY client_code`;
  expect(retained).toEqual(unaffected);
  await harness.sql`UPDATE client SET sso_config=jsonb_set(sso_config,'{callbackType}','"managed"') WHERE client_code='business'`;
  const repeat = await upgradeClientCallbackTypes(harness.sql, "apply");
  expect(repeat.changes).toEqual([]);
  const verified = await upgradeClientCallbackTypes(harness.sql, "verify");
  expect(verified.changes).toEqual([]);
  await expectPostgresErrorCode(harness.sql`UPDATE client SET sso_config=sso_config-'callbackType' WHERE client_code='business'`, "23514");
  await expectPostgresErrorCode(harness.sql`UPDATE client SET sso_config=jsonb_set(sso_config,'{orcas,enabled}','true') WHERE client_code='case'`, "23514");
});

test("a write failure rolls back earlier rows and restores the old constraint before a successful rerun", async () => {
  await seed("first", "https://app.test/sso/callback");
  await seed("second", "https://app.test/business");
  await harness.sql.unsafe(`CREATE FUNCTION reject_callback_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.client_code = 'second' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_callback_upgrade BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION reject_callback_upgrade();`);
  const before = await harness.sql`SELECT to_jsonb(c) AS value FROM client c ORDER BY client_code`;
  await expectPostgresErrorCode(upgradeClientCallbackTypes(harness.sql, "apply"), "P0001");
  const after = await harness.sql`SELECT to_jsonb(c) AS value FROM client c ORDER BY client_code`;
  expect(after).toEqual(before);
  await seed("third", "https://app.test/other");
  await harness.sql`DROP TRIGGER reject_callback_upgrade ON client`;
  const report = await upgradeClientCallbackTypes(harness.sql, "apply");
  expect(report.changes).toHaveLength(3);
});

test("malformed source aborts before any rows or constraints change", async () => {
  await seed("first", "https://app.test/sso/callback");
  await seed("invalid", "https://app.test/callback#fragment");
  const before = await harness.sql`SELECT to_jsonb(c) AS value FROM client c ORDER BY client_code`;
  let failure: unknown;
  try {
    await upgradeClientCallbackTypes(harness.sql, "apply");
  }
  catch (error) {
    failure = error;
  }
  expect(failure).toBeDefined();
  const after = await harness.sql`SELECT to_jsonb(c) AS value FROM client c ORDER BY client_code`;
  expect(after).toEqual(before);
  await seed("still-old", "https://app.test/other");
});
