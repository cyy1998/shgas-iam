import type { JobQueue } from "@iam/jobs";
import {
  ORGANIZATION_REBUILD_JOB_NAME,
  ORGANIZATION_SOURCE_CHANGE_JOB_NAME,
  OrganizationRebuildJobPayloadSchema,
  OrganizationSourceChangeJobPayloadSchema,
} from "@iam/organization-search-read-model/worker";
import type { WorkerPostgresTestHarness } from "../postgres/postgres-test-harness";

// The formal commands use the shared default queue. A fixture owns its random-schema
// change UUIDs and recorded organization/version receipts, not the queue namespace.
// Capture actual random job IDs while this fixture dispatches/consumes. Baseline IDs
// are never claimed; sealing prevents later arrivals (even equal payloads) being claimed.
export async function createOrganizationQueueInventory(queue: JobQueue, sql: WorkerPostgresTestHarness["sql"]) {
  const baseline = new Set((await queue.getJobs()).map((job) => job.id));
  const ownedIds = new Set<string>();
  let sealed = false;

  async function registerCurrentJobs() {
    if (sealed) throw new Error("Organization job inventory is sealed");
    const changes = await sql<{ id: string; rebuild_requests: unknown[] }[]>`
      SELECT id,rebuild_requests FROM organization_search_change`;
    const dirty = await sql<{ organization_id: number; version: string }[]>`
      SELECT organization_id,version FROM organization_search_dirty`;
    const changeIds = new Set(changes.map((change) => change.id));
    const rebuilds = new Set(dirty.map((row) => `${row.organization_id}/${row.version}`));
    for (const change of changes) {
      for (const request of change.rebuild_requests) {
        const payload = OrganizationRebuildJobPayloadSchema.parse(request);
        rebuilds.add(`${payload.organizationId}/${payload.version}`);
      }
    }
    for (const job of await queue.getJobs()) {
      if (!job.id || baseline.has(job.id)) continue;
      const source = OrganizationSourceChangeJobPayloadSchema.safeParse(job.data);
      const rebuild = OrganizationRebuildJobPayloadSchema.safeParse(job.data);
      if (
        (job.name === ORGANIZATION_SOURCE_CHANGE_JOB_NAME && source.success && changeIds.has(source.data.changeId)) ||
        (job.name === ORGANIZATION_REBUILD_JOB_NAME &&
          rebuild.success &&
          rebuilds.has(`${rebuild.data.organizationId}/${rebuild.data.version}`))
      )
        ownedIds.add(job.id);
    }
  }

  async function seal() {
    if (sealed) return;
    await registerCurrentJobs();
    sealed = true;
  }

  async function removeOwnedJobs() {
    if (!sealed) throw new Error("Stop fixture consumers and seal the job inventory before cleanup");
    const failures: unknown[] = [];
    const deadline = Date.now() + 35_000;
    for (const id of ownedIds) {
      try {
        const job = await queue.getJob(id);
        if (!job) continue;
        // A killed child can leave its own BullMQ lock until the normal 30s TTL.
        // Wait for that exact lock within a deadline; never delete locks or force the queue.
        while (true) {
          try {
            // BullMQ removes only this job's index memberships. Shared meta/events/id and
            // whole wait/completed/delayed keys belong to the queue and are never reset here.
            await job.remove({ removeChildren: false });
            break;
          } catch (error) {
            const locked =
              error instanceof Error &&
              error.message === `Job ${id} could not be removed because it is locked by another worker`;
            if (!locked || Date.now() >= deadline) throw error;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        `Owned organization job cleanup failed; registered IDs: ${[...ownedIds].join(",")}`,
      );
  }

  return { registerCurrentJobs, seal, removeOwnedJobs, registeredJobIds: () => [...ownedIds] };
}
