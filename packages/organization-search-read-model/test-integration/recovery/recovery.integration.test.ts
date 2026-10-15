import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createUnitOfWork } from "@iam/api-core/uow";
import { createOrganizationSearchInvalidation } from "../../src/producer";
import { createOrganizationSearchQueryRepository, createOrganizationSearchQueryService } from "../../src/query";
import type { OrganizationRebuildJobPayload, OrganizationSourceChangeJobPayload } from "../../src/work.types";
import { createOrganizationSearchProcessor } from "../../src/worker";
import { createOrganizationSearchPostgresTestHarness } from "../support/postgres-test-harness";

let harness: Awaited<ReturnType<typeof createOrganizationSearchPostgresTestHarness>>;
beforeAll(async () => {
  harness = await createOrganizationSearchPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

function work() {
  const sourceJobs: OrganizationSourceChangeJobPayload[] = [];
  const rebuildJobs: OrganizationRebuildJobPayload[] = [];
  const processor = createOrganizationSearchProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueSourceChanges(payloads) {
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
  for (const payload of sourceJobs.splice(0)) await processor.processSourceChange(payload);
  for (const payload of rebuildJobs.splice(0)) await processor.processRebuild(payload);
  const uow = createUnitOfWork({
    db: harness.db,
    logger: { warn() {}, error() {} },
    createTxPorts(db, lifecycle) {
      return {
        db,
        invalidation: createOrganizationSearchInvalidation({
          db,
          lifecycle,
          jobProducer: {
            async enqueueSourceChanges() {
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
  for (const payload of sourceJobs.splice(0)) await processor.processSourceChange(payload);
  // Lose the second-stage wakeup too: persisted dirty work remains recoverable independently.
  rebuildJobs.splice(0);
  const documents = await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
  for (const payload of rebuildJobs.splice(0)) await processor.processRebuild(payload);
  const query = createOrganizationSearchQueryService({
    repository: createOrganizationSearchQueryRepository(harness.db),
  });
  const result = await query.search({ filter: { field: "organization.code", op: "eq", value: "CHILD" } });
  const versions = await harness.sql`SELECT version,status FROM organization_search_dirty ORDER BY organization_id`;
  expect(repair.sourceChanges).toEqual({ selected: 1, enqueued: 1, failed: 0 });
  expect(documents.rebuilds).toEqual({ selected: 2, enqueued: 2, failed: 0 });
  expect(result[0]?.organization.path).toMatchObject([{ name: "Recovered root" }, { name: "Child" }]);
  expect([...versions]).toEqual([
    { version: "2", status: "processed" },
    { version: "2", status: "processed" },
  ]);
});

test("repair reclaims interrupted builds without letting a same-version late candidate consume replacement work", async () => {
  await harness.sql`INSERT INTO organization (id,org_code,org_name,path,level,org_type) VALUES (1,'ROOT','Root','/1',1,'部门')`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0)`;
  const { processor, sourceJobs, rebuildJobs } = work();
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs.splice(0)) await processor.processSourceChange(payload);
  const previous = await processor.prepareRebuild(rebuildJobs[0]!);
  const active = await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 10 });
  const reclaimed = await processor.repairFailedOrStale({ staleBefore: new Date(Date.now() + 1_000), limit: 10 });
  const replacement = await processor.prepareRebuild(rebuildJobs.at(-1)!);
  const late = await processor.publishPrepared(previous!);
  const current = await processor.publishPrepared(replacement!);
  const repeated = await processor.repairFailedOrStale({ staleBefore: new Date(Date.now() + 1_000), limit: 10 });
  const rows = await harness.sql`SELECT source_version FROM organization_search_document`;
  expect(active.enqueued).toBe(0);
  expect(reclaimed.rebuilds).toEqual({ selected: 1, enqueued: 1, failed: 0 });
  expect(late).toEqual({ status: "stale" });
  expect(current).toEqual({ status: "published" });
  expect(repeated.enqueued).toBe(0);
  expect(rows[0]?.source_version).toBe("1");
});

test("repair retains diagnostics and all persistent work when both stage wakeups fail", async () => {
  await harness.sql`INSERT INTO organization_search_change (id,organization_id,scope,status,last_error,attempts)
    VALUES ('00000000-0000-4000-8000-000000000001',1,'subtree','failed','expansion failed',3)`;
  await harness.sql`INSERT INTO organization_search_dirty (organization_id,version,status,last_error,attempts)
    VALUES (1,7,'failed','build failed',3)`;
  const processor = createOrganizationSearchProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueSourceChanges() {
        throw new Error("source queue unavailable");
      },
      async enqueueRebuilds() {
        throw new Error("rebuild queue unavailable");
      },
    },
  });
  const report = await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 1 });
  const source = await harness.sql`SELECT scope,status,last_error,attempts FROM organization_search_change`;
  const dirty = await harness.sql`SELECT version,status,last_error,attempts FROM organization_search_dirty`;
  expect(report).toEqual({
    enqueued: 0,
    failed: 2,
    sourceChanges: { selected: 1, enqueued: 0, failed: 1 },
    rebuilds: { selected: 1, enqueued: 0, failed: 1 },
  });
  expect(source[0]).toMatchObject({ scope: "subtree", status: "pending", last_error: "expansion failed", attempts: 3 });
  expect(dirty[0]).toMatchObject({ version: "7", status: "pending", last_error: "build failed", attempts: 3 });
});

test("repair skips a live expansion holding its source record lock", async () => {
  await harness.sql`INSERT INTO organization_search_change (id,organization_id,scope,status,processing_token,processing_started_at)
    VALUES ('00000000-0000-4000-8000-000000000001',1,'subtree','processing','00000000-0000-4000-8000-000000000002','2000-01-01')`;
  const blocker = await harness.sql.reserve();
  try {
    await blocker.unsafe("BEGIN");
    await blocker.unsafe("SELECT id FROM organization_search_change FOR UPDATE");
    const { processor } = work();
    const report = await processor.repairFailedOrStale({ staleBefore: new Date(), limit: 10 });
    expect(report.enqueued).toBe(0);
  } finally {
    await blocker.unsafe("ROLLBACK");
    blocker.release();
  }
});

test("a late source-change owner cannot consume or repeat expansion after repair reclaims the event", async () => {
  await harness.sql`INSERT INTO organization (id,org_code,org_name,path,level,org_type) VALUES (1,'ROOT','Root','/1',1,'部门')`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0)`;
  const { processor, sourceJobs } = work();
  await processor.backfillAllOrganizations();
  let reached!: () => void;
  const claimed = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let release!: () => void;
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayedDb = new Proxy(harness.db, {
    get(target, key, receiver) {
      if (key === "transaction")
        return async (...args: Parameters<typeof target.transaction>) => {
          reached();
          await resume;
          return await target.transaction(...args);
        };
      return Reflect.get(target, key, receiver);
    },
  });
  const previous = createOrganizationSearchProcessor({
    db: delayedDb,
    jobProducer: {
      async enqueueSourceChanges(payloads) {
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        return { enqueued: payloads.length };
      },
    },
  });
  const lateOperation = previous.processSourceChange(sourceJobs[0]!);
  try {
    await claimed;
    await processor.repairFailedOrStale({ staleBefore: new Date(Date.now() + 1000), limit: 10 });
    const replacement = await processor.processSourceChange(sourceJobs.at(-1)!);
    release();
    const late = await lateOperation;
    const published = await processor.processRebuild({ organizationId: 1, version: "1" });
    const states = await harness.sql`SELECT version,status FROM organization_search_dirty`;
    expect(replacement).toMatchObject({ status: "expanded", registered: 1 });
    expect(late).toEqual({ status: "stale" });
    expect(published).toEqual({ status: "published" });
    expect([...states]).toEqual([{ version: "1", status: "processed" }]);
  } finally {
    release();
    await lateOperation;
  }
});
