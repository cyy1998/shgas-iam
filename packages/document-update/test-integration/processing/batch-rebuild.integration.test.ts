import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { DbTransaction } from "@iam/db";
import {
  organizationDocumentOutboxEntries,
  organizationDocumentRebuildStates,
  organizationDocuments,
} from "@iam/db/schema";
import { sql } from "drizzle-orm";
import {
  createDocumentUpdateProcessor,
  type DocumentBuildResult,
  type DocumentRebuildRequest,
  type PreparedDocumentPublication,
} from "../../src";
import {
  createDocumentUpdatePostgresTestHarness,
  type DocumentUpdatePostgresTestHarness,
} from "../support/postgres-test-harness";

type Document = { name: string };
let harness: DocumentUpdatePostgresTestHarness;
beforeAll(async () => {
  harness = await createDocumentUpdatePostgresTestHarness();
  await harness.sql`CREATE TABLE rebuild_source (target_id integer PRIMARY KEY, name text NOT NULL)`;
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`TRUNCATE rebuild_source`;
});
afterAll(async () => {
  await harness?.close();
});

function runtime(
  options: {
    buildMany?: (
      tx: DbTransaction,
      requests: readonly DocumentRebuildRequest[],
      observedAt: Date,
    ) => Promise<readonly DocumentBuildResult<Document>[]>;
    beforePublish?: (tx: DbTransaction, prepared: readonly PreparedDocumentPublication<Document>[]) => Promise<void>;
  } = {},
) {
  const publishedGroups: number[][] = [];
  const processor = createDocumentUpdateProcessor({
    db: harness.db,
    tables: {
      outbox: organizationDocumentOutboxEntries,
      source: sql<null>`NULL`,
      rebuildState: organizationDocumentRebuildStates,
      targetId: organizationDocumentRebuildStates.organizationId,
      requestedAt: organizationDocumentRebuildStates.dirtyAt,
    },
    parseSource: () => null,
    expand: async () => [],
    build: async () => {
      throw new Error("Single builder must not be used for batch rebuilding");
    },
    async buildMany(tx, requests, observedAt) {
      if (options.buildMany) return await options.buildMany(tx, requests, observedAt);
      const rows = await tx.execute<{ targetId: number; name: string }>(
        sql`SELECT target_id AS "targetId", name FROM rebuild_source`,
      );
      const byTarget = new Map(rows.map((row) => [row.targetId, row.name]));
      return requests.map((request) => {
        const name = byTarget.get(request.targetId);
        if (name === undefined) throw new Error("Missing test source");
        return { ...request, status: "built" as const, document: { name } };
      });
    },
    publish: async () => {
      throw new Error("Single publisher must not be used for batch rebuilding");
    },
    async publishMany(tx, prepared) {
      publishedGroups.push(prepared.map(({ targetId }) => targetId));
      await options.beforePublish?.(tx, prepared);
      const written = await tx
        .insert(organizationDocuments)
        .values(
          prepared.map((candidate) => ({
            organizationId: candidate.targetId,
            sourceVersion: candidate.version,
            schemaVersion: 1,
            document: candidate.document,
            searchVisible: true,
            rebuiltAt: candidate.rebuiltAt,
          })),
        )
        .onConflictDoUpdate({
          target: organizationDocuments.organizationId,
          set: { sourceVersion: sql`excluded.source_version`, document: sql`excluded.document` },
          setWhere: sql`${organizationDocuments.sourceVersion} <= excluded.source_version`,
        })
        .returning({ targetId: organizationDocuments.organizationId });
      return written.map(({ targetId }) => targetId);
    },
    jobProducer: {
      enqueueOutboxEntries: async () => ({ enqueued: 0 }),
      enqueueRebuilds: async () => ({ enqueued: 0 }),
    },
  });
  return { processor, publishedGroups };
}

async function pending(ids: number[]) {
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status)
    SELECT id,1,'pending' FROM unnest(${ids}::integer[]) AS id`;
  await harness.sql`INSERT INTO rebuild_source (target_id,name)
    SELECT id,'Source ' || id FROM unnest(${ids}::integer[]) AS id`;
  return ids.map((targetId) => ({ targetId, version: "1" }));
}

test("batch building owns one repeatable-read read-only source snapshot", async () => {
  const requests = await pending([1, 2]);
  let settings: { isolation: string; readOnly: string } | undefined;
  const context = runtime({
    async buildMany(tx, claimed) {
      [settings] = await tx.execute<{ isolation: string; readOnly: string }>(sql`SELECT
        current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS "readOnly"`);
      const first = await tx.execute<{ targetId: number; name: string }>(
        sql`SELECT target_id AS "targetId",name FROM rebuild_source ORDER BY target_id`,
      );
      await harness.sql`UPDATE rebuild_source SET name='Changed concurrently'`;
      const second = await tx.execute<{ targetId: number; name: string }>(
        sql`SELECT target_id AS "targetId",name FROM rebuild_source ORDER BY target_id`,
      );
      expect(second).toEqual(first);
      return claimed.map((request) => {
        const source = first.find((row) => row.targetId === request.targetId);
        if (!source) throw new Error("Missing test source");
        return { ...request, status: "built", document: { name: source.name } };
      });
    },
  });
  const report = await context.processor.processRebuildBatch(requests);
  const stored =
    await harness.sql`SELECT organization_id,document->>'name' AS name FROM organization_document ORDER BY organization_id`;
  expect(settings).toEqual({ isolation: "repeatable read", readOnly: "on" });
  expect(report).toMatchObject({ requested: 2, rebuilt: 2, failures: [], stopped: false });
  expect([...stored]).toEqual([
    { organization_id: 1, name: "Source 1" },
    { organization_id: 2, name: "Source 2" },
  ]);
});

test("an incomplete builder result releases every claim without publishing unverified members", async () => {
  const requests = await pending([1, 2]);
  const context = runtime({
    buildMany: async (_tx, claimed) => {
      const first = claimed.at(0);
      if (!first) throw new Error("Missing test claim");
      return [{ ...first, status: "built", document: { name: "First only" } }];
    },
  });
  const report = await context.processor.processRebuildBatch(requests);
  const work = await harness.sql`SELECT status,processing_token FROM organization_document_rebuild_state`;
  const stored = await harness.sql`SELECT organization_id FROM organization_document`;
  expect(report.failures).toHaveLength(1);
  expect(report.rebuilt).toBe(0);
  expect(work.every((row) => row.status === "failed" && row.processing_token === null)).toBe(true);
  expect([...stored]).toEqual([]);
});

test("a target source error retains healthy commits and calls owner effects only after commit", async () => {
  const requests = await pending([1, 2, 3]);
  const context = runtime({
    buildMany: async (_tx, claimed) =>
      claimed.map((request) =>
        request.targetId === 2
          ? { ...request, status: "failed", error: new Error("Invalid target source") }
          : { ...request, status: "built", document: { name: `Built ${request.targetId}` } },
      ),
  });
  const effects: number[][] = [];
  const report = await context.processor.processRebuildBatch(requests, {
    async onPublished(published) {
      const committed = await harness.sql`SELECT organization_id FROM organization_document ORDER BY organization_id`;
      expect(committed.map(({ organization_id }) => organization_id)).toEqual([1, 3]);
      const work =
        await harness.sql`SELECT organization_id,status FROM organization_document_rebuild_state ORDER BY organization_id`;
      expect([...work]).toEqual([
        { organization_id: 1, status: "processed" },
        { organization_id: 2, status: "failed" },
        { organization_id: 3, status: "processed" },
      ]);
      effects.push(published.map(({ targetId }) => targetId));
    },
  });
  expect(report).toMatchObject({ requested: 3, rebuilt: 2, skipped: 0, stale: 0, stopped: false });
  expect(report.failures).toHaveLength(1);
  expect(effects).toEqual([[1, 3]]);
});

test("a later publication stop still delivers earlier committed members to owner effects", async () => {
  const requests = await pending([1, 2, 3]);
  const context = runtime({
    async beforePublish(_tx, prepared) {
      if (prepared.some(({ targetId }) => targetId === 2)) throw new Error("Publication connection failure");
    },
  });
  const effects: number[][] = [];
  const report = await context.processor.processRebuildBatch(requests, {
    publicationBatchBytes: 1,
    async onPublished(published) {
      effects.push(published.map(({ targetId }) => targetId));
    },
  });
  const stored = await harness.sql`SELECT organization_id FROM organization_document`;
  expect(report.stopped).toBe(true);
  expect(report.rebuilt).toBe(1);
  expect(report.failures.length).toBeGreaterThan(0);
  expect(effects).toEqual([[1]]);
  expect([...stored]).toEqual([{ organization_id: 1 }]);
});

test("publication byte limits keep large documents individually publishable", async () => {
  const requests = await pending([1, 2]);
  const context = runtime();
  const report = await context.processor.processRebuildBatch(requests, { publicationBatchBytes: 1 });
  expect(report).toMatchObject({ rebuilt: 2, failures: [] });
  expect(context.publishedGroups).toEqual([[1], [2]]);
});

test("aborting after construction releases owned work before publication", async () => {
  const requests = await pending([1, 2]);
  const controller = new AbortController();
  const context = runtime({
    async buildMany(_tx, claimed) {
      controller.abort(new Error("Stop rebuilding"));
      return claimed.map((request) => ({ ...request, status: "built", document: { name: "Not published" } }));
    },
  });
  const report = await context.processor.processRebuildBatch(requests, { signal: controller.signal });
  const work = await harness.sql`SELECT status,processing_token FROM organization_document_rebuild_state`;
  const stored = await harness.sql`SELECT organization_id FROM organization_document`;
  expect(report.stopped).toBe(true);
  expect(report.failures).toHaveLength(1);
  expect(work.every((row) => row.status === "failed" && row.processing_token === null)).toBe(true);
  expect([...stored]).toEqual([]);
});

test("validates every input before claiming any work", async () => {
  await pending([1, 2]);
  const context = runtime();
  let failure: unknown;
  try {
    await context.processor.processRebuildBatch(
      [
        { targetId: 1, version: "1" },
        { targetId: 2, version: "invalid" },
      ],
      { batchSize: 1 },
    );
  } catch (error) {
    failure = error;
  }
  const work = await harness.sql`SELECT status,attempts,processing_token FROM organization_document_rebuild_state`;
  expect(failure).toBeInstanceOf(TypeError);
  expect(work.every((row) => row.status === "pending" && row.attempts === 0 && row.processing_token === null)).toBe(
    true,
  );
});
