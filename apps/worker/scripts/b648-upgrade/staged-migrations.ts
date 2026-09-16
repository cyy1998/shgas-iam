import type postgres from "postgres";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

export const B648_SOURCE = "20260823091908_remove_subject_claim_catalog_version";
export const CLIENT_SSO_EXPANSION = "20260914061007_romantic_maestro";
export const CLIENT_SSO_CONTRACTION = "20260914173743_confused_mystique";
export const CLIENT_CALLBACK_TYPE = "20260916050609_explicit_callback_type";
export const MANAGED_CALLBACK_ORIGIN = "20260916081103_managed_callback_origin";
export const migrationsDirectory = new URL("../../../../packages/db/src/migrations/", import.meta.url);
const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(migrationsDirectory) });

export function migrationJournal(schema: string) {
  if (!/^[a-z0-9_]+$/u.test(schema))
    throw new Error("Invalid migrations schema");
  return `"${schema}"."__drizzle_migrations"`;
}

/** Check migration order, names and timestamps, including entries beyond the requested phase. */
export async function inspectMigrationPrefix(tx: postgres.TransactionSql, schema: string, through?: string) {
  const journal = await tx.unsafe<{ name: string; created_at: string }[]>(
    `SELECT name, created_at::text FROM ${migrationJournal(schema)} ORDER BY created_at`,
  );
  for (const [index, row] of journal.entries()) {
    const expected = migrations[index];
    if (!expected || row.name !== expected.name || row.created_at !== String(expected.folderMillis))
      throw new Error("Migration journal drift");
  }
  const last = journal.at(-1)?.name;
  if (through !== undefined && last !== through)
    throw new Error("Unexpected migration stage");
  return last;
}

/** Executes the original SQL and records its original Drizzle identity in the same transaction. */
export async function migrateThrough(
  sql: postgres.Sql,
  options: {
    through?: string;
    migrationsSchema?: string;
    beforeMigrations?: (tx: postgres.TransactionSql, current: string | undefined) => Promise<void>;
    verifyContraction?: (tx: postgres.TransactionSql) => Promise<void>;
  } = {},
) {
  const schema = options.migrationsSchema ?? "drizzle";
  const table = migrationJournal(schema);
  const through = options.through ?? migrations.at(-1)!.name;
  if (!migrations.some(migration => migration.name === through))
    throw new Error("Unknown migration cutoff");
  return await sql.begin(async (tx) => {
    await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await tx.unsafe(`CREATE TABLE IF NOT EXISTS ${table} (
      id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint, name text,
      applied_at timestamp with time zone DEFAULT now())`);
    await tx.unsafe(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`);
    const current = await inspectMigrationPrefix(tx, schema);
    if (current && current > through)
      throw new Error("Database is beyond requested cutoff");
    await options.beforeMigrations?.(tx, current);
    const pending = migrations.filter(migration => (!current || migration.name > current) && migration.name <= through);
    for (const migration of pending) {
      if (migration.name === CLIENT_SSO_CONTRACTION) {
        await tx`LOCK TABLE client, role IN SHARE ROW EXCLUSIVE MODE`;
        const rows = await tx`SELECT id FROM client LIMIT 1`;
        if (rows.length && !options.verifyContraction)
          throw new Error("Use the offline b648 contraction command with independent verification");
        await options.verifyContraction?.(tx);
      }
      for (const statement of migration.sql)
        await tx.unsafe(statement);
      await tx.unsafe(`INSERT INTO ${table} (hash, created_at, name) VALUES ($1, $2, $3)`, [migration.hash, migration.folderMillis, migration.name]);
    }
    return { through, applied: pending.map(migration => migration.name) };
  });
}
