import { afterEach, beforeEach, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrationFolder = new URL("../../src/migrations/", import.meta.url);
const target = "20261020090553_client_delegation";
let h: PostgresTestHarness;
beforeEach(async () => {
  h = await createPostgresTestHarness();
});
afterEach(async () => {
  await h?.close();
});

test("the actual cutover removes old Delegations while retaining audit and other domain facts", async () => {
  const previous = (await readdir(migrationFolder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name < target)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of previous)
    await h.sql.file(new URL(`${entry.name}/migration.sql`, migrationFolder), { cache: false });
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
    await tx.file(new URL(`${target}/migration.sql`, migrationFolder), { cache: false });
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
  const options = { migrationsFolder: fileURLToPath(migrationFolder), migrationsSchema: h.schemaName };
  await migrate(db, options);
  await h.sql`insert into client_delegation (delegator_user_id,delegatee_user_id,client_id,organization_scope_id,start_time,end_time) values (1,2,1,1,'2026-01-01','2027-01-01')`;
  const before = await h.sql`select * from client_delegation`;
  await migrate(db, options);
  const after = await h.sql`select * from client_delegation`;
  expect([...after]).toEqual([...before]);
});
