import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { UserStatus } from "@iam/contracts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
// Last migration in fixed Spec #283 baseline 95dc4871c62e36b63b26a3f71c5670ae449c79e2.
const baselineEnd = "20261021120501_retire_privilege";
let harness: PostgresTestHarness;
let baselineDirectory: string;
beforeEach(async () => {
  harness = await createPostgresTestHarness();
  baselineDirectory = await mkdtemp(join(tmpdir(), "iam-document-chain-"));
});
afterEach(async () => {
  await harness?.close();
  if (baselineDirectory) await rm(baselineDirectory, { recursive: true });
});

async function migrateCurrent() {
  await migrate(drizzle({ client: harness.sql }), {
    migrationsFolder: fileURLToPath(migrations),
    migrationsSchema: harness.schemaName,
  });
}

async function expectSingleGenerationStorage() {
  const tables = await harness.sql`SELECT table_name FROM information_schema.tables
    WHERE table_schema=current_schema() AND table_name IN
    ('user_profile','user_profile_dirty','organization_search_document','organization_search_dirty','organization_search_change',
    'user_document','user_document_outbox','user_document_rebuild_state','organization_document','organization_document_outbox','organization_document_rebuild_state')
    ORDER BY table_name`;
  const columns = await harness.sql`SELECT column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='user_document' ORDER BY ordinal_position`;
  expect(tables.map((row) => row.table_name)).toEqual([
    "organization_document",
    "organization_document_outbox",
    "organization_document_rebuild_state",
    "user_document",
    "user_document_outbox",
    "user_document_rebuild_state",
  ]);
  expect(columns.map((row) => row.column_name)).toEqual([
    "user_id",
    "subject_identifier",
    "schema_version",
    "source_version",
    "published_at",
    "document",
    "create_time",
    "update_time",
  ]);
}

test("the complete formal chain initializes one document generation from an empty database and is repeatable", async () => {
  await migrateCurrent();
  await expectSingleGenerationStorage();
  const journal = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await migrateCurrent();
  const repeated = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect(journal.length).toBeGreaterThan(0);
  expect([...repeated]).toEqual([...journal]);
});

test("the fixed 95dc4871 inventory upgrades through the complete chain without changing sources, credentials or earlier receipts", async () => {
  for (const entry of await readdir(migrations, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name <= baselineEnd)
      await cp(new URL(entry.name, migrations), join(baselineDirectory, entry.name), { recursive: true });
  }
  await migrate(drizzle({ client: harness.sql }), {
    migrationsFolder: baselineDirectory,
    migrationsSchema: harness.schemaName,
  });
  await harness.sql`INSERT INTO "user"(id,subject_identifier,username,name,password,status,is_delete)
    VALUES(1,'10000000-0000-4000-8000-000000000001','enabled','Enabled','credential-unchanged',${UserStatus.Enable},FALSE),
    (2,'10000000-0000-4000-8000-000000000002','paused','Paused','credential-unchanged',${UserStatus.Pause},FALSE),
    (3,'10000000-0000-4000-8000-000000000003','disabled','Disabled','credential-unchanged',${UserStatus.Disable},FALSE),
    (4,'10000000-0000-4000-8000-000000000004','deleted','Deleted','credential-unchanged',${UserStatus.Disable},TRUE)`;
  await harness.sql`INSERT INTO user_profile(user_id,subject_identifier,username,name,status,profile_schema_version,source_dirty_version,detail,search_doc,subject_facts)
    SELECT id,subject_identifier,username,name,status,4,7,'{}','{}','{}' FROM "user"`;
  await harness.sql`INSERT INTO user_profile_dirty(user_id,dirty_version,status,processed_at)
    SELECT id,7,'processed','2026-10-25' FROM "user"`;
  await harness.sql`INSERT INTO organization(id,org_code,org_name,path,level,org_type) VALUES(1,'ROOT','Root','/1',1,'部门')`;
  await harness.sql`INSERT INTO organization_search_dirty(organization_id,version,status,processed_at) VALUES(1,9,'processed','2026-10-25')`;
  await harness.sql`INSERT INTO organization_search_change(id,organization_id,scope,status,processed_at,rebuild_requests)
    VALUES('10000000-0000-4000-8000-000000000005',1,'self','processed','2026-10-25','[{"organizationId":1,"version":"9"}]')`;
  const users = await harness.sql`SELECT * FROM "user" ORDER BY id`;
  const organizations = await harness.sql`SELECT * FROM organization ORDER BY id`;
  const journal = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  await migrateCurrent();
  await expectSingleGenerationStorage();
  const usersAfter = await harness.sql`SELECT * FROM "user" ORDER BY id`;
  const organizationsAfter = await harness.sql`SELECT * FROM organization ORDER BY id`;
  const journalAfter = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  const states =
    await harness.sql`SELECT user_id,version,status,post_publication_version,post_publication_status FROM user_document_rebuild_state ORDER BY user_id`;
  const organizationState =
    await harness.sql`SELECT organization_id,version,status FROM organization_document_rebuild_state`;
  const receipt = await harness.sql`SELECT rebuild_requests,status FROM organization_document_outbox`;
  const documents = await harness.sql`SELECT * FROM user_document`;
  expect([...usersAfter]).toEqual([...users]);
  expect([...organizationsAfter]).toEqual([...organizations]);
  expect([...journalAfter].slice(0, journal.length)).toEqual([...journal]);
  expect(journalAfter.length).toBe(journal.length + 4);
  expect([...states]).toEqual(
    [1, 2, 3, 4].map((userId) => ({
      user_id: userId,
      version: "7",
      status: "processed",
      post_publication_version: "7",
      post_publication_status: "pending",
    })),
  );
  expect([...organizationState]).toEqual([{ organization_id: 1, version: "9", status: "processed" }]);
  expect([...receipt]).toEqual([{ rebuild_requests: [{ targetId: 1, version: "9" }], status: "processed" }]);
  // Migration deliberately retires old derived blobs; every user still requires a full rebuild before opening traffic.
  expect([...documents]).toEqual([]);
  await migrateCurrent();
  const repeated = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect([...repeated]).toEqual([...journalAfter]);
});
