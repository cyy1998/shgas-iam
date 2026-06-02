import type { SQL } from "drizzle-orm";
import type { LegacyLoginLog } from "./login-log-audit-migration";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../src";
import { auditLogs, loginLogs } from "../src/schema";
import {
  mapLoginLogToAuditLog,
  parseLoginLogAuditMigrationArgs,
} from "./login-log-audit-migration";

type QueryRow = Record<string, unknown>;

const migratedCondition = sql`
  a.details->>'migrationSource' = 'login_log'
  AND a.details->>'legacyLoginLogId' = l.id::text
`;

function rowsFromResult(result: unknown): QueryRow[] {
  if (Array.isArray(result))
    return result as QueryRow[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: QueryRow[] }).rows;
  }
  return [];
}

function readCount(result: unknown) {
  const [row] = rowsFromResult(result);
  return Number(row?.count ?? 0);
}

async function countSql(query: SQL) {
  return readCount(await db.execute(query));
}

async function countLegacyLoginLogs() {
  return countSql(sql`SELECT COUNT(*)::int AS count FROM ${loginLogs}`);
}

async function countMigratedAuditLogs() {
  return countSql(sql`
    SELECT COUNT(*)::int AS count
    FROM ${auditLogs}
    WHERE details->>'migrationSource' = 'login_log'
  `);
}

async function countPendingLoginLogs() {
  return countSql(sql`
    SELECT COUNT(*)::int AS count
    FROM ${loginLogs} l
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${auditLogs} a
      WHERE ${migratedCondition}
    )
  `);
}

function normalizeLegacyRow(row: QueryRow): LegacyLoginLog {
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    username: String(row.username),
    name: String(row.name),
    clientCode: String(row.clientCode),
    loginType: String(row.loginType),
    loginTime: row.loginTime instanceof Date
      ? row.loginTime
      : new Date(String(row.loginTime)),
  };
}

async function fetchPendingLoginLogs(limit: number) {
  const result = await db.execute(sql`
    SELECT
      l.id,
      l.user_id AS "userId",
      l.username,
      l.name,
      l.client_code AS "clientCode",
      l.login_type AS "loginType",
      l.login_time AS "loginTime"
    FROM ${loginLogs} l
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${auditLogs} a
      WHERE ${migratedCondition}
    )
    ORDER BY l.id
    LIMIT ${limit}
  `);

  return rowsFromResult(result).map(normalizeLegacyRow);
}

async function printPlan(sampleSize: number) {
  const [legacyTotal, pending, migratedRecords] = await Promise.all([
    countLegacyLoginLogs(),
    countPendingLoginLogs(),
    countMigratedAuditLogs(),
  ]);
  const samples = await fetchPendingLoginLogs(sampleSize);

  console.log(`[plan] legacy login_log total: ${legacyTotal}`);
  console.log(`[plan] already migrated legacy rows: ${legacyTotal - pending}`);
  console.log(`[plan] audit_log records from login_log: ${migratedRecords}`);
  console.log(`[plan] pending legacy rows: ${pending}`);
  console.log("[plan] sample mappings:");
  for (const sample of samples) {
    console.log(JSON.stringify(mapLoginLogToAuditLog(sample), null, 2));
  }

  return { legacyTotal, pending, migratedRecords };
}

async function executeMigration(batchSize: number) {
  let inserted = 0;

  while (true) {
    const batch = await fetchPendingLoginLogs(batchSize);
    if (batch.length === 0)
      break;

    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values(batch.map(mapLoginLogToAuditLog));
    });
    inserted += batch.length;
    console.log(`[execute] inserted ${inserted} audit rows`);
  }

  return inserted;
}

try {
  const options = parseLoginLogAuditMigrationArgs(Bun.argv.slice(2));
  console.log(
    `[start] mode=${options.dryRun ? "dry-run" : "execute"} batchSize=${options.batchSize} sampleSize=${options.sampleSize}`,
  );

  const before = await printPlan(options.sampleSize);
  if (options.dryRun) {
    console.log("[done] dry-run complete; no database rows were written");
  }
  else {
    const inserted = await executeMigration(options.batchSize);
    const pendingAfter = await countPendingLoginLogs();
    const migratedAfter = await countMigratedAuditLogs();

    if (pendingAfter !== 0) {
      throw new Error(`migration finished with ${pendingAfter} pending login_log rows`);
    }
    if (migratedAfter < before.migratedRecords + inserted) {
      throw new Error("migration count verification failed");
    }

    console.log(`[done] inserted=${inserted} pendingAfter=${pendingAfter} migratedAuditRows=${migratedAfter}`);
  }
}
finally {
  await closeDb();
}
