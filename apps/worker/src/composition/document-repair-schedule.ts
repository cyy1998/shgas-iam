import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/api-core/process";
import type { WorkerEnv } from "@worker/env";
import type { WorkerLogger } from "./runtime";

const PROCESS_CLEANUP_TIMEOUT_MS = 5_000;
const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface DocumentRepairRunResult {
  status: "completed" | "failed" | "cleanup-failed";
  failureKind?: string;
  exitCode?: number | null;
}

export function startDocumentRepairSchedule(options: {
  document: "user" | "organization";
  env: WorkerEnv;
  enabledModuleKeys: readonly string[];
  logger: Pick<WorkerLogger, "info" | "error">;
  run?: (signal: AbortSignal) => Promise<DocumentRepairRunResult>;
}) {
  const config = (options.document === "user" ? options.env.userDocument : options.env.organizationDocument).repair;
  const documentName = options.document === "user" ? "User Document" : "Organization Document";
  const eventPrefix = `${options.document === "user" ? "user_document" : "organization_document"}.repair`;
  const run = options.run ?? ((signal) => runRepairCommand(options.env, options.document, signal));
  let stopped = !config.enabled || !options.enabledModuleKeys.includes(`${options.document}-document`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let controller: AbortController | undefined;

  async function repair() {
    const started = performance.now();
    controller = new AbortController();
    options.logger.info(
      { event: `${eventPrefix}.started`, limit: config.limit },
      `scheduled ${documentName} repair started`,
    );
    try {
      const result = await run(controller.signal);
      const context = {
        event: `${eventPrefix}.${stopped ? "stopped" : result.status}`,
        durationMs: performance.now() - started,
        failureKind: result.failureKind,
        exitCode: result.exitCode,
      };
      if (result.status === "cleanup-failed") {
        // An old process may still be alive. Never start a potentially overlapping round.
        stopped = true;
        options.logger.error(context, `scheduled ${documentName} repair stopped after process cleanup failed`);
      } else if (result.status === "failed" && !stopped) {
        options.logger.error(
          context,
          `scheduled ${documentName} repair failed; durable work remains for the next round`,
        );
      } else {
        options.logger.info(context, `scheduled ${documentName} repair finished`);
      }
    } catch (error) {
      options.logger.error(
        { event: `${eventPrefix}.failed`, errorType: error instanceof Error ? error.name : "UnknownError" },
        `scheduled ${documentName} repair could not start; retrying next round`,
      );
    } finally {
      controller = undefined;
      if (!stopped) timer = setTimeout(startRound, config.intervalMs);
    }
  }

  function startRound() {
    if (stopped) return;
    active = repair().finally(() => {
      active = undefined;
    });
  }

  if (!stopped) startRound();
  return {
    async close() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      await active;
    },
  };
}

async function runRepairCommand(
  env: WorkerEnv,
  document: "user" | "organization",
  signal: AbortSignal,
): Promise<DocumentRepairRunResult> {
  signal.throwIfAborted();
  const config = (document === "user" ? env.userDocument : env.organizationDocument).repair;
  const repairCommand = fileURLToPath(
    new URL(`../commands/${document}-document/${document}-document-repair.ts`, import.meta.url),
  );
  const child = spawnOwnedProcessTree({
    executable: process.execPath,
    args: [
      "--no-env-file",
      "run",
      repairCommand,
      "--limit",
      String(config.limit),
      "--deadline-ms",
      String(config.deadlineMs),
    ],
    cwd: workerRoot,
    env: {
      ...process.env,
      NODE_ENV: env.nodeEnv,
      IAM_WORKER_DATABASE_URL: env.databaseUrl,
      IAM_WORKER_REDIS_HOST: env.redis.host,
      IAM_WORKER_REDIS_PORT: String(env.redis.port),
      IAM_WORKER_REDIS_DB: String(env.redis.db),
      IAM_WORKER_REDIS_PASSWORD: env.redis.password,
      IAM_WORKER_REDIS_USERNAME: undefined,
      IAM_WORKER_LOG_LEVEL: env.log.level,
      IAM_WORKER_LOG_FORMAT: env.log.format,
      IAM_WORKER_USER_DOCUMENT_REBUILD_BATCH_SIZE: String(env.userDocument.rebuildBatchSize),
      IAM_WORKER_USER_DOCUMENT_BACKFILL_BATCH_SIZE: String(env.userDocument.backfillBatchSize),
      IAM_WORKER_USER_DOCUMENT_REPAIR_STALE_SECONDS: String(env.userDocument.repairStaleSeconds),
      IAM_WORKER_ORGANIZATION_DOCUMENT_BACKFILL_BATCH_SIZE: String(env.organizationDocument.backfillBatchSize),
      IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS: String(env.organizationDocument.repairStaleSeconds),
    },
  });
  child.stdout.pipe(process.stdout, { end: false });
  child.stderr.pipe(process.stderr, { end: false });
  const result = await waitForOwnedProcessTree(child, {
    signal,
    // Let the command's own deadline close its isolated resources before forcing its process tree to stop.
    timeoutMs: config.deadlineMs + PROCESS_CLEANUP_TIMEOUT_MS,
    cleanupTimeoutMs: PROCESS_CLEANUP_TIMEOUT_MS,
  });
  if (result.cleanupFailure) return { status: "cleanup-failed", failureKind: "cleanup" };
  if (result.executionFailure) return { status: "failed", failureKind: result.executionFailure.kind };
  return {
    status: result.outcome?.exitCode === 0 ? "completed" : "failed",
    failureKind: result.outcome?.exitCode === 0 ? undefined : "exit",
    exitCode: result.outcome?.exitCode,
  };
}
