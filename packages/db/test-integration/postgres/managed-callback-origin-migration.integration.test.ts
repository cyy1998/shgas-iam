import type { PostgresTestHarness } from "./postgres-harness";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ClientSsoConfigSchema } from "@iam/contracts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { upgradeManagedCallbackOrigins } from "../../src/managed-callback-upgrade";
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

async function migrateCurrent() {
  const prefix = "iam203-migrations-";
  const temporary = await mkdtemp(join(tmpdir(), prefix));
  try {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name < target)
        await cp(join(folder, entry.name), join(temporary, entry.name), { recursive: true });
    }
    await migrate(drizzle({ client: h.sql }), { migrationsFolder: temporary, migrationsSchema: h.schemaName });
  }
  finally {
    await removeTemporary(temporary, prefix);
  }
}
async function removeTemporary(temporary: string, prefix: string) {
  if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith(prefix))
    throw new Error("Unsafe temporary migration path");
  await rm(temporary, { recursive: true, force: true });
}
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
async function facts() {
  return await h.sql`SELECT to_jsonb(c) AS value FROM client c ORDER BY client_code`;
}
async function capture(work: () => Promise<unknown>) {
  try {
    await work();
  }
  catch (error) { return error; }
  throw new Error("Expected failure");
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

test("current preparation removes only managed addresses and formal migration preserves journal and all other facts on repeat", async () => {
  await migrateCurrent();
  await seed("a-managed");
  await seed("business", { ...managed, callbackType: "business", orcas: { enabled: false } });
  await seed("oidc", { protocol: "oidc", clientType: "confidential", redirectUris: ["https://oidc.example/cb"], postLogoutRedirectUris: [], allowedScopes: ["openid"] });
  const before = await facts();
  const oldJournal = await journal();
  const failed = await capture(migrateFinal);
  expect(failed).toBeDefined();
  const afterFailed = await journal();
  expect(afterFailed).toEqual(oldJournal);
  const inventory = await upgradeManagedCallbackOrigins(h.sql, "inventory", input => ClientSsoConfigSchema.parse(input), h.schemaName);
  expect(inventory).toMatchObject({ changes: ["a-managed"], managedClients: ["a-managed"] });
  const applied = await upgradeManagedCallbackOrigins(h.sql, "apply", input => ClientSsoConfigSchema.parse(input), h.schemaName);
  expect(applied.changes).toEqual(inventory.changes);
  const preparedJournal = await journal();
  expect(preparedJournal).toEqual(oldJournal);
  await migrateFinal();
  const after = await facts();
  const expected = structuredClone(before);
  delete expected[0]!.value.sso_config.callbackEndpoint;
  expect(after).toEqual(expected);
  for (const row of after) expect(ClientSsoConfigSchema.safeParse(row.value.sso_config).success).toBe(true);
  const finalJournal = await journal();
  expect(finalJournal.slice(0, -1)).toEqual(oldJournal);
  expect(finalJournal.at(-1)?.name).toBe(target);
  const repeat = await upgradeManagedCallbackOrigins(h.sql, "apply", input => ClientSsoConfigSchema.parse(input), h.schemaName);
  const verify = await upgradeManagedCallbackOrigins(h.sql, "verify", input => ClientSsoConfigSchema.parse(input), h.schemaName);
  expect(repeat.changes).toEqual([]);
  expect(verify.managedClients).toEqual(["a-managed"]);
  await migrateFinal();
  const repeatedFacts = await facts();
  const repeatedJournal = await journal();
  expect(repeatedFacts).toEqual(after);
  expect(repeatedJournal).toEqual(finalJournal);
});

test("invalid source prevalidation rejects the upgrade without changing any rows", async () => {
  await migrateCurrent();
  await seed("a-managed");
  await seed("z-invalid", { ...managed, callbackEndpoint: "https://old.example/#fragment" });
  const before = await facts();
  const invalid = await capture(() => upgradeManagedCallbackOrigins(h.sql, "apply", input => ClientSsoConfigSchema.parse(input), h.schemaName));
  expect(invalid).toBeDefined();
  const afterInvalid = await facts();
  expect(afterInvalid).toEqual(before);
});

test("later update failure rolls back rows and constraints and permits recovery after removing the trigger", async () => {
  await migrateCurrent();
  await seed("a-managed");
  await seed("z-managed");
  await h.sql.unsafe(`CREATE FUNCTION reject_managed_upgrade() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.client_code = 'z-managed' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_managed_upgrade BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION reject_managed_upgrade();`);
  const beforeWrite = await facts();
  await expectPostgresErrorCode(upgradeManagedCallbackOrigins(h.sql, "apply", input => ClientSsoConfigSchema.parse(input), h.schemaName), "P0001");
  const afterWrite = await facts();
  expect(afterWrite).toEqual(beforeWrite);
  await seed("still-old");
  const { callbackEndpoint: _old, ...final } = managed;
  await expectPostgresErrorCode(seed("still-reject-new", final), "23514");
  await h.sql`DROP TRIGGER reject_managed_upgrade ON client`;
  const result = await upgradeManagedCallbackOrigins(h.sql, "apply", input => ClientSsoConfigSchema.parse(input), h.schemaName);
  expect(result.changes).toHaveLength(3);
  await migrateFinal();
});
