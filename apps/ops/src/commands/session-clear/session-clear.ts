import { createOfflineMaintenanceRedis, runMaintenanceCommandWithLifecycle } from "@iam/api-core/maintenance";
import { createSessionClearMaintenance } from "@ops/composition/session-clear-maintenance";
import { parseOfflineMaintenanceEnv } from "@ops/env";
import { parseSessionClearArgs } from "./arguments";

async function main(args: string[]) {
  let input: ReturnType<typeof parseSessionClearArgs>;
  try {
    input = parseSessionClearArgs(args);
  } catch {
    process.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "invalid-input" })}\n`);
    process.exitCode = 2;
    return;
  }
  const report = {
    version: 1,
    mode: input.mode,
    layout: input.layout,
    status: "failed",
    reason: "operation-failed",
    preservation: "requires_independent_baseline_comparison",
    owners: [] as Array<{
      owner: string;
      status: string;
      matching?: number;
      removed?: number;
      unknown?: number;
    }>,
  };
  let connection: ReturnType<typeof createOfflineMaintenanceRedis> | undefined;
  try {
    await runMaintenanceCommandWithLifecycle({
      signals: process,
      deadlineMs: input.deadlineMs,
      shutdown: async () => {
        connection?.close();
      },
      run: async (signal) => {
        connection = createOfflineMaintenanceRedis(parseOfflineMaintenanceEnv(process.env), signal);
        await connection.connect();
        for (const owner of createSessionClearMaintenance(connection.redis, input, signal)) {
          signal.throwIfAborted();
          try {
            const result = await owner.run();
            signal.throwIfAborted();
            const status =
              result.unknown === 0 && (input.mode !== "verify" || result.matching === 0) ? "completed" : "failed";
            report.owners.push({ owner: owner.name, status, ...result });
          } catch {
            report.owners.push({ owner: owner.name, status: "failed" });
          }
        }
        if (report.owners.length && report.owners.every((owner) => owner.status === "completed")) {
          report.status = "completed";
          report.reason = "scope-complete";
        }
      },
    });
  } catch {
    report.status = "failed";
    report.reason = "operation-failed";
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.status === "completed" ? 0 : 1;
}

export async function run(args: string[]) {
  await main(args);
}
