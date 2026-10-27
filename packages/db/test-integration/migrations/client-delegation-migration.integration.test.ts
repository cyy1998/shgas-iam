import { afterEach, beforeEach, expect, test } from "bun:test";
import { access, cp, mkdir, mkdtemp, readdir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const sourceMigrationFolder = new URL("../../src/migrations/", import.meta.url);
const target = "20261020090553_client_delegation";
let migrationFolder: string;
let h: PostgresTestHarness;
beforeEach(async () => {
  migrationFolder = await mkdtemp(join(tmpdir(), "iam-client-delegation-migrations-"));
  await cp(sourceMigrationFolder, migrationFolder, { recursive: true });
  // An unregistered empty directory must not become part of the formal history.
  await mkdir(join(migrationFolder, "20260820080352_absent_magik"), { recursive: true });
  h = await createPostgresTestHarness();
});
afterEach(async () => {
  const failures: unknown[] = [];
  for (const cleanup of [
    () => h?.close(),
    async () => {
      const expectedPrefix = `${resolve(tmpdir())}${sep}iam-client-delegation-migrations-`;
      if (!resolve(migrationFolder).startsWith(expectedPrefix)) throw new Error("Unexpected migrations fixture path");
      await rm(migrationFolder, { recursive: true });
    },
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Client Delegation migration fixture cleanup failed");
});

async function migratePrevious() {
  // A snapshot records migration history; missing SQL there is not an empty orphan.
  for (const entry of await readdir(migrationFolder, { withFileTypes: true })) {
    if (entry.isDirectory() && (await Bun.file(join(migrationFolder, entry.name, "snapshot.json")).exists()))
      await access(join(migrationFolder, entry.name, "migration.sql"));
  }
  const previous = readMigrationFiles({ migrationsFolder: migrationFolder }).filter((entry) => entry.name < target);
  for (const entry of previous) await h.sql.file(join(migrationFolder, entry.name, "migration.sql"), { cache: false });
}

test("a recorded snapshot with missing migration SQL fails instead of being silently omitted", async () => {
  const missingSql = join(migrationFolder, "20260511051432_gorgeous_pepper_potts", "migration.sql");
  await unlink(missingSql);
  let failure: unknown;
  try {
    await migratePrevious();
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ code: "ENOENT", path: missingSql });
});

test("the actual cutover removes old Delegations while retaining audit and other domain facts", async () => {
  await migratePrevious();
  await h.sql`insert into "user" (username, name) values ('alice','Alice'),('bob','Bob')`;
  await h.sql`insert into client (client_code,client_name,client_secret,ext_attributes) values ('one','One','retained-secret','{}')`;
  await h.sql`insert into organization (org_code,org_name,path,level,org_type) values ('ROOT','Root','ROOT',1,'company')`;
  await h.sql`insert into privilege (privilege_code,privilege_name) values ('read','Read')`;
  await h.sql`insert into privilege_delegation (delegator_user_id,delegatee_user_id,organization_scope_id,start_time,end_time) values (1,2,1,'2026-01-01','2027-01-01')`;
  await h.sql`insert into delegation_detail (delegation_id,privilege_id) values (1,1)`;
  await h.sql`insert into audit_log (action,outcome,actor_type,actor_client_code,target_type,target_id,source_app,details) values ('internal.delegation.create','success','client','one','delegation',1,'iam','{"retained":true}')`;
  const facts = async () => ({
    users: [...(await h.sql`select * from "user" order by id`)],
    clients: [...(await h.sql`select * from client order by id`)],
    organizations: [...(await h.sql`select * from organization order by id`)],
    privileges: [...(await h.sql`select * from privilege order by id`)],
    audits: [...(await h.sql`select * from audit_log order by id`)],
  });
  const before = await facts();
  await h.sql.begin(async (tx) => {
    await tx.file(join(migrationFolder, target, "migration.sql"), { cache: false });
  });
  const after = await facts();
  expect(after).toEqual(before);
  const inventory =
    await h.sql`select to_regclass(current_schema() || '.privilege_delegation') as old, to_regclass(current_schema() || '.delegation_detail') as detail`;
  expect(inventory[0]).toEqual({ old: null, detail: null });
  const rows = await h.sql`select * from client_delegation`;
  expect([...rows]).toEqual([]);
  await h.sql`insert into client_delegation (delegator_user_id,delegatee_user_id,client_id,organization_scope_id,start_time,end_time) values (1,2,1,1,'2026-01-01','2027-01-01')`;
  const created = await h.sql`select client_id,status from client_delegation`;
  expect([...created]).toEqual([{ client_id: 1, status: 1 }]);
});

test("formal migrations create the empty Client model and repeat without resetting it", async () => {
  const db = drizzle({ client: h.sql });
  const options = { migrationsFolder: migrationFolder, migrationsSchema: h.schemaName };
  await migrate(db, options);
  await h.sql`insert into client_delegation (delegator_user_id,delegatee_user_id,client_id,organization_scope_id,start_time,end_time) values (1,2,1,1,'2026-01-01','2027-01-01')`;
  const before = await h.sql`select * from client_delegation`;
  await migrate(db, options);
  const after = await h.sql`select * from client_delegation`;
  expect([...after]).toEqual([...before]);
});
