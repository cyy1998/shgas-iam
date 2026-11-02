import { parseArgs } from "node:util";
import { parseDocumentCommandDeadline, runDocumentCommandWithLifecycle } from "../document-command-lifecycle";

export interface UserDocumentRepairCommandDeps {
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

export interface UserDocumentRepairCommandOptions {
  staleBefore?: Date;
  limit?: number;
  signal?: AbortSignal;
  retryPostPublication?: { userId: number; version: string };
  force?: boolean;
}

export interface SubjectAccessRepairCommandDeps {
  subjectAccessRepair: UserDocumentRepairCommandDeps["subjectAccessRepair"];
  subjectAccessRepairBacklog: UserDocumentRepairCommandDeps["subjectAccessRepairBacklog"];
  subjectAccessTransitionReaper: {
    reapStalePending: (input: { staleAfterSeconds: number; limit: number }) => Promise<{ rolledBack: number }>;
  };
  subjectAccessTransitionRecovery: UserDocumentRepairCommandDeps["subjectAccessTransitionRecovery"];
  logger: UserDocumentRepairCommandDeps["logger"];
  config: Pick<UserDocumentRepairCommandDeps["config"], "limit"> & {
    transitionStaleSeconds: number;
  };
}

export async function runSubjectAccessRepairCommand(
  deps: SubjectAccessRepairCommandDeps,
  options: Pick<UserDocumentRepairCommandOptions, "limit"> = {},
) {
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
  deps.logger.info(
    {
      ...transitionReap,
      limit,
      staleAfterSeconds: deps.config.transitionStaleSeconds,
    },
    "Subject Access stale transition intents reaped",
  );
  await observeRepairBacklog(deps, "before-processing");
  const transitionRecovery = await deps.subjectAccessTransitionRecovery.recoverPending({ limit });
  deps.logger.info(
    {
      ...transitionRecovery,
      limit,
    },
    "Subject Access transition recovery backlog processed",
  );
  const subjectAccess = await deps.subjectAccessRepair.repairPending({ limit });
  await observeRepairBacklog(deps, "after-processing", {
    ...subjectAccess,
    limit,
  });
  return { subjectAccess, transitionReap, transitionRecovery };
}

export async function runUserDocumentRepairCommand(
  deps: UserDocumentRepairCommandDeps,
  options: UserDocumentRepairCommandOptions = {},
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
  deps.logger.info(
    {
      ...transitionReap,
      limit,
      staleAfterSeconds: deps.config.transitionStaleSeconds,
    },
    "Subject Access stale transition intents reaped",
  );
  await observeRepairBacklog(deps, "before-processing");
  const transitionRecovery = await deps.subjectAccessTransitionRecovery.recoverPending({ limit });
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

type RepairBacklogObservationDeps = Pick<SubjectAccessRepairCommandDeps, "logger" | "subjectAccessRepairBacklog">;

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

interface UserDocumentRepairCliOptions extends UserDocumentRepairCommandOptions {
  deadlineMs: number;
  subjectAccessOnly?: boolean;
}

export function parseUserDocumentRepairArgs(argv: string[]): UserDocumentRepairCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "stale-before": { type: "string" },
      limit: { type: "string" },
      "subject-access-only": { type: "boolean" },
      "deadline-ms": { type: "string" },
      "retry-user-id": { type: "string" },
      "retry-version": { type: "string" },
      force: { type: "boolean" },
    },
    strict: true,
  });

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  const staleBefore = values["stale-before"] === undefined ? undefined : new Date(values["stale-before"]);
  const retryUserId = values["retry-user-id"] === undefined ? undefined : Number(values["retry-user-id"]);
  const retryVersion = values["retry-version"];
  if (values.force && (retryUserId !== undefined || retryVersion !== undefined || values["subject-access-only"]))
    throw new RangeError("force cannot be combined with targeted retry or subject-access-only");
  if (
    (retryUserId === undefined) !== (retryVersion === undefined) ||
    (retryUserId !== undefined && (!Number.isSafeInteger(retryUserId) || retryUserId < 1)) ||
    (retryVersion !== undefined && !/^[1-9]\d*$/.test(retryVersion)) ||
    (retryUserId !== undefined && values["subject-access-only"])
  )
    throw new RangeError(
      "Explicit retry requires a positive retry-user-id and canonical retry-version without subject-access-only",
    );
  if (
    (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) ||
    (staleBefore !== undefined && !Number.isFinite(staleBefore.getTime()))
  )
    throw new RangeError("repair requires a positive safe limit and valid stale-before");
  return {
    deadlineMs: parseDocumentCommandDeadline(values["deadline-ms"]),
    staleBefore: values["stale-before"] === undefined ? undefined : new Date(values["stale-before"]),
    limit: values.limit === undefined ? undefined : Number(values.limit),
    subjectAccessOnly: values["subject-access-only"],
    ...(values.force ? { force: true } : {}),
    ...(retryUserId !== undefined && retryVersion !== undefined
      ? { retryPostPublication: { userId: retryUserId, version: retryVersion } }
      : {}),
  };
}

async function main() {
  const options = parseUserDocumentRepairArgs(process.argv.slice(2));
  const { parseUserDocumentCommandEnv } = await import("@worker/env");
  const env = parseUserDocumentCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createUserDocumentCommandComposition } = await import("@worker/composition/user-document-command");
  const composition = createUserDocumentCommandComposition({
    env,
    logger,
    deadlineMs: options.deadlineMs,
    subjectAccessOnly: options.subjectAccessOnly,
  });
  const subjectAccess = composition.subjectAccess;
  const deps = {
    subjectAccessRepairBacklog: subjectAccess.repairBacklog,
    subjectAccessRepair: subjectAccess.repair,
    subjectAccessTransitionReaper: subjectAccess.transitionReaper,
    subjectAccessTransitionRecovery: subjectAccess.transitionRecovery,
    logger,
    config: {
      limit: env.userDocument.backfillBatchSize,
      repairStaleSeconds: env.userDocument.repairStaleSeconds,
      transitionStaleSeconds: env.userDocument.repairStaleSeconds,
    },
  };
  const report = await runDocumentCommandWithLifecycle({
    deadlineMs: options.deadlineMs,
    shutdown: composition.shutdown,
    run: async (signal) => {
      await composition.connect();
      if (options.subjectAccessOnly) return await runSubjectAccessRepairCommand(deps, options);
      if (!composition.maintenance) throw new Error("User Document maintenance is required");
      return await runUserDocumentRepairCommand(
        { ...deps, maintenance: composition.maintenance, clock: composition.clock },
        { ...options, signal },
      );
    },
  });
  if (report.subjectAccess.failed || report.transitionRecovery.failed) process.exitCode = 1;
}
if (import.meta.main) {
  try {
    await main();
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write("User Document repair failed; durable work remains for retry.\n");
  }
}
