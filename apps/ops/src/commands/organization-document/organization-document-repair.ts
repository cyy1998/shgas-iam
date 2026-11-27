import { parseArgs } from "node:util";
import type {
  OrganizationDocumentRepairOptions,
  OrganizationDocumentRepairReport,
} from "@iam/documents/organization/maintenance";
import { runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { type CommandContext, createCommandLogger } from "@ops/command-context";
import { parseDocumentCommandDeadline } from "../document-command-lifecycle";

export async function runOrganizationDocumentRepairCommand(
  deps: {
    processor: {
      repairFailedOrStale: (options: OrganizationDocumentRepairOptions) => Promise<OrganizationDocumentRepairReport>;
    };
    logger: { info: (data: Record<string, unknown>, message: string) => void };
  },
  options: OrganizationDocumentRepairOptions,
) {
  const work = await deps.processor.repairFailedOrStale(options);
  options.signal?.throwIfAborted();
  const report = { ...work, status: work.failed ? "failed" : "enqueued", publication: "not-verified" };
  deps.logger.info(report, "Organization document repair wakeups finished; wait for publication and run verification");
  return report;
}

async function main(args: string[], context: CommandContext) {
  const { values } = parseArgs({
    args: args,
    strict: true,
    options: { limit: { type: "string" }, "stale-before": { type: "string" }, "deadline-ms": { type: "string" } },
  });
  const deadlineMs = parseDocumentCommandDeadline(values["deadline-ms"]);
  const { parseOrganizationDocumentBackfillCommandEnv } = await import("@ops/env");
  const env = parseOrganizationDocumentBackfillCommandEnv(context.env, context.stderr);
  const limit = values.limit === undefined ? env.organizationDocument.backfillBatchSize : Number(values.limit);
  const staleBefore =
    values["stale-before"] === undefined
      ? new Date(Date.now() - env.organizationDocument.repairStaleSeconds * 1000)
      : new Date(values["stale-before"]);
  if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isFinite(staleBefore.getTime()))
    throw new RangeError("repair requires a positive safe limit and valid stale-before");
  const { LoggerSourceApp } = await import("@iam/runtime/logger");
  const logger = createCommandLogger(context, {
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Ops,
  });
  const { createOrganizationDocumentCommandComposition } = await import(
    "@ops/composition/organization-document-command"
  );
  const composition = createOrganizationDocumentCommandComposition({ env, logger, deadlineMs });
  const report = await runMaintenanceCommandWithLifecycle({
    signals: context,
    deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) =>
      runOrganizationDocumentRepairCommand(
        { processor: composition.processor, logger },
        { staleBefore, limit, signal },
      ),
  });
  if (report.failed) context.exitCode = 1;
}

export async function run(args: string[], context: CommandContext = process) {
  try {
    await main(args, context);
  } catch {
    context.exitCode = context.exitCode || 1;
    context.stderr.write("Organization document repair failed; persistent work remains for retry.\n");
  }
}
