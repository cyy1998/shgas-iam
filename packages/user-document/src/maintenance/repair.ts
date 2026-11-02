export interface UserDocumentRepairDependencies {
  maintenance: {
    repairFailedOrStale: (input: {
      staleBefore: Date;
      limit: number;
      signal?: AbortSignal;
      force?: boolean;
    }) => Promise<{
      enqueued: number;
      failed?: number;
      exhausted?: number;
      userIds?: number[];
    }>;
    retryPostPublication?: (input: {
      userId: number;
      version: string;
      staleBefore: Date;
      signal?: AbortSignal;
    }) => Promise<{ enqueued: number; failed: number; exhausted: number }>;
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
    reapStalePending: (input: { staleAfterSeconds: number; limit: number }) => Promise<{ rolledBack: number }>;
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

export interface UserDocumentRepairOptions {
  staleBefore?: Date;
  limit?: number;
  signal?: AbortSignal;
  retryPostPublication?: { userId: number; version: string };
  force?: boolean;
}

export interface SubjectAccessRepairDependencies {
  subjectAccessRepair: UserDocumentRepairDependencies["subjectAccessRepair"];
  subjectAccessRepairBacklog: UserDocumentRepairDependencies["subjectAccessRepairBacklog"];
  subjectAccessTransitionReaper: {
    reapStalePending: (input: { staleAfterSeconds: number; limit: number }) => Promise<{ rolledBack: number }>;
  };
  subjectAccessTransitionRecovery: UserDocumentRepairDependencies["subjectAccessTransitionRecovery"];
  logger: UserDocumentRepairDependencies["logger"];
  config: Pick<UserDocumentRepairDependencies["config"], "limit"> & {
    transitionStaleSeconds: number;
  };
}

export async function repairSubjectAccess(
  deps: SubjectAccessRepairDependencies,
  options: Pick<UserDocumentRepairOptions, "limit" | "signal"> = {},
) {
  options.signal?.throwIfAborted();
  const limit = options.limit ?? deps.config.limit;
  deps.logger.info(
    {
      limit,
      staleAfterSeconds: deps.config.transitionStaleSeconds,
    },
    "Subject Access stale transition intent reap started",
  );
  const transitionReap = await deps.subjectAccessTransitionReaper.reapStalePending({
    staleAfterSeconds: deps.config.transitionStaleSeconds,
    limit,
  });
  options.signal?.throwIfAborted();
  deps.logger.info(
    {
      ...transitionReap,
      limit,
      staleAfterSeconds: deps.config.transitionStaleSeconds,
    },
    "Subject Access stale transition intents reaped",
  );
  await observeRepairBacklog(deps, "before-processing");
  options.signal?.throwIfAborted();
  const transitionRecovery = await deps.subjectAccessTransitionRecovery.recoverPending({ limit });
  deps.logger.info(
    {
      ...transitionRecovery,
      limit,
    },
    "Subject Access transition recovery backlog processed",
  );
  options.signal?.throwIfAborted();
  const subjectAccess = await deps.subjectAccessRepair.repairPending({ limit });
  options.signal?.throwIfAborted();
  await observeRepairBacklog(deps, "after-processing", {
    ...subjectAccess,
    limit,
  });
  options.signal?.throwIfAborted();
  return { subjectAccess, transitionReap, transitionRecovery };
}

export async function repairUserDocument(
  deps: UserDocumentRepairDependencies,
  options: UserDocumentRepairOptions = {},
) {
  options.signal?.throwIfAborted();
  if (options.force && options.retryPostPublication)
    throw new RangeError("force cannot be combined with a targeted post-publication retry");
  const staleBefore =
    options.staleBefore ?? new Date(deps.clock.nowDate().getTime() - deps.config.repairStaleSeconds * 1000);
  const limit = options.limit ?? deps.config.limit;
  const retryPostPublication = deps.maintenance.retryPostPublication;
  if (options.retryPostPublication && !retryPostPublication)
    throw new Error("Explicit User Document post-publication retry is unavailable");
  deps.logger.info(
    {
      limit,
      staleAfterSeconds: deps.config.transitionStaleSeconds,
    },
    "Subject Access stale transition intent reap started",
  );
  const transitionReap = await deps.subjectAccessTransitionReaper.reapStalePending({
    staleAfterSeconds: deps.config.transitionStaleSeconds,
    limit,
  });
  options.signal?.throwIfAborted();
  deps.logger.info(
    {
      ...transitionReap,
      limit,
      staleAfterSeconds: deps.config.transitionStaleSeconds,
    },
    "Subject Access stale transition intents reaped",
  );
  await observeRepairBacklog(deps, "before-processing");
  options.signal?.throwIfAborted();
  const transitionRecovery = await deps.subjectAccessTransitionRecovery.recoverPending({ limit });
  options.signal?.throwIfAborted();
  const [result, subjectAccess] = await Promise.all([
    options.retryPostPublication && retryPostPublication
      ? retryPostPublication({
          ...options.retryPostPublication,
          staleBefore,
          ...(options.signal ? { signal: options.signal } : {}),
        })
      : deps.maintenance.repairFailedOrStale({
          staleBefore,
          limit,
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.force ? { force: true } : {}),
        }),
    deps.subjectAccessRepair.repairPending({ limit }),
  ]);
  options.signal?.throwIfAborted();
  deps.logger.info(
    {
      ...result,
      publication: "not-verified",
      staleBefore: staleBefore.toISOString(),
      limit,
      ...(options.force ? { force: true } : {}),
    },
    "User Document repair wakeups finished; wait for publication and run verification",
  );
  deps.logger.info(
    {
      ...transitionRecovery,
      limit,
    },
    "Subject Access transition recovery backlog processed",
  );
  options.signal?.throwIfAborted();
  await observeRepairBacklog(deps, "after-processing", {
    ...subjectAccess,
    limit,
  });
  if ((result.failed ?? 0) > 0 || (result.exhausted ?? 0) > 0)
    throw new Error("User Document repair remains incomplete");
  return {
    ...result,
    subjectAccess,
    transitionReap,
    transitionRecovery,
  };
}

type RepairBacklogObservationDeps = Pick<SubjectAccessRepairDependencies, "logger" | "subjectAccessRepairBacklog">;

async function observeRepairBacklog(
  deps: RepairBacklogObservationDeps,
  phase: "before-processing" | "after-processing",
  data: Record<string, unknown> = {},
) {
  try {
    const backlog = await deps.subjectAccessRepairBacklog.inspectRepairBacklog();
    deps.logger.info(
      {
        ...data,
        repairBacklogCount: backlog.count,
        repairBacklogOldestAgeMs: backlog.oldestAgeMs,
      },
      phase === "before-processing"
        ? "Subject Access repair backlog observed before processing"
        : "Subject Access repair backlog processed",
    );
  } catch {
    deps.logger.info(
      {
        ...data,
        repairBacklogMetricsAvailable: false,
        repairBacklogPhase: phase,
      },
      "Subject Access repair backlog observation unavailable",
    );
  }
}
