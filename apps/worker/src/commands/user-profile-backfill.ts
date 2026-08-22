export interface UserProfileBackfillCommandDeps {
  maintenance: {
    backfillAllUsers: (options?: { batchSize?: number }) => Promise<{ enqueued: number }>;
  };
  logger: {
    info: (data: Record<string, unknown>, message: string) => void;
  };
  config: {
    batchSize: number;
  };
}

export async function runUserProfileBackfillCommand(deps: UserProfileBackfillCommandDeps) {
  const result = await deps.maintenance.backfillAllUsers({ batchSize: deps.config.batchSize });
  deps.logger.info({
    enqueued: result.enqueued,
    readiness: "not-verified",
  }, "user profile backfill jobs dispatched; run readiness gates after convergence");
  return result;
}

async function main() {
  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createWorkerCommandComposition } = await import("@worker/composition");
  const composition = await createWorkerCommandComposition({ env, logger });
  try {
    await runUserProfileBackfillCommand({
      maintenance: composition.userProfile.maintenance,
      logger: composition.logger,
      config: {
        batchSize: env.userProfile.backfillBatchSize,
      },
    });
  }
  finally {
    await composition.shutdown("command:user-profile:backfill");
  }
}

if (import.meta.main) {
  void main();
}
