import type { PostgresTestHarness } from "./postgres-harness";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const folder = fileURLToPath(new URL("../../src/migrations", import.meta.url));
const target = "20260916081103_managed_callback_origin";
let h: PostgresTestHarness;
beforeEach(async () => {
  h = await createPostgresTestHarness();
});
afterEach(async () => {
  await h?.close();
});

async function migrateFinal() {
  await migrate(drizzle({ client: h.sql }), { migrationsFolder: folder, migrationsSchema: h.schemaName });
}
async function journal() {
  return await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
}
const managed = {
  protocol: "custom-sso",
  callbackType: "managed",
  callbackEndpoint: "https://old.example/custom?tenant=old",
  validRedirectUrls: ["https://app.example/work/*"],
  subjectClaims: ["subjectIdentifier"],
  orcas: { enabled: true },
};
async function seed(code: string, config: unknown = managed) {
  await h.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,sso_config,sso_enabled,sso_secret,sso_credential_id,sso_secret_updated_at)
    VALUES (${code},'Retained','internal-secret','{"business":"retained"}',${JSON.stringify(config)}::jsonb,true,'existing-secret','20000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z')`;
}
test("formal empty database migration produces the final strict shape", async () => {
  await migrateFinal();
  const { callbackEndpoint: _old, ...final } = managed;
  await seed("managed", final);
  await expectPostgresErrorCode(seed("old"), "23514");
  await expectPostgresErrorCode(seed("business", { ...final, callbackType: "business", orcas: { enabled: false } }), "23514");
  await expectPostgresErrorCode(seed("null", { ...final, callbackEndpoint: null }), "23514");
  const before = await journal();
  await migrateFinal();
  const after = await journal();
  expect(after).toEqual(before);
  expect(after.at(-1)?.name).toBe(target);
});
