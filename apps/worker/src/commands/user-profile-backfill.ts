export interface UserProfileBackfillCommandDeps {
  workerService: {
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
  const result = await deps.workerService.backfillAllUsers({ batchSize: deps.config.batchSize });
  deps.logger.info({ enqueued: result.enqueued }, "user profile backfill jobs enqueued");
  return result;
}

async function main() {
  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createWorkerComposition } = await import("@worker/composition");
  const composition = await createWorkerComposition({ env, logger });
  try {
    await runUserProfileBackfillCommand({
      workerService: composition.userProfile.workerService,
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
