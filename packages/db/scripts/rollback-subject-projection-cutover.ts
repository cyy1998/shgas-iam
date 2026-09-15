import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

export const SUBJECT_PROJECTION_CUTOVER_MIGRATION
  = "20260801144944_sturdy_landau";

export interface RollbackSubjectProjectionCutoverInput {
  sql: ReturnType<typeof postgres>;
  migrationsFolder: string;
  migrationsSchema?: string;
  migrationsTable?: string;
}

export async function rollbackSubjectProjectionCutover(
  input: RollbackSubjectProjectionCutoverInput,
) {
  const migrationsSchema = quoteIdentifier(
    input.migrationsSchema ?? "drizzle",
  );
  const migrationsTable = quoteIdentifier(
    input.migrationsTable ?? "__drizzle_migrations",
  );
  const journalTable = `${migrationsSchema}.${migrationsTable}`;
  const migration = readMigrationFiles({
    migrationsFolder: input.migrationsFolder,
  }).find(candidate => candidate.name === SUBJECT_PROJECTION_CUTOVER_MIGRATION);
  if (!migration) {
    throw new Error(
      `Subject Projection migration is missing: ${SUBJECT_PROJECTION_CUTOVER_MIGRATION}`,
    );
  }
  const rollbackFile = join(
    input.migrationsFolder,
    SUBJECT_PROJECTION_CUTOVER_MIGRATION,
    "rollback.sql",
  );
  const rollbackSql = await Bun.file(rollbackFile).text();

  return await input.sql.begin(async (tx) => {
    await tx.unsafe(`LOCK TABLE ${journalTable} IN SHARE ROW EXCLUSIVE MODE`);
    const [sourceSchema] = await tx<{ supported: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'client' AND column_name = 'custom_sso_config'
      ) AS supported
    `;
    if (!sourceSchema?.supported)
      throw new Error("Subject Projection rollback requires the pre-contraction schema and matching backup");
    const rows = await tx.unsafe<MigrationJournalRow[]>(`
      SELECT id, hash, created_at::text AS "createdAt", name
      FROM ${journalTable}
      WHERE name = $1
      FOR UPDATE
    `, [migration.name]);
    const row = rows[0];
    if (
      rows.length > 1
      || (
        row !== undefined
        && (
          row.hash !== migration.hash
          || row.createdAt !== String(migration.folderMillis)
          || row.name !== migration.name
        )
      )
    ) {
      throw new Error(
        `Subject Projection migration journal identity mismatch: ${migration.name}`,
      );
    }

    await tx.unsafe(rollbackSql);
    if (row === undefined) {
      return {
        migrationName: migration.name,
        status: "already-rolled-back" as const,
      };
    }

    const deleted = await tx.unsafe<Array<{ id: number }>>(`
      DELETE FROM ${journalTable}
      WHERE id = $1
        AND name = $2
        AND hash = $3
        AND created_at = $4
      RETURNING id
    `, [row.id, migration.name, migration.hash, migration.folderMillis]);
    if (deleted.length !== 1) {
      throw new Error(
        `Subject Projection migration journal compensation failed: ${migration.name}`,
      );
    }

    return {
      migrationName: migration.name,
      status: "rolled-back" as const,
    };
  });
}

interface MigrationJournalRow {
  id: number;
  hash: string;
  createdAt: string | null;
  name: string | null;
}

function quoteIdentifier(identifier: string) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier))
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  return `"${identifier}"`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const result = await rollbackSubjectProjectionCutover({
      sql,
      migrationsFolder: fileURLToPath(
        new URL("../src/migrations", import.meta.url),
      ),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
  finally {
    await sql.end();
  }
}

if (import.meta.main) {
  void main().catch((error) => {
    process.stderr.write(
      `Subject Projection migration rollback failed: ${
        error instanceof Error ? error.message : "unknown error"
      }\n`,
    );
    process.exitCode = 1;
  });
}
