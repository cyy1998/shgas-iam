import { parseArgs } from "node:util";
import type {
  OrganizationSearchRepairOptions,
  OrganizationSearchRepairReport,
} from "@iam/organization-search-read-model/worker";
import { parseOrganizationCommandDeadline, runOrganizationSearchCommandWithLifecycle } from "./command-lifecycle";

export async function runOrganizationSearchRepairCommand(
  deps: {
    processor: {
      repairFailedOrStale: (options: OrganizationSearchRepairOptions) => Promise<OrganizationSearchRepairReport>;
    };
    logger: { info: (data: Record<string, unknown>, message: string) => void };
  },
  options: OrganizationSearchRepairOptions,
) {
  const work = await deps.processor.repairFailedOrStale(options);
  options.signal?.throwIfAborted();
  const report = { ...work, status: work.failed ? "failed" : "enqueued", publication: "not-verified" };
  deps.logger.info(report, "Organization search repair wakeups finished; wait for publication and run verification");
  return report;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: { limit: { type: "string" }, "stale-before": { type: "string" }, "deadline-ms": { type: "string" } },
  });
  const deadlineMs = parseOrganizationCommandDeadline(values["deadline-ms"]);
  const { parseOrganizationSearchBackfillCommandEnv } = await import("@worker/env");
  const env = parseOrganizationSearchBackfillCommandEnv(process.env);
  const limit = values.limit === undefined ? env.organizationSearch.backfillBatchSize : Number(values.limit);
  const staleBefore =
    values["stale-before"] === undefined
      ? new Date(Date.now() - env.organizationSearch.repairStaleSeconds * 1000)
      : new Date(values["stale-before"]);
  if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isFinite(staleBefore.getTime()))
    throw new RangeError("repair requires a positive safe limit and valid stale-before");
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createOrganizationSearchCommandComposition } = await import(
    "@worker/composition/organization-search-command"
  );
  const composition = createOrganizationSearchCommandComposition({ env, logger, deadlineMs });
  const report = await runOrganizationSearchCommandWithLifecycle({
    deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) =>
      runOrganizationSearchRepairCommand({ processor: composition.processor, logger }, { staleBefore, limit, signal }),
  });
  if (report.failed) process.exitCode = 1;
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write("Organization search repair failed; persistent work remains for retry.\n");
  }
}
