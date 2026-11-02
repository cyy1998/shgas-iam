import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import type { DbTransaction, db as database } from "@iam/db";
import {
  organizationDocumentOutboxEntries,
  organizationDocumentRebuildStates,
  organizationDocuments,
} from "@iam/db/schema";
import { sql } from "drizzle-orm";
import { createDocumentUpdateProcessor, type PreparedDocumentPublication } from "../../src";
import {
  createDocumentUpdatePostgresTestHarness,
  type DocumentUpdatePostgresTestHarness,
} from "../support/postgres-test-harness";

type Document = { name: string };
type Prepared = PreparedDocumentPublication<Document>;
let harness: DocumentUpdatePostgresTestHarness;
beforeAll(async () => {
  harness = await createDocumentUpdatePostgresTestHarness();
  await harness.sql`CREATE TABLE batch_followup (target_id integer PRIMARY KEY, version bigint NOT NULL)`;
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`TRUNCATE batch_followup`;
});
afterAll(async () => {
  await harness?.close();
});

function runtime(
  options: {
    db?: typeof database;
    beforePublish?: (tx: DbTransaction, prepared: readonly Prepared[]) => Promise<void>;
  } = {},
) {
  const batches: number[][] = [];
  let effects = 0;
  const processor = createDocumentUpdateProcessor({
    db: options.db ?? harness.db,
    tables: {
      outbox: organizationDocumentOutboxEntries,
      source: sql<null>`NULL`,
      rebuildState: organizationDocumentRebuildStates,
      targetId: organizationDocumentRebuildStates.organizationId,
      requestedAt: organizationDocumentRebuildStates.dirtyAt,
    },
    parseSource: () => null,
    expand: async () => [],
    build: async () => ({ name: "Published" }),
    publish: async () => {
      throw new Error("Single publication must not be used for a batch");
    },
    async publishMany(tx, prepared) {
      batches.push(prepared.map(({ targetId }) => targetId));
      await options.beforePublish?.(tx, prepared);
      const rows = await tx
        .insert(organizationDocuments)
        .values(
          prepared.map((item) => ({
            organizationId: item.targetId,
            document: item.document,
            sourceVersion: item.version,
            schemaVersion: 1,
            searchVisible: true,
          })),
        )
        .onConflictDoUpdate({
          target: organizationDocuments.organizationId,
          set: { document: sql`excluded.document`, sourceVersion: sql`excluded.source_version` },
          setWhere: sql`${organizationDocuments.sourceVersion} <= excluded.source_version`,
        })
        .returning({ targetId: organizationDocuments.organizationId });
      await tx.execute(sql`INSERT INTO batch_followup (target_id,version) VALUES
        ${sql.join(
          prepared.map((item) => sql`(${item.targetId},${item.version}::bigint)`),
          sql`, `,
        )}
        ON CONFLICT (target_id) DO UPDATE SET version=excluded.version`);
      return rows.map(({ targetId }) => targetId);
    },
    async afterPublish() {
      effects += 1;
    },
    jobProducer: {
      enqueueOutboxEntries: async () => ({ enqueued: 0 }),
      enqueueRebuilds: async () => ({ enqueued: 0 }),
    },
  });
  return { processor, batches, effects: () => effects };
}

async function prepare(processor: ReturnType<typeof runtime>["processor"], ids: number[]) {
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status)
    SELECT id,1,'pending' FROM unnest(${ids}::integer[]) AS id`;
  const claims = await processor.claimRebuilds(ids.map((targetId) => ({ targetId, version: "1" })));
  return claims.map((claim) => ({
    ...claim,
    document: { name: `Published ${claim.targetId}` },
    rebuiltAt: new Date(),
  }));
}

test("batch publication filters stale versions, replacement owners and missing state before one commit", async () => {
  const context = runtime();
  const candidates = await prepare(context.processor, [1, 2, 3, 4]);
  await harness.sql`UPDATE organization_document_rebuild_state SET version=2,status='pending',processing_token=NULL,processing_started_at=NULL WHERE organization_id=2`;
  await harness.sql`UPDATE organization_document_rebuild_state SET processing_token=gen_random_uuid() WHERE organization_id=3`;
  await harness.sql`DELETE FROM organization_document_rebuild_state WHERE organization_id=4`;
  const report = await context.processor.publishPreparedBatch(candidates.toReversed());
  const documents = await harness.sql`SELECT organization_id,source_version FROM organization_document`;
  const followup = await harness.sql`SELECT target_id,version FROM batch_followup`;
  expect(report.published.map(({ targetId }) => targetId)).toEqual([1]);
  expect(report.stale.map(({ targetId }) => targetId)).toEqual([2, 3, 4]);
  expect(report.failed).toEqual([]);
  expect(report.stopped).toBe(false);
  expect(context.batches).toEqual([[1]]);
  expect([...documents]).toEqual([{ organization_id: 1, source_version: "1" }]);
  expect([...followup]).toEqual([{ target_id: 1, version: "1" }]);
  expect(context.effects()).toBe(0);
});

test("a retained newer document cannot be marked processed by a short bulk RETURNING", async () => {
  const context = runtime();
  const candidates = await prepare(context.processor, [1, 2]);
  await harness.sql`INSERT INTO organization_document (organization_id,source_version,schema_version,search_visible,document)
    VALUES (2,99,1,true,'{"name":"Retained"}'::jsonb)`;
  const report = await context.processor.publishPreparedBatch(candidates);
  const work =
    await harness.sql`SELECT organization_id,status FROM organization_document_rebuild_state ORDER BY organization_id`;
  const documents =
    await harness.sql`SELECT organization_id,source_version FROM organization_document ORDER BY organization_id`;
  const followup = await harness.sql`SELECT target_id FROM batch_followup ORDER BY target_id`;
  expect(report.published.map(({ targetId }) => targetId)).toEqual([1]);
  expect(report.failed.map(({ prepared }) => prepared.targetId)).toEqual([2]);
  expect([...work]).toEqual([
    { organization_id: 1, status: "processed" },
    { organization_id: 2, status: "failed" },
  ]);
  expect([...documents]).toEqual([
    { organization_id: 1, source_version: "1" },
    { organization_id: 2, source_version: "99" },
  ]);
  expect([...followup]).toEqual([{ target_id: 1 }]);
});

test("a target-local bulk error rolls back its group and isolates only the failing target", async () => {
  const context = runtime();
  const candidates = await prepare(context.processor, [1, 2, 3, 4]);
  await harness.sql.unsafe(`CREATE FUNCTION reject_batch_member() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.organization_id=2 THEN RAISE EXCEPTION 'controlled target failure'; END IF; RETURN NEW; END $$`);
  await harness.sql.unsafe(
    "CREATE TRIGGER reject_batch_member BEFORE INSERT ON organization_document FOR EACH ROW EXECUTE FUNCTION reject_batch_member()",
  );
  let report: Awaited<ReturnType<typeof context.processor.publishPreparedBatch>>;
  try {
    report = await context.processor.publishPreparedBatch(candidates);
  } finally {
    await harness.sql.unsafe("DROP TRIGGER reject_batch_member ON organization_document");
    await harness.sql.unsafe("DROP FUNCTION reject_batch_member()");
  }
  const documents = await harness.sql`SELECT organization_id FROM organization_document ORDER BY organization_id`;
  const followup = await harness.sql`SELECT target_id FROM batch_followup ORDER BY target_id`;
  expect(report!.published.map(({ targetId }) => targetId)).toEqual([1, 3, 4]);
  expect(report!.failed.map(({ prepared }) => prepared.targetId)).toEqual([2]);
  expect(report!.stopped).toBe(false);
  expect([...documents]).toEqual([{ organization_id: 1 }, { organization_id: 3 }, { organization_id: 4 }]);
  expect([...followup]).toEqual([{ target_id: 1 }, { target_id: 3 }, { target_id: 4 }]);
  expect(context.batches.length).toBeLessThanOrEqual(candidates.length * 2 - 1);
  expect(context.effects()).toBe(0);
});

test("overlapping batches with opposite input order converge without parallel lock inversion", async () => {
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const first = runtime({
    beforePublish: async () => {
      entered.resolve();
      await resume.promise;
    },
  });
  const candidates = await prepare(first.processor, [1, 2, 3]);
  const firstOperation = first.processor.publishPreparedBatch(candidates.toReversed());
  void firstOperation.catch(entered.reject);
  let secondOperation: ReturnType<typeof first.processor.publishPreparedBatch> | undefined;
  try {
    await entered.promise;
    const second = runtime();
    secondOperation = second.processor.publishPreparedBatch(candidates);
    resume.resolve();
    const [firstReport, secondReport] = await Promise.all([firstOperation, secondOperation]);
    expect(firstReport.published.map(({ targetId }) => targetId)).toEqual([1, 2, 3]);
    expect(secondReport.stale.map(({ targetId }) => targetId)).toEqual([1, 2, 3]);
    expect(second.batches).toEqual([]);
  } finally {
    resume.resolve();
    await Promise.allSettled([firstOperation, secondOperation]);
  }
});

test("an unconfirmed COMMIT never triggers fallback or external effects", async () => {
  let transactions = 0;
  const ambiguousDb = new Proxy(harness.db, {
    get(target, key, receiver) {
      if (key === "transaction")
        return async (...args: Parameters<typeof target.transaction>) => {
          transactions += 1;
          await target.transaction(...args);
          throw new Error("ConnectionLostAfterCommit");
        };
      return Reflect.get(target, key, receiver);
    },
  });
  const context = runtime({ db: ambiguousDb });
  const candidates = await prepare(context.processor, [1, 2]);
  const report = await context.processor.publishPreparedBatch(candidates);
  const work = await harness.sql`SELECT status FROM organization_document_rebuild_state`;
  const followup = await harness.sql`SELECT target_id FROM batch_followup ORDER BY target_id`;
  expect(report.published).toEqual([]);
  expect(report.failed.map(({ prepared }) => prepared.targetId)).toEqual([1, 2]);
  expect(report.stopped).toBe(true);
  expect(transactions).toBe(1);
  expect(context.batches).toEqual([[1, 2]]);
  expect(context.effects()).toBe(0);
  expect(work.every(({ status }) => status === "processed")).toBe(true);
  expect([...followup]).toEqual([{ target_id: 1 }, { target_id: 2 }]);
});

test("infrastructure publication errors stop the batch without binary fallback", async () => {
  const context = runtime({
    beforePublish: async (tx) => {
      await tx.execute(sql`SELECT * FROM missing_publication_configuration`);
    },
  });
  const candidates = await prepare(context.processor, [1, 2, 3, 4]);
  const report = await context.processor.publishPreparedBatch(candidates);
  const work = await harness.sql`SELECT status,processing_token FROM organization_document_rebuild_state`;
  expect(report.failed).toHaveLength(4);
  expect(report.stopped).toBe(true);
  expect(context.batches).toEqual([[1, 2, 3, 4]]);
  expect(work.every((row) => row.status === "failed" && row.processing_token === null)).toBe(true);
});

test.each([false, true])("confirmed serialization aborts retry only once, repeated=%s", async (repeated) => {
  let calls = 0;
  const context = runtime({
    beforePublish: async (tx) => {
      calls += 1;
      if (calls === 1 || repeated)
        await tx.execute(
          sql`DO $$ BEGIN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='controlled serialization abort'; END $$`,
        );
    },
  });
  const candidates = await prepare(context.processor, [1, 2]);
  const report = await context.processor.publishPreparedBatch(candidates);
  expect(calls).toBe(2);
  expect(context.batches).toEqual([
    [1, 2],
    [1, 2],
  ]);
  expect(report.published).toHaveLength(repeated ? 0 : 2);
  expect(report.failed).toHaveLength(repeated ? 2 : 0);
  expect(report.stopped).toBe(repeated);
  expect(context.effects()).toBe(0);
});

test("batch budgets preserve stricter existing connection timeouts", async () => {
  const budgetDb = new Proxy(harness.db, {
    get(target, key, receiver) {
      if (key === "transaction")
        return async (...args: Parameters<typeof target.transaction>) =>
          await target.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT set_config('statement_timeout','2s',true), set_config('lock_timeout','1s',true)`,
            );
            return await args[0](tx);
          }, args[1]);
      return Reflect.get(target, key, receiver);
    },
  });
  const context = runtime({
    db: budgetDb,
    beforePublish: async (tx) => {
      const [settings] = await tx.execute<{ statement: string; lock: string }>(
        sql`SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock`,
      );
      expect(settings).toEqual({ statement: "2s", lock: "1s" });
    },
  });
  const candidates = await prepare(context.processor, [1]);
  const report = await context.processor.publishPreparedBatch(candidates);
  expect(report.published).toHaveLength(1);
  expect(report.failed).toEqual([]);
});

test("an exhausted monotonic budget rolls back uncommitted documents and stops isolation", async () => {
  const now = performance.now.bind(performance);
  let advance = 0;
  const monotonic = spyOn(performance, "now").mockImplementation(() => now() + advance);
  try {
    const context = runtime({
      beforePublish: async () => {
        advance = 31_000;
      },
    });
    const candidates = await prepare(context.processor, [1, 2]);
    const report = await context.processor.publishPreparedBatch(candidates);
    const documents = await harness.sql`SELECT organization_id FROM organization_document`;
    const followup = await harness.sql`SELECT target_id FROM batch_followup`;
    expect(report.published).toEqual([]);
    expect(report.failed).toHaveLength(2);
    expect(report.stopped).toBe(true);
    expect(context.batches).toEqual([[1, 2]]);
    expect([...documents]).toEqual([]);
    expect([...followup]).toEqual([]);
  } finally {
    monotonic.mockRestore();
  }
});

test("a confirmed commit remains published when its acknowledgement exhausts the time budget", async () => {
  const now = performance.now.bind(performance);
  let advance = 0;
  const monotonic = spyOn(performance, "now").mockImplementation(() => now() + advance);
  try {
    const slowCommit = new Proxy(harness.db, {
      get(target, key, receiver) {
        if (key === "transaction")
          return async (...args: Parameters<typeof target.transaction>) => {
            const result = await target.transaction(...args);
            advance = 31_000;
            return result;
          };
        return Reflect.get(target, key, receiver);
      },
    });
    const context = runtime({ db: slowCommit });
    const candidates = await prepare(context.processor, [1]);
    const report = await context.processor.publishPreparedBatch(candidates);
    const work = await harness.sql`SELECT status FROM organization_document_rebuild_state`;
    expect(report.published.map(({ targetId }) => targetId)).toEqual([1]);
    expect(report.failed).toEqual([]);
    expect(report.stopped).toBe(true);
    expect(context.batches).toEqual([[1]]);
    expect([...work]).toEqual([{ status: "processed" }]);
    expect(context.effects()).toBe(0);
  } finally {
    monotonic.mockRestore();
  }
});

test("batch failure cleanup skips an active row lock and leaves its claim recoverable", async () => {
  const blocker = await harness.sql.reserve();
  let holding = false;
  const lockedFailureDb = new Proxy(harness.db, {
    get(target, key, receiver) {
      if (key === "transaction")
        return async (...args: Parameters<typeof target.transaction>) => {
          try {
            return await target.transaction(...args);
          } catch (error) {
            // Publication rolled back; another active operation wins the row
            // before the failed publisher can clear its claim.
            await blocker.unsafe("BEGIN");
            await blocker`SELECT organization_id FROM organization_document_rebuild_state WHERE organization_id=1 FOR UPDATE`;
            holding = true;
            throw error;
          }
        };
      return Reflect.get(target, key, receiver);
    },
  });
  const context = runtime({
    db: lockedFailureDb,
    beforePublish: async (tx) => {
      await tx.execute(sql`DO $$ BEGIN RAISE EXCEPTION 'controlled target publication failure'; END $$`);
    },
  });
  const candidates = await prepare(context.processor, [1]);
  const cancellation = new AbortController();
  const [application] = await harness.sql<{ name: string }[]>`SELECT current_setting('application_name') AS name`;
  const name = application!.name;
  const operation = context.processor.publishPreparedBatch(candidates).then(async (report) => {
    // The same non-blocking seam is also used for unattempted User batch groups.
    await context.processor.failRebuilds(candidates, new Error("Unattempted batch cleanup"), { skipLocked: true });
    return report;
  });
  const completed = operation.then((report) => ({ status: "completed" as const, report }));
  const lockProbe = (async () => {
    const deadline = Date.now() + 2_000;
    while (!cancellation.signal.aborted) {
      const [activity] = await harness.sql<{ blocked: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND application_name=${name} AND wait_event_type='Lock'
          AND query LIKE '%organization_document_rebuild_state%'
      ) AS blocked`;
      if (activity!.blocked) return { status: "blocked" as const };
      if (Date.now() >= deadline) throw new Error("Batch neither returned nor exposed a cleanup lock wait");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return { status: "cancelled" as const };
  })();
  try {
    const verdict = await Promise.race([completed, lockProbe]);
    cancellation.abort();
    expect(verdict.status).toBe("completed");
    if (verdict.status !== "completed") throw new Error("Batch cleanup waited for an active row lock");
    expect(verdict.report.published).toEqual([]);
    expect(verdict.report.failed.map(({ prepared }) => prepared.targetId)).toEqual([1]);
    const [retained] =
      await harness.sql`SELECT status,processing_token FROM organization_document_rebuild_state WHERE organization_id=1`;
    expect(retained).toEqual({ status: "processing", processing_token: candidates[0]!.processingToken });
    expect(context.effects()).toBe(0);
  } finally {
    cancellation.abort();
    if (holding) await blocker.unsafe("ROLLBACK");
    blocker.release();
    await Promise.allSettled([operation, lockProbe]);
  }
  const healthy = runtime();
  const repair = await healthy.processor.repairFailedOrStale({ limit: 10, staleBefore: new Date(Date.now() + 1_000) });
  expect(repair.rebuilds.selected).toBe(1);
  const [replacement] = await healthy.processor.claimRebuilds([{ targetId: 1, version: "1" }]);
  const recovered = await healthy.processor.publishPreparedBatch([{ ...candidates[0]!, ...replacement! }]);
  expect(recovered.published).toHaveLength(1);
  expect(recovered.failed).toEqual([]);
});
