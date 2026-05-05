import mysql from "mysql2/promise";
import db, { closeDb } from "../src/db";
import { sql } from "drizzle-orm";

const sourceUrl = process.env.MYSQL_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;
const batchSize = 500;

if (!sourceUrl) {
  throw new Error("MYSQL_DATABASE_URL is required");
}

if (!targetUrl) {
  throw new Error("DATABASE_URL is required");
}

const source = await mysql.createConnection(sourceUrl);

const tableOrder = [
  "user",
  "organization",
  "organization_closure",
  "position",
  "client",
  "role",
  "privilege",
  "login_log",
  "pos_org_composition",
  "employment",
  "position_role",
  "employment_role",
  "organization_role",
  "position_organization_role",
  "role_privilege",
  "privilege_delegation",
  "delegation_detail",
] as const;

const sequenceTables = [
  "user",
  "organization",
  "organization_closure",
  "position",
  "client",
  "role",
  "privilege",
  "login_log",
  "pos_org_composition",
  "employment",
  "privilege_delegation",
] as const;

const booleanColumns = new Set([
  "is_delete",
  "is_primary",
  "is_virtual",
  "is_entity",
  "is_all_sub",
]);

function normalizeRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (booleanColumns.has(key)) {
        return [key, Boolean(value)];
      }
      return [key, value];
    }),
  );
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function copyTable(tableName: string) {
  const [rows] = await source.query(`SELECT * FROM \`${tableName}\``);
  const data = (rows as Record<string, unknown>[]).map(normalizeRow);

  if (data.length === 0) {
    console.log(`[skip] ${tableName}: 0 rows`);
    return;
  }

  const firstRow = data[0]!;
  const columns = Object.keys(firstRow);
  const columnSql = sql.join(columns.map(column => sql.identifier(column)), sql`, `);

  for (const batch of chunkRows(data, batchSize)) {
    await db.transaction(async (tx) => {
      for (const row of batch) {
        const values = columns.map(column => row[column]);
        const valueSql = sql.join(values.map(value => sql`${value}`), sql`, `);
        await tx.execute(sql`
          INSERT INTO ${sql.identifier(tableName)} (${columnSql})
          VALUES (${valueSql})
          ON CONFLICT DO NOTHING
        `);
      }
    });
  }

  console.log(`[done] ${tableName}: ${data.length} rows`);
}

async function resetSequence(tableName: string) {
  await db.execute(sql`
    SELECT setval(
      pg_get_serial_sequence(${"\"" + tableName + "\""}, 'id'),
      COALESCE((SELECT MAX(id) FROM ${sql.identifier(tableName)}), 1),
      (SELECT COUNT(*) > 0 FROM ${sql.identifier(tableName)})
    )
  `);
}

try {
  for (const tableName of tableOrder) {
    await copyTable(tableName);
  }

  for (const tableName of sequenceTables) {
    await resetSequence(tableName);
  }
}
finally {
  await source.end();
  await closeDb();
}
