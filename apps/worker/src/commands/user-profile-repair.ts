import { parseArgs } from "node:util";

export interface UserProfileRepairCommandDeps {
  workerService: {
    repairFailedOrStale: (input: { staleBefore: Date; limit?: number }) => Promise<{
      enqueued: number;
      userIds: number[];
    }>;
  };
  clock: {
    nowDate: () => Date;
  };
  logger: {
    info: (data: Record<string, unknown>, message: string) => void;
  };
  config: {
    limit: number;
  };
}

export interface UserProfileRepairCommandOptions {
  staleBefore?: Date;
  limit?: number;
}

export async function runUserProfileRepairCommand(
  deps: UserProfileRepairCommandDeps,
  options: UserProfileRepairCommandOptions = {},
) {
  const staleBefore = options.staleBefore ?? deps.clock.nowDate();
  const limit = options.limit ?? deps.config.limit;
  const result = await deps.workerService.repairFailedOrStale({ staleBefore, limit });
  deps.logger.info({ enqueued: result.enqueued, userIds: result.userIds }, "user profile repair jobs enqueued");
  return result;
}

function parseRepairArgs(argv: string[]): UserProfileRepairCommandOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "stale-before": { type: "string" },
      "limit": { type: "string" },
    },
    strict: true,
  });

  return {
    staleBefore: values["stale-before"] === undefined ? undefined : new Date(values["stale-before"]),
    limit: values.limit === undefined ? undefined : Number(values.limit),
  };
}

async function main() {
  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const { createWorkerComposition } = await import("@worker/composition");
  const composition = await createWorkerComposition({ env, logger });
  try {
    await runUserProfileRepairCommand(
      {
        workerService: composition.userProfile.workerService,
        clock: composition.runtime.clock,
        logger: composition.logger,
        config: {
          limit: env.userProfile.backfillBatchSize,
        },
      },
      parseRepairArgs(process.argv.slice(2)),
    );
  }
  finally {
    await composition.shutdown("command:user-profile:repair");
  }
}

if (import.meta.main) {
  void main();
}
