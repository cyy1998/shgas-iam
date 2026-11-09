import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import type { DbTransaction } from "@iam/db";
import { createUnitOfWork } from "@iam/unit-of-work";
import { sql } from "drizzle-orm";
import { createOrganizationDocumentInvalidation, type OrganizationDocumentSourceChange } from "../../src/producer";
import type { OrganizationOutboxJobPayload, OrganizationRebuildJobPayload } from "../../src/work.types";
import { createOrganizationDocumentProcessor } from "../../src/worker";
import {
  createOrganizationDocumentPostgresTestHarness,
  type OrganizationDocumentPostgresTestHarness,
} from "../support/postgres-test-harness";

let harness: OrganizationDocumentPostgresTestHarness;
beforeAll(async () => {
  harness = await createOrganizationDocumentPostgresTestHarness();
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
  for (const payload of sourceJobs) await processor.processOutbox(payload);
  for (const payload of rebuildJobs) await processor.processRebuild(payload);
  const rows =
    await harness.sql`SELECT document, source_version, search_visible FROM organization_document ORDER BY organization_id`;
  const pending = await harness.sql`SELECT status FROM organization_document_rebuild_state ORDER BY organization_id`;

  expect(backfill).toMatchObject({ registered: 2, enqueued: 2 });
  expect(rows[1]).toMatchObject({
    source_version: "1",
    search_visible: true,
    document: {
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
  });
  expect([...pending]).toEqual([{ status: "processed" }, { status: "processed" }]);
});

function createProcessor() {
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

test("source writes and change registration roll back together without delivering wakeups", async () => {
  const sourceJobs: OrganizationOutboxJobPayload[] = [];
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
  const changes = await harness.sql`SELECT id FROM organization_document_outbox`;

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
  const expansion = await processor.processOutbox(payload);
  const repeated = await processor.processOutbox(payload);
  for (const rebuild of rebuildJobs) await processor.processRebuild(rebuild);
  const row = await harness.sql`SELECT document, source_version FROM organization_document WHERE organization_id = 2`;
  const dirty = await harness.sql`SELECT version FROM organization_document_rebuild_state ORDER BY organization_id`;

  expect(expansion).toMatchObject({ status: "expanded", registered: 2 });
  expect(repeated).toEqual({ status: "replayed" });
  expect(row[0]).toMatchObject({
    source_version: "2",
    document: {
      path: [
        { code: "ROOT", name: "Renamed root" },
        { code: "CHILD", name: "Child" },
      ],
    },
  });
  expect(dirty.map(({ version }) => version)).toEqual(["2", "2"]);
});

test("a large committed subtree registers every target once and replays its complete original receipt", async () => {
  const targetCount = 21_846;
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type)
    SELECT id, 'ORG-' || id, 'Organization ' || id, CASE WHEN id=1 THEN -1 ELSE 1 END,
      CASE WHEN id=1 THEN '/1' ELSE '/1/' || id END, CASE WHEN id=1 THEN 1 ELSE 2 END,
      ${OrganizationType.Department}
    FROM generate_series(1, ${targetCount}) AS target(id)`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth)
    SELECT id, id, 0 FROM generate_series(1, ${targetCount}) AS target(id)
    UNION ALL SELECT 1, id, 1 FROM generate_series(2, ${targetCount}) AS target(id)`;
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id, version)
    VALUES (1,7), (1001,7), (${targetCount},7)`;
  const { processor, sourceJobs, rebuildJobs } = createProcessor();
  await recordChange([{ kind: "updated", organizationId: 1, changedFields: ["name"] }], sourceJobs, async (tx) => {
    await tx.execute(sql`UPDATE organization SET org_name='Renamed root' WHERE id=1`);
  });
  const payload = sourceJobs[0]!;

  const expanded = await processor.processOutbox(payload);
  const replayed = await processor.processOutbox(payload);
  const states = await harness.sql`SELECT organization_id, version, status
    FROM organization_document_rebuild_state ORDER BY organization_id`;
  const [receipt] = await harness.sql`SELECT status, rebuild_requests FROM organization_document_outbox
    WHERE id=${payload.outboxId}`;
  const expectedJobs = Array.from({ length: targetCount }, (_, index) => {
    const organizationId = index + 1;
    return { organizationId, version: [1, 1001, targetCount].includes(organizationId) ? "8" : "1" };
  });

  expect(expanded).toEqual({ status: "expanded", registered: targetCount });
  expect(replayed).toEqual({ status: "replayed" });
  expect([...states]).toEqual(
    expectedJobs.map(({ organizationId, version }) => ({
      organization_id: organizationId,
      version,
      status: "pending",
    })),
  );
  expect(receipt).toEqual({
    status: "processed",
    rebuild_requests: expectedJobs.map(({ organizationId, version }) => ({ targetId: organizationId, version })),
  });
  expect(rebuildJobs.slice(0, targetCount)).toEqual(expectedJobs);
  expect(rebuildJobs.slice(targetCount)).toEqual(expectedJobs);
});

test("newer deletion publication retains its version and rejects a late visible candidate", async () => {
  await seedTree();
  const { processor, sourceJobs, rebuildJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs) await processor.processOutbox(payload);
  const oldCandidate = await processor.prepareRebuild({ organizationId: 2, version: "1" });
  expect(oldCandidate).not.toBeNull();
  await recordChange([{ kind: "deleted", organizationId: 2 }], sourceJobs, async (sourceDb) => {
    await sourceDb.execute(sql`UPDATE organization SET is_delete = TRUE WHERE id = 2`);
  });
  await processor.processOutbox(sourceJobs.at(-1)!);
  const removed = await processor.processRebuild({ organizationId: 2, version: "2" });
  const late = await processor.publishPrepared(oldCandidate!);
  const rows =
    await harness.sql`SELECT document, search_visible, source_version FROM organization_document WHERE organization_id = 2`;
  const dirty =
    await harness.sql`SELECT version, status FROM organization_document_rebuild_state WHERE organization_id = 2`;

  expect(removed).toEqual({ status: "published" });
  expect(late).toEqual({ status: "stale" });
  expect(rows[0]).toMatchObject({ document: null, search_visible: false, source_version: "2" });
  expect(dirty[0]).toMatchObject({ version: "2", status: "processed" });
});

test("broken source paths fail rebuilding while retaining the last legal published document", async () => {
  await seedTree();
  const { processor, sourceJobs, rebuildJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  await drain(processor, sourceJobs, rebuildJobs);
  await harness.sql`DELETE FROM organization_closure WHERE ancestor_id=1 AND descendant_id=2`;
  await recordChange([{ kind: "updated", organizationId: 2, changedFields: ["status"] }], sourceJobs);
  await processor.processOutbox(sourceJobs.at(-1)!);
  let failure: unknown;
  try {
    await processor.processRebuild({ organizationId: 2, version: "2" });
  } catch (error) {
    failure = error;
  }
  const row = await harness.sql`SELECT document, source_version FROM organization_document WHERE organization_id=2`;
  const dirty =
    await harness.sql`SELECT version, status, processing_token FROM organization_document_rebuild_state WHERE organization_id=2`;

  expect(failure).toBeInstanceOf(Error);
  expect(row[0]).toMatchObject({
    source_version: "1",
    document: { code: "CHILD", path: [{ code: "ROOT" }, { code: "CHILD" }] },
  });
  expect(dirty[0]).toMatchObject({ version: "2", status: "failed", processing_token: null });
});

test("normal build reads target and ancestors from one consistent source snapshot", async () => {
  await seedTree();
  const { processor, sourceJobs } = createProcessor();
  await processor.backfillAllOrganizations();
  for (const payload of sourceJobs) await processor.processOutbox(payload);
  const blocker = await harness.sql.reserve();
  let preparedPromise: ReturnType<typeof processor.prepareRebuild> | undefined;
  try {
    await blocker.unsafe("BEGIN");
    await blocker.unsafe("LOCK TABLE organization_closure IN ACCESS EXCLUSIVE MODE");
    preparedPromise = processor.prepareRebuild({ organizationId: 2, version: "1" });
    const deadline = Date.now() + 2000;
    while (true) {
      const rows =
        await harness.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name LIKE 'iam_organization_document_%'
        AND wait_event_type='Lock' AND query LIKE '%organization_closure%') AS blocked`;
      if (rows[0]?.blocked === true) break;
      if (Date.now() > deadline) throw new Error("Build did not reach the controlled closure read");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await harness.sql`UPDATE organization SET org_name=CASE WHEN id=1 THEN 'Concurrent root' ELSE 'Concurrent child' END WHERE id IN (1,2)`;
    await blocker.unsafe("COMMIT");
    const prepared = await preparedPromise;
    expect(prepared?.document).toMatchObject({
      name: "Child",
      path: [{ name: "Root" }, { name: "Child" }],
    });
  } finally {
    await blocker.unsafe("ROLLBACK");
    blocker.release();
    await preparedPromise;
  }
});

test("a missing source row fails rebuilding instead of manufacturing a deletion tombstone", async () => {
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version) VALUES (999,1)`;
  const { processor } = createProcessor();
  let failure: unknown;
  try {
    await processor.processRebuild({ organizationId: 999, version: "1" });
  } catch (error) {
    failure = error;
  }
  const publications = await harness.sql`SELECT document FROM organization_document WHERE organization_id=999`;
  const state = await harness.sql`SELECT status FROM organization_document_rebuild_state WHERE organization_id=999`;
  expect(failure).toBeInstanceOf(Error);
  expect([...publications]).toEqual([]);
  expect(state[0]?.status).toBe("failed");
});

async function seedTree() {
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type)
    VALUES (1, 'ROOT', 'Root', -1, '/1', 1, ${OrganizationType.Department}), (2, 'CHILD', 'Child', 1, '/1/2', 2, ${OrganizationType.Department})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (1,1,0), (1,2,1), (2,2,0)`;
}

function createSourceUnitOfWork(sourceJobs: OrganizationOutboxJobPayload[]) {
  return createUnitOfWork({
    db: harness.db,
    logger: { warn() {}, error() {} },
    createTxPorts(sourceDb, lifecycle) {
      return {
        sourceDb,
        invalidation: createOrganizationDocumentInvalidation({
          db: sourceDb,
          lifecycle,
          jobProducer: {
            async enqueueOutboxEntries(payloads) {
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
  changes: OrganizationDocumentSourceChange[],
  sourceJobs: OrganizationOutboxJobPayload[],
  sourceWrite?: (db: DbTransaction) => Promise<void>,
) {
  const uow = createSourceUnitOfWork(sourceJobs);
  await uow.transaction(async ({ sourceDb, invalidation }) => {
    await sourceWrite?.(sourceDb);
    await invalidation.recordChanges(changes);
  });
}

async function drain(
  processor: ReturnType<typeof createOrganizationDocumentProcessor>,
  sourceJobs: OrganizationOutboxJobPayload[],
  rebuildJobs: OrganizationRebuildJobPayload[],
) {
  for (const payload of sourceJobs) await processor.processOutbox(payload);
  for (const payload of rebuildJobs) await processor.processRebuild(payload);
}
