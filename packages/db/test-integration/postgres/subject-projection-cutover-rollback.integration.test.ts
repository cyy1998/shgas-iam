import type { PostgresTestHarness } from "./postgres-harness";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  rollbackSubjectProjectionCutover,
  SUBJECT_PROJECTION_CUTOVER_MIGRATION,
} from "../../scripts/rollback-subject-projection-cutover";
import { relations } from "../../src/relations";
import { createPostgresTestHarness } from "./postgres-harness";

const migrationsFolder = fileURLToPath(new URL("../../src/migrations", import.meta.url));

interface JournalRow {
  id: number;
  hash: string;
  createdAt: string;
  name: string | null;
}

describe("Subject Projection cutover migration rollback journal", () => {
  test("replays the exact migration after an idempotent rollback without changing other journal rows", async () => {
    await withMigratedHarness(async (harness, migrationsFolder) => {
      const before = await readJournal(harness);
      const targetBefore = requireTargetMigration(before);
      const otherBefore = before.filter(row => row.id !== targetBefore.id);

      const first = await rollbackSubjectProjectionCutover({
        sql: harness.sql,
        migrationsFolder,
        migrationsSchema: harness.schemaName,
      });
      const second = await rollbackSubjectProjectionCutover({
        sql: harness.sql,
        migrationsFolder,
        migrationsSchema: harness.schemaName,
      });
      expect(first.status).toBe("rolled-back");
      expect(second.status).toBe("already-rolled-back");
      expect(await indexExists(harness)).toBe(false);
      expect(await subjectIdentifierNullable(harness)).toBe("YES");

      const rolledBackJournal = await readJournal(harness);
      expect(rolledBackJournal).toEqual(otherBefore);

      await runMigrations(harness, migrationsFolder);
      expect(await indexExists(harness)).toBe(true);
      expect(await subjectIdentifierNullable(harness)).toBe("NO");
      const replayedJournal = await readJournal(harness);
      const replayedTarget = requireTargetMigration(replayedJournal);
      const localTarget = readMigrationFiles({ migrationsFolder }).find(
        migration => migration.name === SUBJECT_PROJECTION_CUTOVER_MIGRATION,
      );
      expect(localTarget).toBeDefined();
      expect(replayedTarget).toMatchObject({
        hash: localTarget!.hash,
        createdAt: String(localTarget!.folderMillis),
        name: SUBJECT_PROJECTION_CUTOVER_MIGRATION,
      });
      expect(replayedJournal.filter(row => row.id !== replayedTarget.id)).toEqual(otherBefore);
    });
  });

  test("refuses a same-name journal row with a different migration identity", async () => {
    await withMigratedHarness(async (harness, migrationsFolder) => {
      await harness.sql.unsafe(`UPDATE ${journalTable(harness)} SET hash = $1 WHERE name = $2`, [
        "unexpected-hash",
        SUBJECT_PROJECTION_CUTOVER_MIGRATION,
      ]);

      let caught: unknown;
      try {
        await rollbackSubjectProjectionCutover({
          sql: harness.sql,
          migrationsFolder,
          migrationsSchema: harness.schemaName,
        });
      }
      catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain("journal identity mismatch");
      expect(await indexExists(harness)).toBe(true);
      expect(requireTargetMigration(await readJournal(harness)).hash).toBe("unexpected-hash");
    });
  });

  test("refuses the final contracted schema before changing Profile or journal", async () => {
    await withMigratedHarness(async (harness) => {
      const before = await readJournal(harness);
      let caught: unknown;
      try {
        await rollbackSubjectProjectionCutover({
          sql: harness.sql,
          migrationsFolder,
          migrationsSchema: harness.schemaName,
        });
      }
      catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught instanceof Error && caught.message).toContain("pre-contraction schema");
      const after = await readJournal(harness);
      expect(after).toEqual(before);
      const exists = await indexExists(harness);
      const nullable = await subjectIdentifierNullable(harness);
      expect(exists).toBe(true);
      expect(nullable).toBe("NO");
    }, false);
  });
});

async function withMigratedHarness(
  run: (harness: PostgresTestHarness, folder: string) => Promise<void>,
  sourceSchema = true,
) {
  const harness = await createPostgresTestHarness();
  let sourceFolder: string | undefined;
  try {
    if (sourceSchema)
      sourceFolder = await mkdtemp(join(tmpdir(), "iam194-projection-rollback-"));
    if (sourceFolder) {
      for (const entry of await readdir(migrationsFolder, { withFileTypes: true })) {
        if (entry.name < "20260914173743_confused_mystique")
          await cp(join(migrationsFolder, entry.name), join(sourceFolder, entry.name), { recursive: true });
      }
    }
    const folder = sourceFolder ?? migrationsFolder;
    await runMigrations(harness, folder);
    await run(harness, folder);
  }
  finally {
    await Promise.all([harness.close(), ...(sourceFolder ? [removeSourceFolder(sourceFolder)] : [])]);
  }
}

async function removeSourceFolder(folder: string) {
  if (
    dirname(resolve(folder)) !== resolve(tmpdir())
    || !basename(folder).startsWith("iam194-projection-rollback-")
  ) {
    throw new Error("Unexpected rollback migration fixture directory");
  }
  await rm(folder, { recursive: true });
}

async function runMigrations(harness: PostgresTestHarness, folder = migrationsFolder) {
  const db = drizzle({ client: harness.sql, relations });
  await migrate(db, {
    migrationsFolder: folder,
    migrationsSchema: harness.schemaName,
  });
}

async function readJournal(harness: PostgresTestHarness) {
  const rows = await harness.sql.unsafe<JournalRow[]>(`
    SELECT id, hash, created_at::text AS "createdAt", name
    FROM ${journalTable(harness)}
    ORDER BY id
  `);
  return [...rows];
}

function requireTargetMigration(rows: JournalRow[]) {
  const target = rows.find(row => row.name === SUBJECT_PROJECTION_CUTOVER_MIGRATION);
  if (!target)
    throw new Error("Subject Projection cutover journal row was not found");
  return target;
}

async function indexExists(harness: PostgresTestHarness) {
  const [row] = await harness.sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'user_profile_subject_identifier_idx'
    ) AS exists
  `;
  return row?.exists ?? false;
}

async function subjectIdentifierNullable(harness: PostgresTestHarness) {
  const [row] = await harness.sql<{ isNullable: string }[]>`
    SELECT is_nullable AS "isNullable"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'user_profile'
      AND column_name = 'subject_identifier'
  `;
  return row?.isNullable;
}

function journalTable(harness: PostgresTestHarness) {
  return `${quoteIdentifier(harness.schemaName)}."__drizzle_migrations"`;
}

function quoteIdentifier(identifier: string) {
  if (!/^[a-z0-9_]+$/u.test(identifier))
    throw new Error("test schema name contains unsafe characters");
  return `"${identifier}"`;
}
