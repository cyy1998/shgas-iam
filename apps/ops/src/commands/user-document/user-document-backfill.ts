import { parseArgs } from "node:util";
import { runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { type CommandContext, createCommandLogger } from "@ops/command-context";
import { parseDocumentCommandDeadline } from "../document-command-lifecycle";

export interface UserDocumentBackfillCommandDeps {
  maintenance: {
    backfillAllUsers: (options?: {
      batchSize?: number;
      signal?: AbortSignal;
    }) => Promise<{ registered: number; enqueued: number }>;
  };
  logger: { info: (data: Record<string, unknown>, message: string) => void };
  config: { batchSize: number };
}
export async function runUserDocumentBackfillCommand(deps: UserDocumentBackfillCommandDeps, signal?: AbortSignal) {
  if (!Number.isSafeInteger(deps.config.batchSize) || deps.config.batchSize < 1)
    throw new RangeError("batchSize must be a positive safe integer");
  const result = await deps.maintenance.backfillAllUsers({
    batchSize: deps.config.batchSize,
    ...(signal ? { signal } : {}),
  });
  signal?.throwIfAborted();
  deps.logger.info(
    { ...result, publication: "not-verified" },
    "User Document backfill registered; wait for publication and run verification",
  );
  return result;
}
async function main(args: string[], context: CommandContext) {
  const { values } = parseArgs({
    args: args,
    strict: true,
    options: { "batch-size": { type: "string" }, "deadline-ms": { type: "string" } },
  });
  const deadlineMs = parseDocumentCommandDeadline(values["deadline-ms"]);
  const { parseUserDocumentCommandEnv } = await import("@ops/env");
  const env = parseUserDocumentCommandEnv(context.env, context.stderr);
  const batchSize =
    values["batch-size"] === undefined ? env.userDocument.backfillBatchSize : Number(values["batch-size"]);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new RangeError("batchSize must be a positive safe integer");
  const { LoggerSourceApp } = await import("@iam/runtime/logger");
  const logger = createCommandLogger(context, {
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Ops,
  });
  const { createUserDocumentCommandComposition } = await import("@ops/composition/user-document-command");
  const composition = createUserDocumentCommandComposition({ env, logger, deadlineMs });
  const maintenance = composition.maintenance;
  if (!maintenance) throw new Error("User Document maintenance is required");
  await runMaintenanceCommandWithLifecycle({
    signals: context,
    deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) => runUserDocumentBackfillCommand({ maintenance, logger, config: { batchSize } }, signal),
  });
}
export async function run(args: string[], context: CommandContext = process) {
  try {
    await main(args, context);
  } catch {
    context.exitCode = context.exitCode || 1;
    context.stderr.write("User Document backfill failed; durable work remains for retry.\n");
  }
}
