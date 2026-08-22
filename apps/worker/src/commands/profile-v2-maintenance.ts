import { parseArgs } from "node:util";

const PROFILE_V2_VERSION = 2 as const;

interface ProfileV2BackfillBatchResult {
  version: typeof PROFILE_V2_VERSION;
  nextAfterUserId: number;
  complete: boolean;
  scanned: number;
  rebuilt: number;
  reused: number;
  facts: { published: number; retainedNewer: number };
  barriers: { seeded: number; retainedExisting: number };
}

interface ProfileV2GateReport {
  version: typeof PROFILE_V2_VERSION;
  gate: "postgres" | "redis-access";
  verifiedAt: string;
  status: "failed" | "passed";
  counts: Record<string, number>;
  failures: Array<{ code: string; count: number; samples: string[] }>;
}

interface MaintenanceLogger {
  info: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
}

export async function runProfileV2BackfillCommand(
  deps: {
    backfill: {
      backfillBatch: (input: {
        version: typeof PROFILE_V2_VERSION;
        afterUserId: number;
        batchSize: number;
      }) => Promise<ProfileV2BackfillBatchResult>;
    };
    logger: MaintenanceLogger;
  },
  options: { afterUserId: number; batchSize: number },
) {
  requireNonNegativeSafeInteger(options.afterUserId, "afterUserId");
  requirePositiveSafeInteger(options.batchSize, "batchSize");
  const startAfterUserId = options.afterUserId;
  let safeAfterUserId = startAfterUserId;
  let batches = 0;
  let scanned = 0;
  let rebuilt = 0;
  let reused = 0;

  while (true) {
    batches += 1;
    let result: ProfileV2BackfillBatchResult;
    try {
      result = await deps.backfill.backfillBatch({
        version: PROFILE_V2_VERSION,
        afterUserId: safeAfterUserId,
        batchSize: options.batchSize,
      });
    }
    catch (error) {
      deps.logger.error({
        version: PROFILE_V2_VERSION,
        batch: batches,
        safeAfterUserId,
      }, "Profile V2 backfill batch failed");
      throw error;
    }

    safeAfterUserId = result.nextAfterUserId;
    scanned += result.scanned;
    rebuilt += result.rebuilt;
    reused += result.reused;
    deps.logger.info({
      version: PROFILE_V2_VERSION,
      batch: batches,
      nextAfterUserId: safeAfterUserId,
      complete: result.complete,
      scanned: result.scanned,
      rebuilt: result.rebuilt,
      reused: result.reused,
      factsPublished: result.facts.published,
      factsRetainedNewer: result.facts.retainedNewer,
      barriersSeeded: result.barriers.seeded,
      barriersRetainedExisting: result.barriers.retainedExisting,
    }, "Profile V2 backfill batch completed");
    if (result.complete)
      break;
  }

  return {
    version: PROFILE_V2_VERSION,
    startAfterUserId,
    nextAfterUserId: safeAfterUserId,
    batches,
    scanned,
    rebuilt,
    reused,
  };
}

export async function runProfileV2PostgresGateCommand(
  deps: {
    verifier: { verify: (input: { version: 2; batchSize: number }) => Promise<ProfileV2GateReport> };
    logger: Pick<MaintenanceLogger, "info">;
  },
  options: { batchSize: number },
) {
  return await runGateCommand(deps, options, "postgres", "Profile V2 PostgreSQL gate completed");
}

export async function runProfileV2RedisAccessGateCommand(
  deps: {
    verifier: { verify: (input: { version: 2; batchSize: number }) => Promise<ProfileV2GateReport> };
    logger: Pick<MaintenanceLogger, "info">;
  },
  options: { batchSize: number },
) {
  return await runGateCommand(
    deps,
    options,
    "redis-access",
    "Profile V2 Redis and Subject Access gate completed",
  );
}

export function profileV2GateExitCode(report: Pick<ProfileV2GateReport, "status">) {
  return report.status === "failed" ? 1 : 0;
}

async function runGateCommand(
  deps: {
    verifier: { verify: (input: { version: 2; batchSize: number }) => Promise<ProfileV2GateReport> };
    logger: Pick<MaintenanceLogger, "info">;
  },
  options: { batchSize: number },
  gate: ProfileV2GateReport["gate"],
  completedMessage: string,
) {
  requirePositiveSafeInteger(options.batchSize, "batchSize");
  deps.logger.info({
    version: PROFILE_V2_VERSION,
    gate,
    batchSize: options.batchSize,
  }, "Profile V2 gate started");
  const report = await deps.verifier.verify({
    version: PROFILE_V2_VERSION,
    batchSize: options.batchSize,
  });
  deps.logger.info({ ...report }, completedMessage);
  return report;
}

type ProfileV2MaintenanceOperation = "backfill" | "verify-postgres" | "verify-redis";

function parseMaintenanceArgs(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "batch-size": { type: "string" },
      "after-user-id": { type: "string", default: "0" },
    },
    strict: true,
  });
  const operation = positionals[0] as ProfileV2MaintenanceOperation | undefined;
  if (!operation || !["backfill", "verify-postgres", "verify-redis"].includes(operation)) {
    throw new Error(
      "Profile V2 maintenance operation must be backfill, verify-postgres, or verify-redis",
    );
  }
  if (positionals.length !== 1)
    throw new Error("Profile V2 maintenance accepts exactly one operation");
  return {
    operation,
    batchSize: values["batch-size"] === undefined ? undefined : Number(values["batch-size"]),
    afterUserId: Number(values["after-user-id"]),
  };
}

async function main() {
  const options = parseMaintenanceArgs(process.argv.slice(2));
  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createProfileV2MaintenanceCommandComposition } = await import("@worker/composition");
  const composition = await createProfileV2MaintenanceCommandComposition({ env, logger });
  const batchSize = options.batchSize ?? env.userProfile.backfillBatchSize;
  try {
    if (options.operation === "backfill") {
      await runProfileV2BackfillCommand({
        backfill: composition.profileV2.backfill,
        logger: composition.logger,
      }, {
        afterUserId: options.afterUserId,
        batchSize,
      });
      return;
    }

    const report = options.operation === "verify-postgres"
      ? await runProfileV2PostgresGateCommand({
          verifier: composition.profileV2.postgresGate,
          logger: composition.logger,
        }, { batchSize })
      : await runProfileV2RedisAccessGateCommand({
          verifier: composition.profileV2.redisAccessGate,
          logger: composition.logger,
        }, { batchSize });
    process.exitCode = profileV2GateExitCode(report);
  }
  finally {
    await composition.shutdown(`command:profile-v2:${options.operation}`);
  }
}

if (import.meta.main) {
  try {
    // eslint-disable-next-line antfu/no-top-level-await -- Bun must keep the command alive through shutdown.
    await main();
  }
  catch {
    process.exitCode = 1;
    process.stderr.write(
      "Profile V2 maintenance failed; inspect structured logs for the last safe cursor or gate report.\n",
    );
  }
}

function requirePositiveSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive safe integer`);
}

function requireNonNegativeSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative safe integer`);
}
