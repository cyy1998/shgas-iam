import { parseArgs } from "node:util";

export interface UserProfileRepairCommandDeps {
  maintenance: {
    repairFailedOrStale: (input: { staleBefore: Date; limit?: number }) => Promise<{
      enqueued: number;
      userIds: number[];
    }>;
  };
  subjectAccessRepair: {
    repairPending: (input: { limit: number }) => Promise<{
      disabled: number;
      enabled: number;
      deferred: number;
      failed: number;
      stable: number;
    }>;
  };
  subjectAccessRepairBacklog: {
    inspectRepairBacklog: () => Promise<{
      count: number;
      oldestAgeMs: number | null;
    }>;
  };
  subjectAccessTransitionReaper: {
    reapStalePending: (input: {
      staleAfterSeconds: number;
      limit: number;
    }) => Promise<{ rolledBack: number }>;
  };
  subjectAccessTransitionRecovery: {
    recoverPending: (input: { limit: number }) => Promise<{
      deferred: number;
      failed: number;
      prepared: number;
      rolledBack: number;
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
    repairStaleSeconds: number;
    transitionStaleSeconds: number;
  };
}

export interface UserProfileRepairCommandOptions {
  staleBefore?: Date;
  limit?: number;
}

export interface SubjectAccessRepairCommandDeps {
  subjectAccessRepair: UserProfileRepairCommandDeps["subjectAccessRepair"];
  subjectAccessRepairBacklog: UserProfileRepairCommandDeps["subjectAccessRepairBacklog"];
  subjectAccessTransitionReaper: {
    reapStalePending: (input: {
      staleAfterSeconds: number;
      limit: number;
    }) => Promise<{ rolledBack: number }>;
  };
  subjectAccessTransitionRecovery: UserProfileRepairCommandDeps["subjectAccessTransitionRecovery"];
  logger: UserProfileRepairCommandDeps["logger"];
  config: Pick<UserProfileRepairCommandDeps["config"], "limit"> & {
    transitionStaleSeconds: number;
  };
}

export async function runSubjectAccessRepairCommand(
  deps: SubjectAccessRepairCommandDeps,
  options: Pick<UserProfileRepairCommandOptions, "limit"> = {},
) {
  const limit = options.limit ?? deps.config.limit;
  deps.logger.info({
    limit,
    staleAfterSeconds: deps.config.transitionStaleSeconds,
  }, "Subject Access stale transition intent reap started");
  const transitionReap = await deps.subjectAccessTransitionReaper
    .reapStalePending({
      staleAfterSeconds: deps.config.transitionStaleSeconds,
      limit,
    });
  deps.logger.info({
    ...transitionReap,
    limit,
    staleAfterSeconds: deps.config.transitionStaleSeconds,
  }, "Subject Access stale transition intents reaped");
  await observeRepairBacklog(deps, "before-processing");
  const transitionRecovery
    = await deps.subjectAccessTransitionRecovery.recoverPending({ limit });
  deps.logger.info({
    ...transitionRecovery,
    limit,
  }, "Subject Access transition recovery backlog processed");
  const subjectAccess = await deps.subjectAccessRepair.repairPending({ limit });
  await observeRepairBacklog(deps, "after-processing", {
    ...subjectAccess,
    limit,
  });
  return { subjectAccess, transitionReap, transitionRecovery };
}

export async function runUserProfileRepairCommand(
  deps: UserProfileRepairCommandDeps,
  options: UserProfileRepairCommandOptions = {},
) {
  const staleBefore = options.staleBefore ?? new Date(
    deps.clock.nowDate().getTime() - deps.config.repairStaleSeconds * 1000,
  );
  const limit = options.limit ?? deps.config.limit;
  deps.logger.info({
    limit,
    staleAfterSeconds: deps.config.transitionStaleSeconds,
  }, "Subject Access stale transition intent reap started");
  const transitionReap = await deps.subjectAccessTransitionReaper
    .reapStalePending({
      staleAfterSeconds: deps.config.transitionStaleSeconds,
      limit,
    });
  deps.logger.info({
    ...transitionReap,
    limit,
    staleAfterSeconds: deps.config.transitionStaleSeconds,
  }, "Subject Access stale transition intents reaped");
  await observeRepairBacklog(deps, "before-processing");
  const transitionRecovery
    = await deps.subjectAccessTransitionRecovery.recoverPending({ limit });
  const [result, subjectAccess] = await Promise.all([
    deps.maintenance.repairFailedOrStale({ staleBefore, limit }),
    deps.subjectAccessRepair.repairPending({ limit }),
  ]);
  deps.logger.info({
    enqueued: result.enqueued,
    userIds: result.userIds,
    staleBefore: staleBefore.toISOString(),
    limit,
  }, "user profile repair jobs enqueued");
  deps.logger.info({
    ...transitionRecovery,
    limit,
  }, "Subject Access transition recovery backlog processed");
  await observeRepairBacklog(deps, "after-processing", {
    ...subjectAccess,
    limit,
  });
  return {
    ...result,
    subjectAccess,
    transitionReap,
    transitionRecovery,
  };
}

type RepairBacklogObservationDeps = Pick<
  SubjectAccessRepairCommandDeps,
  "logger" | "subjectAccessRepairBacklog"
>;

async function observeRepairBacklog(
  deps: RepairBacklogObservationDeps,
  phase: "before-processing" | "after-processing",
  data: Record<string, unknown> = {},
) {
  try {
    const backlog = await deps.subjectAccessRepairBacklog.inspectRepairBacklog();
    deps.logger.info({
      ...data,
      repairBacklogCount: backlog.count,
      repairBacklogOldestAgeMs: backlog.oldestAgeMs,
    }, phase === "before-processing"
      ? "Subject Access repair backlog observed before processing"
      : "Subject Access repair backlog processed");
  }
  catch {
    deps.logger.info({
      ...data,
      repairBacklogMetricsAvailable: false,
      repairBacklogPhase: phase,
    }, "Subject Access repair backlog observation unavailable");
  }
}

interface UserProfileRepairCliOptions extends UserProfileRepairCommandOptions {
  subjectAccessOnly?: boolean;
}

function parseRepairArgs(argv: string[]): UserProfileRepairCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "stale-before": { type: "string" },
      "limit": { type: "string" },
      "subject-access-only": { type: "boolean" },
    },
    strict: true,
  });

  return {
    staleBefore: values["stale-before"] === undefined ? undefined : new Date(values["stale-before"]),
    limit: values.limit === undefined ? undefined : Number(values.limit),
    subjectAccessOnly: values["subject-access-only"],
  };
}

async function main() {
  const { parseWorkerEnv } = await import("@worker/env");
  const env = parseWorkerEnv(process.env);
  const { logger } = await import("@worker/lib/logger");
  const commandOptions = parseRepairArgs(process.argv.slice(2));
  const {
    createWorkerCommandComposition,
    createWorkerSubjectAccessRepairComposition,
  } = await import("@worker/composition");
  if (commandOptions.subjectAccessOnly) {
    const composition = await createWorkerSubjectAccessRepairComposition({
      env,
      logger,
    });
    try {
      await runSubjectAccessRepairCommand({
        subjectAccessRepairBacklog: composition.subjectAccess.repairBacklog,
        subjectAccessRepair: composition.subjectAccess.repair,
        subjectAccessTransitionReaper:
          composition.subjectAccess.transitionReaper,
        subjectAccessTransitionRecovery:
          composition.subjectAccess.transitionRecovery,
        logger: composition.logger,
        config: {
          limit: env.userProfile.backfillBatchSize,
          transitionStaleSeconds: env.userProfile.repairStaleSeconds,
        },
      }, commandOptions);
    }
    finally {
      await composition.shutdown("command:user-profile:repair");
    }
    return;
  }
  const composition = await createWorkerCommandComposition({ env, logger });
  try {
    await runUserProfileRepairCommand(
      {
        maintenance: composition.userProfile.maintenance,
        subjectAccessRepairBacklog: composition.subjectAccess.repairBacklog,
        subjectAccessRepair: composition.subjectAccess.repair,
        subjectAccessTransitionReaper:
          composition.subjectAccess.transitionReaper,
        subjectAccessTransitionRecovery:
          composition.subjectAccess.transitionRecovery,
        clock: composition.runtime.clock,
        logger: composition.logger,
        config: {
          limit: env.userProfile.backfillBatchSize,
          repairStaleSeconds: env.userProfile.repairStaleSeconds,
          transitionStaleSeconds: env.userProfile.repairStaleSeconds,
        },
      },
      {
        staleBefore: commandOptions.staleBefore,
        limit: commandOptions.limit,
      },
    );
  }
  finally {
    await composition.shutdown("command:user-profile:repair");
  }
}

if (import.meta.main) {
  void main();
}
