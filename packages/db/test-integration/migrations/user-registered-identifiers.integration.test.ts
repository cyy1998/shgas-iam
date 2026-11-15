import { afterEach, beforeEach, expect, test } from "bun:test";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { UserStatus } from "@iam/contracts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { extractPostgresError } from "../../src/postgres-error";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

const migrations = new URL("../../src/migrations/", import.meta.url);
const baselineEnd = "20261113091724_client_admission";
let harness: PostgresTestHarness;
let baselineDirectory: string | undefined;

function migrateFrom(folder = fileURLToPath(migrations)) {
  return migrate(drizzle({ client: harness.sql }), {
    migrationsFolder: folder,
    migrationsSchema: harness.schemaName,
  });
}

beforeEach(async () => {
  baselineDirectory = undefined;
  harness = await createPostgresTestHarness();
  baselineDirectory = await mkdtemp(join(tmpdir(), "iam-user-identifiers-"));
  for (const entry of await readdir(migrations, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name <= baselineEnd) {
      await cp(new URL(entry.name, migrations), join(baselineDirectory, entry.name), { recursive: true });
    }
  }
  await migrateFrom(baselineDirectory);
});

afterEach(async () => {
  try {
    await harness?.close();
  } finally {
    if (baselineDirectory) await rm(baselineDirectory, { recursive: true });
  }
});

function registeredValues() {
  return harness.sql`
    SELECT username, mobile_phone AS mobile, "wxId", is_delete FROM "user" ORDER BY id
  `;
}

function pendingUserChanges() {
  return harness.sql`SELECT source FROM user_document_outbox ORDER BY source->'change'->>'userId'`;
}

test("the upgrade normalizes current users, records durable publication work, and preserves tombstones", async () => {
  const mobile = "\t12345678\u00a0";
  const wxId = "\u3000Member-A\ufeff";
  await harness.sql`
    INSERT INTO "user" (id, username, "name", mobile_phone, "wxId", status, is_delete)
    VALUES
      (1, 'owner', 'Owner', ${mobile}, ${wxId}, ${UserStatus.Disable}, false),
      (2, 'blank', 'Blank', ${"\t"}, ${" \u3000"}, ${UserStatus.Enable}, false),
      (3, 'missing', 'Missing', NULL, NULL, ${UserStatus.Enable}, false),
      (4, 'deleted', 'Deleted', ${mobile}, ${wxId}, ${UserStatus.Disable}, true),
      (5, 'case', 'Case', NULL, 'member-a', ${UserStatus.Enable}, false)
  `;

  await migrateFrom();

  expect([...(await registeredValues())]).toEqual([
    { username: "owner", mobile: "12345678", wxId: "Member-A", is_delete: false },
    { username: "blank", mobile: null, wxId: null, is_delete: false },
    { username: "missing", mobile: null, wxId: null, is_delete: false },
    { username: "deleted", mobile, wxId, is_delete: true },
    { username: "case", mobile: null, wxId: "member-a", is_delete: false },
  ]);
  expect([...(await pendingUserChanges())]).toEqual([
    { source: { change: { kind: "user", userId: 1 } } },
    { source: { change: { kind: "user", userId: 2 } } },
  ]);
});

test.each([
  [" 12345678 ", "12345678", " A ", "B", "user_mobile_phone_non_deleted_idx"],
  [" 12345678 ", "12345679", " A ", "A", "user_wx_id_non_deleted_idx"],
])(
  "a normalized conflict (%s, %s, %s, %s) rolls back the whole migration",
  async (firstMobile, secondMobile, firstWxId, secondWxId, constraint) => {
    await harness.sql`
    INSERT INTO "user" (id, username, "name", mobile_phone, "wxId", status)
    VALUES
      (1, 'owner', 'Owner', ${firstMobile}, ${firstWxId}, ${UserStatus.Disable}),
      (2, 'candidate', 'Candidate', ${secondMobile}, ${secondWxId}, ${UserStatus.Enable})
  `;
    const originalValues = [...(await registeredValues())];
    const originalJournal = [...(await harness.sql`SELECT id, name, hash FROM __drizzle_migrations ORDER BY id`)];

    const failure = await migrateFrom().catch((error: unknown) => error);

    expect(extractPostgresError(failure)).toEqual({ code: "23505", constraint });
    expect([...(await registeredValues())]).toEqual(originalValues);
    expect([...(await pendingUserChanges())]).toEqual([]);
    expect([...(await harness.sql`SELECT id, name, hash FROM __drizzle_migrations ORDER BY id`)]).toEqual(
      originalJournal,
    );
    const indexes = await harness.sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname IN ('user_mobile_phone_non_deleted_idx', 'user_wx_id_non_deleted_idx')
  `;
    expect([...indexes]).toEqual([]);
  },
);
