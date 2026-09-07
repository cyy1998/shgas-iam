import process from "node:process";
import { parseAuditActionMaintenanceCommandEnv } from "@worker/env";
import postgres from "postgres";

// This frozen migration owns its vocabulary independently of the runtime catalog.
const mappingSql = `VALUES
  ('auth.login.success', 'auth.login', 'success'),
  ('auth.login.password.success', 'auth.login.password', 'success'),
  ('auth.login.password.failure', 'auth.login.password', 'failure'),
  ('auth.login.mobile.success', 'auth.login.mobile', 'success'),
  ('auth.login.mobile.failure', 'auth.login.mobile', 'failure'),
  ('auth.login.local.success', 'auth.login.local', 'success'),
  ('auth.login.oa.success', 'auth.login.oa', 'success'),
  ('auth.login.wechat.success', 'auth.login.wechat', 'success')`;

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== "--");
  const [mode, ...flags] = args;
  if (!((mode === "inventory" || mode === "verify") && flags.length === 0)
    && !(mode === "apply" && flags.length === 1 && flags[0] === "--writers-stopped")) {
    process.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "invalid-arguments" })}\n`);
    process.exitCode = 2;
    return;
  }
  const { databaseUrl } = parseAuditActionMaintenanceCommandEnv(process.env);
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
    connection: {
      application_name: "iam-audit-action-maintenance-v1",
      statement_timeout: 300_000,
      lock_timeout: 10_000,
      idle_in_transaction_session_timeout: 300_000,
    },
  });
  let report;
  try {
    report = await sql.begin(mode === "apply" ? "" : "ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
      // Acquire before reading so committed writers are included in the preflight.
      if (mode === "apply")
        await tx`LOCK TABLE audit_log IN SHARE ROW EXCLUSIVE MODE`;
      const [counts] = await tx.unsafe<Array<{ totalRows: string; legacyRows: string; conflictRows: string }>>(`
        WITH mapping(old_action, new_action, expected_outcome) AS (${mappingSql})
        SELECT count(*)::text AS "totalRows", count(m.old_action)::text AS "legacyRows",
          count(*) FILTER (WHERE m.old_action IS NOT NULL
            AND a.outcome IS DISTINCT FROM m.expected_outcome)::text AS "conflictRows"
        FROM audit_log a LEFT JOIN mapping m ON a.action = m.old_action`);
      if (!counts)
        throw new Error("incomplete inventory");
      const byAction = await tx.unsafe(`
        WITH mapping(old_action, new_action, expected_outcome) AS (${mappingSql})
        SELECT m.old_action AS action, count(a.id)::text AS rows
        FROM mapping m LEFT JOIN audit_log a ON a.action = m.old_action
        GROUP BY m.old_action ORDER BY m.old_action`);
      const conflicts = await tx.unsafe(`
        WITH mapping(old_action, new_action, expected_outcome) AS (${mappingSql})
        SELECT a.id FROM audit_log a JOIN mapping m ON a.action = m.old_action
        WHERE a.outcome IS DISTINCT FROM m.expected_outcome ORDER BY a.id LIMIT 20`);
      let updatedRows = "0";
      if (mode === "apply" && counts.conflictRows === "0") {
        const [updated] = await tx.unsafe<Array<{ count: string }>>(`
          WITH mapping(old_action, new_action, expected_outcome) AS (${mappingSql}),
          updated AS (
            UPDATE audit_log a SET action = m.new_action FROM mapping m
            WHERE a.action = m.old_action RETURNING a.id
          ) SELECT count(*)::text AS count FROM updated`);
        if (!updated || updated.count !== counts.legacyRows)
          throw new Error("incomplete update");
        updatedRows = updated.count;
      }
      const failed = counts.conflictRows !== "0" || (mode === "verify" && counts.legacyRows !== "0");
      return {
        version: 1,
        mode,
        status: failed ? "failed" : "completed",
        ...counts,
        updatedRows,
        byAction: Array.from(byAction),
        conflictIds: conflicts.map(row => row.id),
      };
    });
  }
  finally {
    await sql.end({ timeout: 5 });
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status === "failed")
    process.exitCode = 1;
}

if (import.meta.main) {
  try {
    // eslint-disable-next-line antfu/no-top-level-await -- Await transaction and shutdown before CLI exit.
    await main();
  }
  catch {
    process.exitCode = 1;
    process.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "operation-failed" })}\n`);
  }
}
