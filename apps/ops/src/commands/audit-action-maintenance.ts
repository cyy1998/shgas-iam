import process from "node:process";
import { type AuditActionMaintenanceMode, runAuditActionMaintenance } from "@iam/db/audit";
import { closeMaintenanceResources } from "@iam/runtime/maintenance";
import type { CommandContext } from "@ops/command-context";
import { parseAuditActionMaintenanceCommandEnv } from "@ops/env";
import postgres from "postgres";

export function parseAuditActionMaintenanceArgs(args: readonly string[]): AuditActionMaintenanceMode | undefined {
  const [mode, ...flags] = args.filter((arg) => arg !== "--");
  if (
    ((mode === "inventory" || mode === "verify") && flags.length === 0) ||
    (mode === "apply" && flags.length === 1 && flags[0] === "--writers-stopped")
  )
    return mode;
  return undefined;
}

async function main(args: string[], context: CommandContext) {
  const mode = parseAuditActionMaintenanceArgs(args);
  if (!mode) {
    context.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "invalid-arguments" })}\n`);
    context.exitCode = 2;
    return;
  }
  const { databaseUrl } = parseAuditActionMaintenanceCommandEnv(context.env, context.stderr);
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
    connection: {
      application_name: "iam-audit-action-maintenance",
      statement_timeout: 300_000,
      lock_timeout: 10_000,
      idle_in_transaction_session_timeout: 300_000,
    },
  });
  let report: Awaited<ReturnType<typeof runAuditActionMaintenance>>;
  try {
    report = await runAuditActionMaintenance(sql, mode);
  } catch (error) {
    await closeMaintenanceResources([Promise.reject(error), sql.end({ timeout: 5 })]);
    throw error;
  }
  await sql.end({ timeout: 5 });
  context.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status === "failed") context.exitCode = 1;
}

export async function run(args: string[], context: CommandContext = process) {
  try {
    await main(args, context);
  } catch {
    context.exitCode = 1;
    context.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "operation-failed" })}\n`);
  }
}
