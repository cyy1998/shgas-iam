import { parseArgs } from "node:util";

interface UserProfileGateReport {
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
    verify: (input: { batchSize: number }) => Promise<UserProfileGateReport>;
  };
  logger: ReadinessLogger;
}

export async function runUserProfilePostgresGateCommand(
  deps: GateCommandDeps,
  options: { batchSize: number },
) {
  return await runGateCommand(
    deps,
    options,
    "postgres",
    "User Profile PostgreSQL gate completed",
  );
}

export async function runUserProfileRedisGateCommand(
  deps: GateCommandDeps,
  options: { batchSize: number },
) {
  return await runGateCommand(
    deps,
    options,
    "redis-access",
    "User Profile Redis and Subject Access gate completed",
  );
}

export function userProfileGateExitCode(
  report: Pick<UserProfileGateReport, "status">,
) {
  return report.status === "failed" ? 1 : 0;
}

async function runGateCommand(
  deps: GateCommandDeps,
  options: { batchSize: number },
  gate: UserProfileGateReport["gate"],
  completedMessage: string,
) {
  requirePositiveSafeInteger(options.batchSize, "batchSize");
  deps.logger.info({ gate, batchSize: options.batchSize }, "User Profile gate started");
  const report = await deps.verifier.verify({ batchSize: options.batchSize });
  deps.logger.info({ ...report }, completedMessage);
  return report;
}

type UserProfileReadinessOperation = "verify-postgres" | "verify-redis";

function parseReadinessArgs(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "batch-size": { type: "string" },
    },
    strict: true,
  });
  const operation = positionals[0] as UserProfileReadinessOperation | undefined;
  if (!operation || !["verify-postgres", "verify-redis"].includes(operation)) {
    throw new Error(
      "User Profile readiness operation must be verify-postgres or verify-redis",
    );
  }
  if (positionals.length !== 1)
    throw new Error("User Profile readiness accepts exactly one operation");
  return {
    operation,
    batchSize: values["batch-size"] === undefined
      ? undefined
      : Number(values["batch-size"]),
  };
}

async function main() {
  const options = parseReadinessArgs(process.argv.slice(2));
  if (options.operation === "verify-postgres") {
    const { parseUserProfilePostgresReadinessCommandEnv } = await import("@worker/env");
    const env = parseUserProfilePostgresReadinessCommandEnv(process.env);
    const logger = await createReadinessLogger(env);
    const { createUserProfilePostgresReadinessCommandComposition } = await import("@worker/composition");
    const postgres = createUserProfilePostgresReadinessCommandComposition({
      env,
      logger,
    });
    const batchSize = options.batchSize ?? env.userProfile.backfillBatchSize;
    try {
      const report = await runUserProfilePostgresGateCommand({
        verifier: postgres.postgresGate,
        logger: postgres.logger,
      }, { batchSize });
      process.exitCode = userProfileGateExitCode(report);
    }
    finally {
      await postgres.shutdown("command:user-profile:verify-postgres");
    }
    return;
  }

  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const logger = await createReadinessLogger(env);
  const { createUserProfileRedisReadinessCommandComposition } = await import("@worker/composition");
  const redis = createUserProfileRedisReadinessCommandComposition({
    env,
    logger,
  });
  const batchSize = options.batchSize ?? env.userProfile.backfillBatchSize;
  try {
    const report = await runUserProfileRedisGateCommand({
      verifier: redis.redisAccessGate,
      logger: redis.logger,
    }, { batchSize });
    process.exitCode = userProfileGateExitCode(report);
  }
  finally {
    await redis.shutdown("command:user-profile:verify-redis");
  }
}

async function createReadinessLogger(env: {
  nodeEnv: string;
  log: { level: string; format: "auto" | "json" | "pretty" };
}) {
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  return createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
}

if (import.meta.main) {
  try {
    // eslint-disable-next-line antfu/no-top-level-await -- Bun must keep the command alive through shutdown.
    await main();
  }
  catch {
    process.exitCode = 1;
    process.stderr.write(
      "User Profile readiness failed; inspect structured logs for the gate report.\n",
    );
  }
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}
