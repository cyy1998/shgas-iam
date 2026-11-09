import { parseArgs } from "node:util";
import { runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { parseDocumentCommandDeadline } from "../document-command-lifecycle";

interface UserDocumentGateReport {
  version: number;
  gate: "postgres" | "redis-access";
  verifiedAt: string;
  status: "failed" | "passed";
  counts: Record<string, number>;
  failures: Array<{ code: string; count: number; samples: string[] }>;
}

interface ReadinessLogger {
  info: (data: Record<string, unknown>, message: string) => void;
}

interface GateCommandDeps {
  verifier: {
    verify: (input: { batchSize: number; signal?: AbortSignal }) => Promise<UserDocumentGateReport>;
  };
  logger: ReadinessLogger;
}

export async function runUserDocumentPostgresGateCommand(
  deps: GateCommandDeps,
  options: { batchSize: number; signal?: AbortSignal },
) {
  return await runGateCommand(deps, options, "postgres", "User Document PostgreSQL gate completed");
}

export async function runUserDocumentRedisGateCommand(
  deps: GateCommandDeps,
  options: { batchSize: number; signal?: AbortSignal },
) {
  return await runGateCommand(deps, options, "redis-access", "User Document Redis and Subject Access gate completed");
}

export function userDocumentGateExitCode(report: Pick<UserDocumentGateReport, "status">) {
  return report.status === "failed" ? 1 : 0;
}

async function runGateCommand(
  deps: GateCommandDeps,
  options: { batchSize: number; signal?: AbortSignal },
  gate: UserDocumentGateReport["gate"],
  completedMessage: string,
) {
  requirePositiveSafeInteger(options.batchSize, "batchSize");
  deps.logger.info({ gate, batchSize: options.batchSize }, "User Document gate started");
  const report = await deps.verifier.verify(options);
  deps.logger.info({ ...report }, completedMessage);
  return report;
}

type UserDocumentReadinessOperation = "verify-postgres" | "verify-redis";

function parseReadinessArgs(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "batch-size": { type: "string" },
      "deadline-ms": { type: "string" },
    },
    strict: true,
  });
  const operation = positionals[0] as UserDocumentReadinessOperation | undefined;
  if (!operation || !["verify-postgres", "verify-redis"].includes(operation)) {
    throw new Error("User Document readiness operation must be verify-postgres or verify-redis");
  }
  if (positionals.length !== 1) throw new Error("User Document readiness accepts exactly one operation");
  return {
    operation,
    deadlineMs: parseDocumentCommandDeadline(values["deadline-ms"]),
    batchSize: values["batch-size"] === undefined ? undefined : Number(values["batch-size"]),
  };
}

async function main(args: string[]) {
  const options = parseReadinessArgs(args);
  const { parseUserDocumentPostgresReadinessCommandEnv, parseOfflineMaintenanceEnv } = await import("@ops/env");
  const env = parseUserDocumentPostgresReadinessCommandEnv(process.env);
  const redis = options.operation === "verify-redis" ? parseOfflineMaintenanceEnv(process.env) : undefined;
  const batchSize = options.batchSize ?? env.userDocument.backfillBatchSize;
  requirePositiveSafeInteger(batchSize, "batchSize");
  const logger = await createReadinessLogger(env);
  const { createUserDocumentReadinessCommandComposition } = await import(
    "@ops/composition/user-document-readiness-command"
  );
  const composition = createUserDocumentReadinessCommandComposition({
    databaseUrl: env.databaseUrl,
    buildBatchSize: env.userDocument.rebuildBatchSize,
    logger,
    deadlineMs: options.deadlineMs,
    redis,
  });
  const report = await runMaintenanceCommandWithLifecycle({
    signals: process,
    deadlineMs: options.deadlineMs,
    shutdown: composition.shutdown,
    run: (signal) =>
      options.operation === "verify-postgres"
        ? runUserDocumentPostgresGateCommand({ verifier: composition, logger }, { batchSize, signal })
        : runUserDocumentRedisGateCommand({ verifier: composition, logger }, { batchSize, signal }),
  });
  process.exitCode = userDocumentGateExitCode(report);
}

async function createReadinessLogger(env: {
  nodeEnv: string;
  log: { level: string; format: "auto" | "json" | "pretty" };
}) {
  const { createLogger, LoggerSourceApp } = await import("@iam/runtime/logger");
  return createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Ops,
  });
}

export async function run(args: string[]) {
  try {
    await main(args);
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write("User Document readiness failed; inspect structured logs for the gate report.\n");
  }
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
}
