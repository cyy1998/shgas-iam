import type { db as database } from "@iam/db";
import { organizationSearchChanges, organizationSearchDirty } from "@iam/db/schema";
import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import type { OrganizationSearchClock, OrganizationSearchJobProducerPort } from "../work.types";

export interface OrganizationSearchRepairOptions {
  staleBefore: Date;
  limit: number;
  signal?: AbortSignal;
}

export interface OrganizationSearchRepairStageReport {
  selected: number;
  enqueued: number;
  failed: number;
}

export interface OrganizationSearchRepairReport {
  sourceChanges: OrganizationSearchRepairStageReport;
  rebuilds: OrganizationSearchRepairStageReport;
  enqueued: number;
  failed: number;
}

export async function repairOrganizationSearch(
  input: {
    db: typeof database;
    jobProducer: OrganizationSearchJobProducerPort;
    clock: OrganizationSearchClock;
  },
  options: OrganizationSearchRepairOptions,
): Promise<OrganizationSearchRepairReport> {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || !Number.isFinite(options.staleBefore.getTime()))
    throw new RangeError("Organization Search repair requires a valid staleBefore and positive safe limit");
  options.signal?.throwIfAborted();
  const work = await input.db.transaction(async (tx) => {
    const changes = await tx
      .select({ changeId: organizationSearchChanges.id })
      .from(organizationSearchChanges)
      .where(
        or(
          inArray(organizationSearchChanges.status, ["pending", "failed"]),
          and(
            eq(organizationSearchChanges.status, "processing"),
            lt(organizationSearchChanges.processingStartedAt, options.staleBefore),
          ),
        ),
      )
      .orderBy(asc(organizationSearchChanges.createdAt), asc(organizationSearchChanges.id))
      .limit(options.limit)
      .for("update", { skipLocked: true });
    const rebuilds = await tx
      .select({ organizationId: organizationSearchDirty.organizationId, version: organizationSearchDirty.version })
      .from(organizationSearchDirty)
      .where(
        or(
          inArray(organizationSearchDirty.status, ["pending", "failed"]),
          and(
            eq(organizationSearchDirty.status, "processing"),
            lt(organizationSearchDirty.processingStartedAt, options.staleBefore),
          ),
        ),
      )
      .orderBy(asc(organizationSearchDirty.dirtyAt), asc(organizationSearchDirty.organizationId))
      .limit(options.limit)
      .for("update", { skipLocked: true });
    options.signal?.throwIfAborted();
    const reset = {
      status: "pending" as const,
      processingToken: null,
      processingStartedAt: null,
      updatedAt: input.clock.nowDate(),
    };
    // Clear abandoned ownership without changing the desired version or diagnostics.
    // The next normal claim creates a new token, fencing same-version late processors.
    if (changes.length)
      await tx
        .update(organizationSearchChanges)
        .set(reset)
        .where(
          inArray(
            organizationSearchChanges.id,
            changes.map(({ changeId }) => changeId),
          ),
        );
    if (rebuilds.length)
      await tx
        .update(organizationSearchDirty)
        .set(reset)
        .where(
          inArray(
            organizationSearchDirty.organizationId,
            rebuilds.map(({ organizationId }) => organizationId),
          ),
        );
    return { changes, rebuilds };
  });
  async function wake(
    selected: number,
    enqueue: () => Promise<{ enqueued: number }>,
  ): Promise<OrganizationSearchRepairStageReport> {
    options.signal?.throwIfAborted();
    if (!selected) return { selected: 0, enqueued: 0, failed: 0 };
    try {
      const { enqueued } = await enqueue();
      options.signal?.throwIfAborted();
      return { selected, enqueued, failed: selected - enqueued };
    } catch {
      options.signal?.throwIfAborted();
      return { selected, enqueued: 0, failed: selected };
    }
  }
  const sourceChanges = await wake(work.changes.length, () => input.jobProducer.enqueueSourceChanges(work.changes));
  const rebuilds = await wake(work.rebuilds.length, () => input.jobProducer.enqueueRebuilds(work.rebuilds));
  return {
    sourceChanges,
    rebuilds,
    enqueued: sourceChanges.enqueued + rebuilds.enqueued,
    failed: sourceChanges.failed + rebuilds.failed,
  };
}
