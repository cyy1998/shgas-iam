import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createUnitOfWork } from "@iam/api-core/uow";
import { createOrganizationDocumentInvalidation } from "../../src/producer";
import { createOrganizationDocumentQueryRepository, createOrganizationDocumentQueryService } from "../../src/query";
import type { OrganizationOutboxJobPayload, OrganizationRebuildJobPayload } from "../../src/work.types";
import { createOrganizationDocumentProcessor } from "../../src/worker";
import { createOrganizationDocumentPostgresTestHarness } from "../support/postgres-test-harness";

let harness: Awaited<ReturnType<typeof createOrganizationDocumentPostgresTestHarness>>;
beforeAll(async () => {
  harness = await createOrganizationDocumentPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

function work() {
  const sourceJobs: OrganizationOutboxJobPayload[] = [];
  const rebuildJobs: OrganizationRebuildJobPayload[] = [];
  const processor = createOrganizationDocumentProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueOutboxEntries(payloads) {
        sourceJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        rebuildJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  return { processor, sourceJobs, rebuildJobs };
}

test("repair recovers a committed subtree change whose wakeup never reached the queue", async () => {
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type)
    VALUES (1,'ROOT','Root',-1,'/1',1,'部门'), (2,'CHILD','Child',1,'/1/2',2,'部门')`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0),(1,2,1),(2,2,0)`;
  const { processor, sourceJobs, rebuildJobs } = work();
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs.splice(0)) await processor.processOutbox(payload);
  for (const payload of rebuildJobs.splice(0)) await processor.processRebuild(payload);
  const uow = createUnitOfWork({
    db: harness.db,
    logger: { warn() {}, error() {} },
    createTxPorts(db, lifecycle) {
      return {
        db,
        invalidation: createOrganizationDocumentInvalidation({
          db,
          lifecycle,
          jobProducer: {
            async enqueueOutboxEntries() {
              throw new Error("queue unavailable");
            },
          },
        }),
      };
    },
  });
  await uow.transaction(async ({ db, invalidation }) => {
    await db.execute("UPDATE organization SET org_name='Recovered root' WHERE id=1");
    await invalidation.recordChanges([{ kind: "updated", organizationId: 1, changedFields: ["name"] }]);
  });
  const repair = await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
  for (const payload of sourceJobs.splice(0)) await processor.processOutbox(payload);
  // Lose the second-stage wakeup too: persisted dirty work remains recoverable independently.
  rebuildJobs.splice(0);
  const documents = await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
  for (const payload of rebuildJobs.splice(0)) await processor.processRebuild(payload);
  const query = createOrganizationDocumentQueryService({
    repository: createOrganizationDocumentQueryRepository(harness.db),
  });
  const result = await query.search({ filter: { field: "code", op: "eq", value: "CHILD" } });
  const versions =
    await harness.sql`SELECT version,status FROM organization_document_rebuild_state ORDER BY organization_id`;
  expect(repair.outbox).toEqual({ selected: 1, enqueued: 1, failed: 0 });
  expect(documents.rebuilds).toEqual({ selected: 2, enqueued: 2, failed: 0 });
  expect(result[0]?.path).toMatchObject([{ name: "Recovered root" }, { name: "Child" }]);
  expect([...versions]).toEqual([
    { version: "2", status: "processed" },
    { version: "2", status: "processed" },
  ]);
});
