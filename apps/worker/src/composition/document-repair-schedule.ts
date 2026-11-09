import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { closeMaintenancePostgresInvocation } from "@iam/db/maintenance";
import { spawnOwnedProcessTree, waitForOwnedProcessTree } from "@iam/runtime/process";
import type { DocumentRepairInvocation, WorkerEnv } from "@worker/env";
import { DOCUMENT_REPAIR_CLEANUP_FAILURE_EXIT_CODE } from "@worker/maintenance/document-repair-protocol";
import type { WorkerLogger } from "./runtime";

const PROCESS_CLEANUP_TIMEOUT_MS = 5_000;

const workerEntry = fileURLToPath(new URL("../index.ts", import.meta.url));
const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

export interface DocumentRepairRunResult {
  status: "completed" | "failed" | "cleanup-failed";
  failureKind?: string;
  exitCode?: number | null;
  error?: unknown;
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
  let cleanupFailure: unknown;

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
        cleanupFailure = result.error ?? new Error(`${documentName} repair cleanup failed`);
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
      if (cleanupFailure !== undefined) throw cleanupFailure;
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
  const sourceRuntime = existsSync(workerEntry);
  const artifactRoot = dirname(process.execPath);
  const invocation: DocumentRepairInvocation = {
    document,
    postgresInvocationId: randomUUID(),
    limit: config.limit,
    deadlineMs: config.deadlineMs,
    env: {
      nodeEnv: env.nodeEnv,
      databaseUrl: env.databaseUrl,
      redis: env.redis,
      log: env.log,
      userDocument: {
        rebuildBatchSize: env.userDocument.rebuildBatchSize,
        repairStaleSeconds: env.userDocument.repairStaleSeconds,
      },
      organizationDocument: {
        repairStaleSeconds: env.organizationDocument.repairStaleSeconds,
      },
    },
  };
  const child = spawnOwnedProcessTree({
    executable: process.execPath,
    args: sourceRuntime
      ? ["--no-env-file", "run", workerEntry, "--internal-document-repair"]
      : ["--internal-document-repair"],
    cwd: sourceRuntime ? workerRoot : artifactRoot,
    ...(!sourceRuntime && process.platform === "win32"
      ? {
          windowsJob: {
            supervisorPath: join(artifactRoot, "windows-job-supervisor.ps1"),
            launcherExecutable: join(artifactRoot, "windows-job-launcher.exe"),
          },
        }
      : {}),
    env: { ...process.env, IAM_WORKER_DOCUMENT_REPAIR_INPUT: JSON.stringify(invocation) },
  });
  child.stdout.pipe(process.stdout, { end: false });
  child.stderr.pipe(process.stderr, { end: false });
  const result = await waitForOwnedProcessTree(child, {
    signal,
    // Let the command's own deadline close its isolated resources before forcing its process tree to stop.
    timeoutMs: config.deadlineMs + PROCESS_CLEANUP_TIMEOUT_MS,
    cleanupTimeoutMs: PROCESS_CLEANUP_TIMEOUT_MS,
  });
  let postgresCleanupFailure: unknown;
  if (!result.cleanupFailure) {
    try {
      await closeMaintenancePostgresInvocation({
        databaseUrl: env.databaseUrl,
        scope: document,
        invocationId: invocation.postgresInvocationId,
      });
    } catch (error) {
      postgresCleanupFailure = error;
    }
  }
  if (result.cleanupFailure || postgresCleanupFailure !== undefined)
    return {
      status: "cleanup-failed",
      failureKind: "cleanup",
      exitCode: result.outcome?.exitCode,
      error: new AggregateError(
        [
          result.executionFailure?.error,
          result.outcome?.exitCode
            ? new Error(`Document repair child exited with code ${result.outcome.exitCode}`)
            : undefined,
          result.cleanupFailure,
          postgresCleanupFailure,
        ].filter((failure) => failure !== undefined),
        "Document repair invocation cleanup failed",
      ),
    };
  if (result.executionFailure) return { status: "failed", failureKind: result.executionFailure.kind };
  if (result.outcome?.exitCode === DOCUMENT_REPAIR_CLEANUP_FAILURE_EXIT_CODE)
    return {
      status: "cleanup-failed",
      failureKind: "resources",
      exitCode: result.outcome.exitCode,
      error: new Error("Document repair child could not close its required resources"),
    };
  return {
    status: result.outcome?.exitCode === 0 ? "completed" : "failed",
    failureKind: result.outcome?.exitCode === 0 ? undefined : "exit",
    exitCode: result.outcome?.exitCode,
  };
}
