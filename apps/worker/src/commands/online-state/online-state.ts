import { createOfflineMaintenanceRedis } from "@worker/composition/offline-maintenance-redis";
import { createOnlineStateMaintenance } from "@worker/composition/online-state-maintenance";
import { parseOfflineMaintenanceEnv } from "@worker/env";
import { parseOnlineStateArgs } from "./arguments";

async function main() {
  let input;
  try {
    input = parseOnlineStateArgs(process.argv.slice(2));
  }
  catch {
    process.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "invalid-input" })}\n`);
    process.exitCode = 2;
    return;
  }
  const report = { version: 1, mode: input.mode, layout: input.layout, status: "failed", reason: "operation-failed", preservation: "requires_independent_baseline_comparison", owners: [] as Array<{
    owner: string;
    status: string;
    matching?: number;
    removed?: number;
    changed?: number;
    unknown?: number;
  }> };
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, input.deadlineMs);
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  let connection: ReturnType<typeof createOfflineMaintenanceRedis> | undefined;
  try {
    connection = createOfflineMaintenanceRedis(parseOfflineMaintenanceEnv(process.env), controller.signal);
    await connection.connect();
    for (const owner of createOnlineStateMaintenance(connection.redis, input, controller.signal)) {
      controller.signal.throwIfAborted();
      try {
        const result = await owner.run();
        controller.signal.throwIfAborted();
        const status = result.unknown === 0 && result.changed === 0 && (input.mode !== "verify" || result.matching === 0) ? "completed" : "failed";
        report.owners.push({ owner: owner.name, status, ...result });
      }
      catch { report.owners.push({ owner: owner.name, status: "failed" }); }
    }
    if (report.owners.length && report.owners.every(owner => owner.status === "completed")) {
      report.status = "completed";
      report.reason = "scope-complete";
    }
  }
  catch {}
  finally {
    clearTimeout(timer);
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
    connection?.close();
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.status === "completed" ? 0 : 1;
}

if (import.meta.main) {
  // eslint-disable-next-line antfu/no-top-level-await -- CLI owns resources until report and shutdown complete.
  await main();
}
