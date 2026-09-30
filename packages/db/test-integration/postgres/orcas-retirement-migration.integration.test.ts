import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ClientSsoConfigSchema } from "@iam/contracts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PostgresTestHarness } from "./postgres-harness";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const folder = fileURLToPath(new URL("../../src/migrations", import.meta.url));
const retirement = "20260928095714_retire_orcas_configuration";
const managed = {
  protocol: "custom-sso",
  callbackType: "managed",
  validRedirectUrls: ["https://app.example/work/*"],
  subjectClaims: ["subjectIdentifier", "profile:name"],
};
const business = { ...managed, callbackType: "business", callbackEndpoint: "https://app.example/cb" };
const oidc = {
  protocol: "oidc",
  clientType: "confidential",
  redirectUris: ["https://rp.example/cb"],
  postLogoutRedirectUris: [],
  allowedScopes: ["openid"],
};
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

async function migrateBeforeRetirement() {
  const root = resolve(tmpdir());
  const staged = await mkdtemp(join(root, "iam-orcas-migrations-"));
  if (!resolve(staged).startsWith(`${root}${sep}iam-orcas-migrations-`))
    throw new Error("Unexpected temporary migrations path");
  try {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name < retirement)
        await cp(join(folder, entry.name), join(staged, entry.name), { recursive: true });
    }
    await migrate(drizzle({ client: h.sql }), { migrationsFolder: staged, migrationsSchema: h.schemaName });
  } finally {
    await rm(staged, { recursive: true });
  }
}

async function seed(code: string, config: unknown, enabled = true, deleted = false) {
  await h.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,sso_config,sso_enabled,is_delete,sso_secret,sso_credential_id,sso_secret_updated_at)
    VALUES (${code},'Retained','internal-secret','{"business":"retained"}',${config === null ? null : JSON.stringify(config)}::jsonb,${enabled},${deleted},'existing-secret','20000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z')`;
}

async function clients() {
  return await h.sql<{ config: Record<string, unknown> | null; retained: Record<string, unknown> }[]>`
    SELECT sso_config AS config, to_jsonb(c) - 'sso_config' AS retained FROM client c ORDER BY id
  `;
}

test("formal migration removes only ORCAS configuration and preserves every other Client fact", async () => {
  await migrateBeforeRetirement();
  await seed("managed-on", { ...managed, orcas: { enabled: true } });
  await seed("managed-off", { ...managed, orcas: { enabled: false } }, false);
  await seed("deleted", { ...managed, orcas: { enabled: true } }, false, true);
  await seed("business-off", { ...business, orcas: { enabled: false } });
  await seed("managed-without-orcas", managed);
  await seed("oidc", oidc);
  await seed("unconfigured", null, false);
  const before = await clients();

  await migrateFinal();

  const after = await clients();
  expect([...after]).toEqual(
    before.map(({ config, retained }) => {
      if (config?.protocol !== "custom-sso") return { config, retained };
      const { orcas: _retired, ...remaining } = config;
      return { config: remaining, retained };
    }),
  );
  for (const row of after) expect(ClientSsoConfigSchema.nullable().safeParse(row.config).success).toBe(true);
  const journal = await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect(journal.at(-1)?.name).toBe(retirement);
  await migrateFinal();
  const replayedJournal = await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  const replayedClients = await clients();
  expect(replayedJournal).toEqual(journal);
  expect(replayedClients).toEqual(after);
});

test.each([
  { callback: "managed", config: managed, enabled: true },
  { callback: "managed", config: managed, enabled: false },
  { callback: "business", config: business, enabled: true },
  { callback: "business", config: business, enabled: false },
])(
  "new installation accepts $callback but rejects ORCAS enabled=$enabled on insert and update",
  async ({ config, enabled }) => {
    await migrateFinal();
    await seed("current", config);
    await expectPostgresErrorCode(seed("retired", { ...config, orcas: { enabled } }), "23514");
    await expectPostgresErrorCode(
      h.sql`UPDATE client SET sso_config=${JSON.stringify({ ...config, orcas: { enabled } })}::jsonb WHERE client_code='current'`,
      "23514",
    );
    const rows = await clients();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.config).toEqual(config);
  },
);

test("transaction rollback restores configuration and its prior constraint together", async () => {
  await migrateBeforeRetirement();
  const original = { ...managed, orcas: { enabled: true } };
  await seed("original", original);
  const before = await clients();
  const failure = new Error("abort migration transaction");
  let caught: unknown;
  try {
    await h.sql.begin(async (tx) => {
      await tx.file(join(folder, retirement, "migration.sql"), { cache: false });
      throw failure;
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
  const after = await clients();
  expect(after).toEqual(before);
  await seed("still-accepted-before-retirement", original);
});
