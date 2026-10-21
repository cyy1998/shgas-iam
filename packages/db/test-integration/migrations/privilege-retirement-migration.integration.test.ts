import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrationFolder = fileURLToPath(new URL("../../src/migrations/", import.meta.url));
const lastSourceMigration = "20261020090553_client_delegation";
const retirement = "20261021120501_retire_privilege";
let h: PostgresTestHarness;

beforeEach(async () => {
  h = await createPostgresTestHarness();
});
afterEach(async () => {
  await h?.close();
});

async function migrateFinal() {
  await migrate(drizzle({ client: h.sql }), {
    migrationsFolder: migrationFolder,
    migrationsSchema: h.schemaName,
  });
}

async function migrateSource() {
  const root = resolve(tmpdir());
  const staged = await mkdtemp(join(root, "iam-privilege-migrations-"));
  if (!resolve(staged).startsWith(`${root}${sep}iam-privilege-migrations-`))
    throw new Error("Unexpected temporary migrations path");
  try {
    for (const entry of await readdir(migrationFolder, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name <= lastSourceMigration)
        await cp(join(migrationFolder, entry.name), join(staged, entry.name), { recursive: true });
    }
    await migrate(drizzle({ client: h.sql }), { migrationsFolder: staged, migrationsSchema: h.schemaName });
  } finally {
    await rm(staged, { recursive: true });
  }
}

async function seedRetainedFacts() {
  await h.sql`INSERT INTO "user" (username,name,status,is_delete,password)
    VALUES ('alice','Alice',1,false,'retained-password'),('bob','Bob',2,false,NULL),
      ('disabled','Disabled',3,false,NULL),('deleted','Deleted',3,true,NULL)`;
  await h.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,sso_enabled,sso_config,sso_secret,sso_credential_id,sso_secret_updated_at)
    VALUES ('one','Retained Client','retained-internal-secret','{"retained":true}',true,
      '{"protocol":"custom-sso","callbackType":"business","callbackEndpoint":"https://app.example/cb","validRedirectUrls":["https://app.example/"],"subjectClaims":["subjectIdentifier","iam:authorization"]}',
      'retained-sso-secret','20000000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z')`;
  await h.sql`INSERT INTO organization (org_code,org_name,path,level,org_type)
    VALUES ('ROOT','Root','/1',1,'company')`;
  await h.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0)`;
  await h.sql`INSERT INTO position (post_code,post_name) VALUES ('MANAGER','Manager')`;
  await h.sql`INSERT INTO employment (user_id,pos_id,dept_id,is_primary,status,start_time)
    VALUES (1,1,1,true,1,'2026-01-01T00:00:00Z')`;
  await h.sql`INSERT INTO role (role_code,role_name,client_id,status)
    VALUES ('reader','Reader',1,1),('paused','Paused role',1,2)`;
  await h.sql`INSERT INTO role_assignment (role_id,target_type,target_id,include_descendants)
    VALUES (1,'employment',1,false),(2,'organization',1,true)`;
  await h.sql`INSERT INTO client_delegation (delegator_user_id,delegatee_user_id,client_id,organization_scope_id,start_time,end_time,status,description)
    VALUES (1,2,1,1,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',2,'Retained delegation')`;
  await h.sql`INSERT INTO audit_log (action,outcome,actor_type,actor_client_code,target_type,target_id,source_app,details)
    VALUES ('privilege.create','success','client','one','privilege',1,'iam','{"historical":true}')`;
}

async function retainedFacts() {
  return {
    users: [...(await h.sql`SELECT * FROM "user" ORDER BY id`)],
    clients: [...(await h.sql`SELECT * FROM client ORDER BY id`)],
    organizations: [...(await h.sql`SELECT * FROM organization ORDER BY id`)],
    closure: [...(await h.sql`SELECT * FROM organization_closure ORDER BY ancestor_id,descendant_id`)],
    positions: [...(await h.sql`SELECT * FROM position ORDER BY id`)],
    employments: [...(await h.sql`SELECT * FROM employment ORDER BY id`)],
    roles: [...(await h.sql`SELECT * FROM role ORDER BY id`)],
    assignments: [...(await h.sql`SELECT * FROM role_assignment ORDER BY id`)],
    delegations: [...(await h.sql`SELECT * FROM client_delegation ORDER BY id`)],
    audits: [...(await h.sql`SELECT * FROM audit_log ORDER BY id`)],
  };
}

async function retiredSourceInventory() {
  const [inventory] = await h.sql`SELECT
    to_regclass(current_schema() || '.privilege') AS privilege,
    to_regclass(current_schema() || '.role_privilege') AS role_privilege,
    to_regclass(current_schema() || '.idx_privilege_id') AS privilege_index`;
  return inventory;
}

test("formal retirement removes the populated permission source while preserving all other domain facts and migration receipts", async () => {
  await migrateSource();
  await seedRetainedFacts();
  await h.sql`INSERT INTO privilege (privilege_code,privilege_name,status,is_delete)
    VALUES ('read','Read',1,false),('paused','Paused permission',2,false),('deleted','Deleted permission',3,true)`;
  await h.sql`INSERT INTO role_privilege (role_id,privilege_id) VALUES (1,1),(1,2),(2,3)`;
  const before = await retainedFacts();
  const previousJournal = await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;

  await migrateFinal();

  const inventory = await retiredSourceInventory();
  const after = await retainedFacts();
  const journal = await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect(inventory).toEqual({ privilege: null, role_privilege: null, privilege_index: null });
  expect(after).toEqual(before);
  expect(journal.slice(0, previousJournal.length)).toEqual(previousJournal);
  expect(journal.filter((entry) => entry.name === retirement)).toHaveLength(1);

  await migrateFinal();
  const repeatedJournal = await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  const repeatedFacts = await retainedFacts();
  expect(repeatedJournal).toEqual(journal);
  expect(repeatedFacts).toEqual(after);
});

test("empty installation has the contracted source schema and repeated formal migrations retain roles and Client Delegation", async () => {
  await migrateFinal();
  const inventory = await retiredSourceInventory();
  expect(inventory).toEqual({ privilege: null, role_privilege: null, privilege_index: null });
  await seedRetainedFacts();
  const before = await retainedFacts();
  const journal = await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;

  await migrateFinal();

  const after = await retainedFacts();
  const repeatedJournal = await h.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect(after).toEqual(before);
  expect(repeatedJournal).toEqual(journal);
});
