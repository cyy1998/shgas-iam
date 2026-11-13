import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EmploymentStatus } from "@iam/contracts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { extractPostgresError } from "../../src/postgres-error";
import {
  createPostgresTestHarness,
  expectPostgresErrorCode,
  type PostgresTestHarness,
} from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
const baselineEnd = "20261110135337_role_inclusion";
let harness: PostgresTestHarness;
let baselineDirectory: string | undefined;

beforeEach(async () => {
  baselineDirectory = undefined;
  harness = await createPostgresTestHarness();
});

afterEach(async () => {
  try {
    await harness?.close();
  } finally {
    if (baselineDirectory) await rm(baselineDirectory, { recursive: true });
  }
});

async function migrateFrom(folder = fileURLToPath(migrations)) {
  await migrate(drizzle({ client: harness.sql }), {
    migrationsFolder: folder,
    migrationsSchema: harness.schemaName,
  });
}

async function migrateBaseline(lastMigration = baselineEnd) {
  baselineDirectory = await mkdtemp(join(tmpdir(), "iam-employment-dates-"));
  for (const entry of await readdir(migrations, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name <= lastMigration)
      await cp(new URL(entry.name, migrations), join(baselineDirectory, entry.name), { recursive: true });
  }
  await migrateFrom(baselineDirectory);
}

function journal() {
  return harness.sql`SELECT id, name, hash FROM __drizzle_migrations ORDER BY id`;
}

function employmentDates() {
  return harness.sql`
    SELECT id, start_time::text, end_time::text, status, is_primary, is_delete
    FROM employment ORDER BY id
  `;
}

function employmentDateColumns() {
  return harness.sql`
    SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'employment'
      AND column_name IN ('start_time', 'end_time') ORDER BY column_name
  `;
}

test("the formal empty-database chain creates two nullable date columns without defaults and can run again", async () => {
  await migrateFrom();
  const columns = await employmentDateColumns();
  const before = await journal();
  await migrateFrom();
  const after = await journal();
  expect([...columns]).toEqual([
    { column_name: "end_time", data_type: "date", is_nullable: "YES", column_default: null },
    { column_name: "start_time", data_type: "date", is_nullable: "YES", column_default: null },
  ]);
  expect([...after]).toEqual([...before]);
});

test("the migrated schema rejects empty and reversed bounded periods while accepting independent null bounds", async () => {
  await migrateFrom();
  await harness.sql`
    INSERT INTO employment (user_id, dept_id, pos_id, start_time, end_time)
    VALUES (1, 2, 3, NULL, NULL), (2, 2, 3, '2026-11-13', NULL), (3, 2, 3, NULL, '2026-11-13')
  `;
  for (const end of ["2026-11-13", "2026-11-12"]) {
    await expectPostgresErrorCode(
      harness.sql`
        INSERT INTO employment (user_id, dept_id, pos_id, start_time, end_time)
        VALUES (4, 2, 3, '2026-11-13', ${end})
      `,
      "23514",
    );
  }
});

test.each(["America/Los_Angeles", "Pacific/Auckland"])(
  "the formal upgrade preserves Beijing dates, status, history and references with session timezone %s",
  async (zone) => {
    await migrateBaseline();
    await harness.sql`SELECT set_config('TimeZone', ${zone}, false)`;
    const { Enable, Pause, Disable } = EmploymentStatus;
    await harness.sql`
      INSERT INTO employment (id, user_id, dept_id, pos_id, start_time, end_time, status, is_primary, is_delete)
      VALUES
        (1, 101, 20, 30, '2026-11-13 01:00:00', '2026-11-13 09:00:00', ${Disable}, false, false),
        (2, 102, 20, 30, '2026-11-12 23:00:00', '2026-11-14 16:00:00', ${Pause}, true, false),
        (3, 103, 20, 30, '2026-11-12 16:00:00', '2026-11-12 16:00:00', ${Disable}, false, false),
        (4, 104, 20, 30, '2026-11-12 17:00:00', '2026-11-12 17:00:00', ${Disable}, false, false),
        (5, 105, 20, 30, '2026-11-13 16:00:00', NULL, ${Enable}, true, false),
        (6, 106, 20, 30, '2026-11-13 15:59:59', NULL, ${Enable}, false, true),
        (7, 107, 20, 30, '2026-11-12 17:00:00', '2026-11-14 16:00:00.001', ${Disable}, false, false)
    `;
    await harness.sql`
      INSERT INTO role_assignment (role_id, target_type, target_id, include_descendants)
      VALUES (41, 'employment', 1, false)
    `;
    const assignments = await harness.sql`SELECT * FROM role_assignment ORDER BY id`;
    const before = await journal();

    await migrateFrom();

    const converted = await employmentDates();
    const applied = await journal();
    const assignmentHistory = await harness.sql`SELECT * FROM role_assignment ORDER BY id`;
    expect([...converted]).toEqual([
      { id: 1, start_time: "2026-11-13", end_time: "2026-11-14", status: Disable, is_primary: false, is_delete: false },
      { id: 2, start_time: "2026-11-13", end_time: "2026-11-15", status: Pause, is_primary: true, is_delete: false },
      { id: 3, start_time: "2026-11-13", end_time: "2026-11-14", status: Disable, is_primary: false, is_delete: false },
      { id: 4, start_time: "2026-11-13", end_time: "2026-11-14", status: Disable, is_primary: false, is_delete: false },
      { id: 5, start_time: "2026-11-14", end_time: null, status: Enable, is_primary: true, is_delete: false },
      { id: 6, start_time: "2026-11-13", end_time: null, status: Enable, is_primary: false, is_delete: true },
      { id: 7, start_time: "2026-11-13", end_time: "2026-11-16", status: Disable, is_primary: false, is_delete: false },
    ]);
    expect([...assignmentHistory]).toEqual([...assignments]);
    expect([...applied].slice(0, before.length)).toEqual([...before]);
    expect(applied.length).toBeGreaterThan(before.length);

    await migrateFrom();
    const repeated = await employmentDates();
    const repeatedJournal = await journal();
    expect([...repeated]).toEqual([...converted]);
    expect([...repeatedJournal]).toEqual([...applied]);
  },
);

test("the open relationship upgrade reports legacy duplicates and preserves the old index and rows", async () => {
  await migrateBaseline("20261113043436_employment_dates");
  await harness.sql`
    INSERT INTO employment (id, user_id, dept_id, pos_id, start_time, status)
    VALUES
      (41, 10, 20, 30, NULL, ${EmploymentStatus.Enable}),
      (42, 10, 20, 30, NULL, ${EmploymentStatus.Pause}),
      (43, 11, 20, 30, NULL, ${EmploymentStatus.Pause}),
      (44, 11, 20, 30, NULL, ${EmploymentStatus.Pause})
  `;
  const before = await employmentDates();
  const beforeJournal = await journal();
  let failure: unknown;
  try {
    await migrateFrom();
  } catch (error) {
    failure = error;
  }
  expect(extractPostgresError(failure)?.code).toBe("23505");
  expect(failure).toMatchObject({ cause: { message: expect.stringContaining("41, 42; 43, 44") } });
  const after = await employmentDates();
  const afterJournal = await journal();
  expect([...after]).toEqual([...before]);
  expect([...afterJournal]).toEqual([...beforeJournal]);
  const index = await harness.sql`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname = 'employment_active_relationship_unique_idx'
  `;
  expect(index[0]?.indexdef).toContain("(status = 1)");
});

test("the upgrade reports a reversed legacy period before changing timestamps or the migration journal", async () => {
  await migrateBaseline();
  await harness.sql`
    INSERT INTO employment (id, user_id, dept_id, pos_id, start_time, end_time)
    VALUES (42, 1, 2, 3, '2026-11-13 09:01:00', '2026-11-13 09:00:00')
  `;
  const before = await employmentDates();
  const beforeJournal = await journal();
  let failure: unknown;
  try {
    await migrateFrom();
  } catch (error) {
    failure = error;
  }
  const columns = await employmentDateColumns();
  const after = await employmentDates();
  const afterJournal = await journal();
  expect(extractPostgresError(failure)?.code).toBe("23514");
  expect(failure).toMatchObject({ cause: { message: expect.stringContaining("42") } });
  expect(columns.map((row) => row.data_type)).toEqual(["timestamp without time zone", "timestamp without time zone"]);
  expect([...after]).toEqual([...before]);
  expect([...afterJournal]).toEqual([...beforeJournal]);
});
