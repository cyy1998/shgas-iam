import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OrganizationResponsibilityAssignmentStatus, OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
const baselineEnd = "20261026100403_user_document_storage";
let harness: PostgresTestHarness;
let baselineDirectory: string | undefined;

beforeEach(async () => {
  harness = await createPostgresTestHarness();
});

afterEach(async () => {
  await harness?.close();
  if (baselineDirectory) await rm(baselineDirectory, { recursive: true });
  baselineDirectory = undefined;
});

async function migrateCurrent() {
  await migrate(drizzle({ client: harness.sql }), {
    migrationsFolder: fileURLToPath(migrations),
    migrationsSchema: harness.schemaName,
  });
}

async function expectTargetIndex() {
  const indexes = await harness.sql`
    SELECT index_record.indisunique AS is_unique, index_record.indisvalid AS is_valid,
      index_record.indpred IS NULL AS is_full, access_method.amname AS method,
      index_record.indnatts AS column_count, attribute.attname AS column_name
    FROM pg_index AS index_record
    JOIN pg_class AS index_relation ON index_relation.oid = index_record.indexrelid
    JOIN pg_namespace AS namespace ON namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = index_record.indrelid AND attribute.attnum = index_record.indkey[0]
    WHERE namespace.nspname = current_schema()
      AND index_relation.relname = 'org_resp_assignment_target_organization_id_idx'
  `;
  expect([...indexes]).toEqual([
    {
      is_unique: false,
      is_valid: true,
      is_full: true,
      method: "btree",
      column_count: 1,
      column_name: "target_organization_id",
    },
  ]);
}

test("the formal chain creates a full nonunique target index in an empty database", async () => {
  await migrateCurrent();
  await expectTargetIndex();
});

test("the target index migration preserves all assignment lifecycles and earlier receipts on upgrade and repeat", async () => {
  baselineDirectory = await mkdtemp(join(tmpdir(), "iam-responsibility-target-index-"));
  for (const entry of await readdir(migrations, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name <= baselineEnd)
      await cp(new URL(entry.name, migrations), join(baselineDirectory, entry.name), { recursive: true });
  }
  await migrate(drizzle({ client: harness.sql }), {
    migrationsFolder: baselineDirectory,
    migrationsSchema: harness.schemaName,
  });
  await harness.sql`
    INSERT INTO organization_responsibility_assignment
      (employment_id, type_code, target_organization_id, status, start_time, end_time)
    VALUES
      (100, ${OrganizationResponsibilityTypeCode.Head}, 20,
        ${OrganizationResponsibilityAssignmentStatus.Enable}, '2026-08-01', NULL),
      (101, ${OrganizationResponsibilityTypeCode.Supervising}, 20,
        ${OrganizationResponsibilityAssignmentStatus.Pause}, '2026-08-01', NULL),
      (102, ${OrganizationResponsibilityTypeCode.Head}, 20,
        ${OrganizationResponsibilityAssignmentStatus.Disable}, '2026-07-01', '2026-07-31')
  `;
  const assignments = await harness.sql`SELECT * FROM organization_responsibility_assignment ORDER BY id`;
  const journal = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;

  await migrateCurrent();
  await expectTargetIndex();
  const assignmentsAfter = await harness.sql`SELECT * FROM organization_responsibility_assignment ORDER BY id`;
  const journalAfter = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect([...assignmentsAfter]).toEqual([...assignments]);
  expect([...journalAfter].slice(0, journal.length)).toEqual([...journal]);
  expect(journalAfter.length).toBe(journal.length + 1);

  await migrateCurrent();
  await expectTargetIndex();
  const assignmentsRepeated = await harness.sql`SELECT * FROM organization_responsibility_assignment ORDER BY id`;
  const journalRepeated = await harness.sql`SELECT * FROM __drizzle_migrations ORDER BY id`;
  expect([...assignmentsRepeated]).toEqual([...assignments]);
  expect([...journalRepeated]).toEqual([...journalAfter]);
});
