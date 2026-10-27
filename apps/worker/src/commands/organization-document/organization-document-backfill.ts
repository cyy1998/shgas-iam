import { parseArgs } from "node:util";
import { parseDocumentCommandDeadline, runDocumentCommandWithLifecycle } from "../document-command-lifecycle";

export interface OrganizationDocumentBackfillCommandDeps {
  processor: {
    backfillAllOrganizations: (options?: {
      batchSize?: number;
      signal?: AbortSignal;
    }) => Promise<{ registered: number; enqueued: number }>;
  };
  logger: { info: (data: Record<string, unknown>, message: string) => void };
}

export async function runOrganizationDocumentBackfillCommand(
  deps: OrganizationDocumentBackfillCommandDeps,
  options: { batchSize: number; signal?: AbortSignal },
) {
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize <= 0)
    throw new RangeError("batchSize must be a positive safe integer");
  const report = await deps.processor.backfillAllOrganizations(options);
  options.signal?.throwIfAborted();
  deps.logger.info(
    { ...report, publication: "not-verified" },
    "Organization document backfill registered; wait for publication and run verification",
  );
  return report;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { "batch-size": { type: "string" }, "deadline-ms": { type: "string" } },
    strict: true,
  });
  const deadlineMs = parseDocumentCommandDeadline(values["deadline-ms"]);
  const { parseOrganizationDocumentBackfillCommandEnv } = await import("@worker/env");
  const env = parseOrganizationDocumentBackfillCommandEnv(process.env);
  const batchSize =
    values["batch-size"] === undefined ? env.organizationDocument.backfillBatchSize : Number(values["batch-size"]);
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0)
    throw new RangeError("batchSize must be a positive safe integer");
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createOrganizationDocumentBackfillCommandComposition } = await import(
    "@worker/composition/organization-document-command"
  );
  const composition = createOrganizationDocumentBackfillCommandComposition({ env, logger, deadlineMs });
  await runDocumentCommandWithLifecycle({
    deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) =>
      runOrganizationDocumentBackfillCommand({ processor: composition.processor, logger }, { batchSize, signal }),
  });
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write("Organization document backfill failed; inspect structured logs.\n");
  }
}
