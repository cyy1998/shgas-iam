import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createUnitOfWork } from "@iam/api-core/uow";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import type { DbTransaction } from "@iam/db";
import { sql } from "drizzle-orm";
import { createOrganizationSearchInvalidation, type OrganizationSearchSourceChange } from "../../src/producer";
import type { OrganizationRebuildJobPayload, OrganizationSourceChangeJobPayload } from "../../src/work.types";
import { createOrganizationSearchProcessor } from "../../src/worker";
import {
  createOrganizationSearchPostgresTestHarness,
  type OrganizationSearchPostgresTestHarness,
} from "./postgres-test-harness";

let harness: OrganizationSearchPostgresTestHarness;
beforeAll(async () => {
  harness = await createOrganizationSearchPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

test("backfill publishes an independent organization and its complete ordered path through normal work", async () => {
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type, status)
    VALUES (1, 'ROOT', 'Root', -1, '/1', 1, ${OrganizationType.Department}, ${OrganizationStatus.Pause}),
      (2, 'CHILD', 'Child', 1, '/1/2', 2, ${OrganizationType.Department}, ${OrganizationStatus.Disable})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (1,1,0), (1,2,1), (2,2,0)`;
  const { processor, sourceJobs, rebuildJobs } = createProcessor();

  const backfill = await processor.backfillAllOrganizations({ batchSize: 1 });
  for (const payload of sourceJobs) await processor.processSourceChange(payload);
  for (const payload of rebuildJobs) await processor.processRebuild(payload);
  const rows =
    await harness.sql`SELECT document, source_version, search_visible FROM organization_search_document ORDER BY organization_id`;
  const pending = await harness.sql`SELECT status FROM organization_search_dirty ORDER BY organization_id`;

  expect(backfill).toMatchObject({ registered: 2, enqueued: 2 });
  expect(rows[1]).toMatchObject({
    source_version: "1",
    search_visible: true,
    document: {
      organization: {
        code: "CHILD",
        name: "Child",
        type: OrganizationType.Department,
        status: OrganizationStatus.Disable,
        level: 2,
        isVirtual: false,
        isEntity: false,
        path: [
          { code: "ROOT", name: "Root", type: OrganizationType.Department, level: 1, distanceToTarget: 1 },
          { code: "CHILD", name: "Child", type: OrganizationType.Department, level: 2, distanceToTarget: 0 },
        ],
      },
    },
  });
  expect([...pending]).toEqual([{ status: "processed" }, { status: "processed" }]);
});

function createProcessor() {
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

test("source writes and change registration roll back together without delivering wakeups", async () => {
  const sourceJobs: OrganizationSourceChangeJobPayload[] = [];
  const uow = createSourceUnitOfWork(sourceJobs);
  let failure: unknown;
  try {
    await uow.transaction(async ({ sourceDb, invalidation }) => {
      await sourceDb.execute(
        "INSERT INTO organization (id, org_code, org_name, path, level, org_type) VALUES (1, 'ROLLED', 'Rolled', '/1', 1, '部门')",
      );
      await invalidation.recordChanges([{ kind: "created", organizationId: 1 }]);
      throw new Error("source transaction rejected");
    });
  } catch (error) {
    failure = error;
  }
  const source = await harness.sql`SELECT id FROM organization`;
  const changes = await harness.sql`SELECT id FROM organization_search_change`;

  expect(failure).toBeInstanceOf(Error);
  expect([...source]).toEqual([]);
  expect([...changes]).toEqual([]);
  expect(sourceJobs).toEqual([]);
});

test("path changes expand the committed subtree and duplicate event delivery never advances work again", async () => {
  await seedTree();
  const { processor, sourceJobs, rebuildJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  await drain(processor, sourceJobs, rebuildJobs);
  await recordChange(
    [{ kind: "updated", organizationId: 1, changedFields: ["name"] }],
    sourceJobs,
    async (sourceDb) => {
      await sourceDb.execute(sql`UPDATE organization SET org_name = 'Renamed root' WHERE id = 1`);
    },
  );
  const payload = sourceJobs.at(-1)!;
  const expansion = await processor.processSourceChange(payload);
  const repeated = await processor.processSourceChange(payload);
  for (const rebuild of rebuildJobs) await processor.processRebuild(rebuild);
  const row =
    await harness.sql`SELECT document, source_version FROM organization_search_document WHERE organization_id = 2`;
  const dirty = await harness.sql`SELECT version FROM organization_search_dirty ORDER BY organization_id`;

  expect(expansion).toMatchObject({ status: "expanded", registered: 2 });
  expect(repeated).toEqual({ status: "replayed" });
  expect(row[0]).toMatchObject({
    source_version: "2",
    document: {
      organization: {
        path: [
          { code: "ROOT", name: "Renamed root" },
          { code: "CHILD", name: "Child" },
        ],
      },
    },
  });
  expect(dirty.map(({ version }) => version)).toEqual(["2", "2"]);
});

test("newer deletion publication retains its version and rejects a late visible candidate", async () => {
  await seedTree();
  const { processor, sourceJobs, rebuildJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs) await processor.processSourceChange(payload);
  const oldCandidate = await processor.prepareRebuild({ organizationId: 2, version: "1" });
  expect(oldCandidate).not.toBeNull();
  await recordChange([{ kind: "deleted", organizationId: 2 }], sourceJobs, async (sourceDb) => {
    await sourceDb.execute(sql`UPDATE organization SET is_delete = TRUE WHERE id = 2`);
  });
  await processor.processSourceChange(sourceJobs.at(-1)!);
  const removed = await processor.processRebuild({ organizationId: 2, version: "2" });
  const late = await processor.publishPrepared(oldCandidate!);
  const rows =
    await harness.sql`SELECT document, search_visible, source_version FROM organization_search_document WHERE organization_id = 2`;
  const dirty = await harness.sql`SELECT version, status FROM organization_search_dirty WHERE organization_id = 2`;

  expect(removed).toEqual({ status: "published" });
  expect(late).toEqual({ status: "stale" });
  expect(rows[0]).toMatchObject({ document: null, search_visible: false, source_version: "2" });
  expect(dirty[0]).toMatchObject({ version: "2", status: "processed" });
});

test("a reclaimed same-version build rejects the previous ownership token", async () => {
  await seedTree();
  const { processor, sourceJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs) await processor.processSourceChange(payload);
  const previous = await processor.prepareRebuild({ organizationId: 2, version: "1" });
  // A recovery operator has returned the abandoned claim to pending without changing the desired version.
  await harness.sql`UPDATE organization_search_dirty SET status='pending', processing_token=NULL, processing_started_at=NULL WHERE organization_id=2`;
  const replacement = await processor.prepareRebuild({ organizationId: 2, version: "1" });
  const stale = await processor.publishPrepared(previous!);
  const published = await processor.publishPrepared(replacement!);
  const row = await harness.sql`SELECT source_version FROM organization_search_document WHERE organization_id=2`;

  expect(stale).toEqual({ status: "stale" });
  expect(published).toEqual({ status: "published" });
  expect(row[0]?.source_version).toBe("1");
});

test("broken source paths fail rebuilding while retaining the last legal published document", async () => {
  await seedTree();
  const { processor, sourceJobs, rebuildJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  await drain(processor, sourceJobs, rebuildJobs);
  await harness.sql`DELETE FROM organization_closure WHERE ancestor_id=1 AND descendant_id=2`;
  await recordChange([{ kind: "updated", organizationId: 2, changedFields: ["status"] }], sourceJobs);
  await processor.processSourceChange(sourceJobs.at(-1)!);
  let failure: unknown;
  try {
    await processor.processRebuild({ organizationId: 2, version: "2" });
  } catch (error) {
    failure = error;
  }
  const row =
    await harness.sql`SELECT document, source_version FROM organization_search_document WHERE organization_id=2`;
  const dirty =
    await harness.sql`SELECT version, status, processing_token FROM organization_search_dirty WHERE organization_id=2`;

  expect(failure).toBeInstanceOf(Error);
  expect(row[0]).toMatchObject({
    source_version: "1",
    document: { organization: { code: "CHILD", path: [{ code: "ROOT" }, { code: "CHILD" }] } },
  });
  expect(dirty[0]).toMatchObject({ version: "2", status: "failed", processing_token: null });
});

test("expansion failure atomically rolls back every version and leaves the source change retryable", async () => {
  await seedTree();
  const { processor, sourceJobs, rebuildJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  await drain(processor, sourceJobs, rebuildJobs);
  await recordChange(
    [{ kind: "updated", organizationId: 1, changedFields: ["name"] }],
    sourceJobs,
    async (sourceDb) => {
      await sourceDb.execute(sql`UPDATE organization SET org_name='New root' WHERE id=1`);
    },
  );
  await harness.sql.unsafe(`CREATE FUNCTION reject_expansion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.organization_id=2 THEN RAISE EXCEPTION 'controlled expansion failure'; END IF; RETURN NEW; END $$`);
  await harness.sql.unsafe(
    "CREATE TRIGGER reject_expansion BEFORE INSERT OR UPDATE ON organization_search_dirty FOR EACH ROW EXECUTE FUNCTION reject_expansion()",
  );
  let failure: unknown;
  try {
    await processor.processSourceChange(sourceJobs.at(-1)!);
  } catch (error) {
    failure = error;
  }
  const dirtyBeforeRetry = await harness.sql`SELECT version FROM organization_search_dirty ORDER BY organization_id`;
  const change =
    await harness.sql`SELECT status FROM organization_search_change WHERE id=${sourceJobs.at(-1)!.changeId}`;
  await harness.sql.unsafe("DROP TRIGGER reject_expansion ON organization_search_dirty");
  await harness.sql.unsafe("DROP FUNCTION reject_expansion()");
  const retry = await processor.processSourceChange(sourceJobs.at(-1)!);
  for (const payload of rebuildJobs) await processor.processRebuild(payload);
  const final =
    await harness.sql`SELECT document,source_version FROM organization_search_document WHERE organization_id=2`;

  expect(failure).toBeInstanceOf(Error);
  expect(dirtyBeforeRetry.map(({ version }) => version)).toEqual(["1", "1"]);
  expect(change[0]?.status).toBe("failed");
  expect(retry).toMatchObject({ status: "expanded", registered: 2 });
  expect(final[0]).toMatchObject({
    source_version: "2",
    document: { organization: { path: [{ name: "New root" }, { name: "Child" }] } },
  });
});

test("normal build reads target and ancestors from one consistent source snapshot", async () => {
  await seedTree();
  const { processor, sourceJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs) await processor.processSourceChange(payload);
  const blocker = await harness.sql.reserve();
  let preparedPromise: ReturnType<typeof processor.prepareRebuild> | undefined;
  try {
    await blocker.unsafe("BEGIN");
    await blocker.unsafe("LOCK TABLE organization_closure IN ACCESS EXCLUSIVE MODE");
    preparedPromise = processor.prepareRebuild({ organizationId: 2, version: "1" });
    const deadline = Date.now() + 2000;
    while (true) {
      const rows =
        await harness.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name LIKE 'iam_organization_search_%'
        AND wait_event_type='Lock' AND query LIKE '%organization_closure%') AS blocked`;
      if (rows[0]?.blocked === true) break;
      if (Date.now() > deadline) throw new Error("Build did not reach the controlled closure read");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await harness.sql`UPDATE organization SET org_name=CASE WHEN id=1 THEN 'Concurrent root' ELSE 'Concurrent child' END WHERE id IN (1,2)`;
    await blocker.unsafe("COMMIT");
    const prepared = await preparedPromise;
    expect(prepared?.document).toMatchObject({
      organization: { name: "Child", path: [{ name: "Root" }, { name: "Child" }] },
    });
  } finally {
    await blocker.unsafe("ROLLBACK");
    blocker.release();
    await preparedPromise;
  }
});

async function seedTree() {
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type)
    VALUES (1, 'ROOT', 'Root', -1, '/1', 1, ${OrganizationType.Department}), (2, 'CHILD', 'Child', 1, '/1/2', 2, ${OrganizationType.Department})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (1,1,0), (1,2,1), (2,2,0)`;
}

function createSourceUnitOfWork(sourceJobs: OrganizationSourceChangeJobPayload[]) {
  return createUnitOfWork({
    db: harness.db,
    logger: { warn() {}, error() {} },
    createTxPorts(sourceDb, lifecycle) {
      return {
        sourceDb,
        invalidation: createOrganizationSearchInvalidation({
          db: sourceDb,
          lifecycle,
          jobProducer: {
            async enqueueSourceChanges(payloads) {
              sourceJobs.push(...payloads);
              return { enqueued: payloads.length };
            },
          },
        }),
      };
    },
  });
}

async function recordChange(
  changes: OrganizationSearchSourceChange[],
  sourceJobs: OrganizationSourceChangeJobPayload[],
  sourceWrite?: (db: DbTransaction) => Promise<void>,
) {
  const uow = createSourceUnitOfWork(sourceJobs);
  await uow.transaction(async ({ sourceDb, invalidation }) => {
    await sourceWrite?.(sourceDb);
    await invalidation.recordChanges(changes);
  });
}

async function drain(
  processor: ReturnType<typeof createOrganizationSearchProcessor>,
  sourceJobs: OrganizationSourceChangeJobPayload[],
  rebuildJobs: OrganizationRebuildJobPayload[],
) {
  for (const payload of sourceJobs) await processor.processSourceChange(payload);
  for (const payload of rebuildJobs) await processor.processRebuild(payload);
}
