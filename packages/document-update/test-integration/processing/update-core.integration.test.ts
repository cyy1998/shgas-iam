import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { DbClient, db as database } from "@iam/db";
import {
  organizationDocumentOutboxEntries,
  organizationDocumentRebuildStates,
  organizationDocuments,
} from "@iam/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  createDocumentUpdateProcessor,
  type DocumentOutboxJob,
  type DocumentRebuildRequest,
  persistDocumentOutboxEntries,
} from "../../src";
import {
  createDocumentUpdatePostgresTestHarness,
  type DocumentUpdatePostgresTestHarness,
} from "../support/postgres-test-harness";

let harness: DocumentUpdatePostgresTestHarness;
beforeAll(async () => {
  harness = await createDocumentUpdatePostgresTestHarness();
  await harness.sql`CREATE TABLE followup (target_id integer PRIMARY KEY, version bigint NOT NULL)`;
  await harness.sql`CREATE TABLE source_metadata (target_id integer PRIMARY KEY, version bigint NOT NULL)`;
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`TRUNCATE followup`;
  await harness.sql`TRUNCATE source_metadata`;
});
afterAll(async () => {
  await harness?.close();
});

type Source = { organizationId: number; scope: "self" | "subtree" };
const source: Source = { organizationId: 1, scope: "self" };

function createProcessor(
  options: {
    db?: typeof database;
    failWake?: boolean;
    failPublish?: boolean;
    failAfterPublish?: boolean;
    failRegistered?: boolean;
    targets?: number[];
  } = {},
) {
  const outboxJobs: DocumentOutboxJob[] = [];
  const rebuildJobs: DocumentRebuildRequest[] = [];
  const processor = createDocumentUpdateProcessor({
    db: options.db ?? harness.db,
    tables: {
      outbox: organizationDocumentOutboxEntries,
      source: sql<Source>`jsonb_build_object('organizationId', ${organizationDocumentOutboxEntries.organizationId}, 'scope', ${organizationDocumentOutboxEntries.scope})`,
      rebuildState: organizationDocumentRebuildStates,
      targetId: organizationDocumentRebuildStates.organizationId,
      requestedAt: organizationDocumentRebuildStates.dirtyAt,
    },
    parseSource(value) {
      if (!value || typeof value !== "object" || !("organizationId" in value) || !("scope" in value))
        throw new Error("invalid source");
      return source;
    },
    expand: async () => options.targets ?? [1],
    async registered(tx, _source, requests) {
      await tx.execute(sql`INSERT INTO source_metadata (target_id,version)
        SELECT "targetId", version::bigint FROM jsonb_to_recordset(${JSON.stringify(requests)}::jsonb)
          AS requests("targetId" integer, version text)
        ON CONFLICT (target_id) DO UPDATE SET version=EXCLUDED.version`);
      if (options.failRegistered) throw new Error("domain metadata rejected");
    },
    build: async (_targetId, version) => ({ name: "Published", sourceVersion: version }),
    async publish(tx, prepared) {
      await tx
        .insert(organizationDocuments)
        .values({
          organizationId: prepared.targetId,
          document: prepared.document,
          sourceVersion: prepared.version,
          schemaVersion: 1,
          searchVisible: true,
        })
        .onConflictDoUpdate({
          target: organizationDocuments.organizationId,
          set: { document: prepared.document, sourceVersion: prepared.version },
        });
      await tx.execute(sql`INSERT INTO followup (target_id,version) VALUES (${prepared.targetId},${prepared.version}::bigint)
        ON CONFLICT (target_id) DO UPDATE SET version=EXCLUDED.version`);
      if (options.failPublish) throw new Error("publication rejected");
    },
    async afterPublish() {
      if (options.failAfterPublish) throw new Error("external publication unavailable");
    },
    jobProducer: {
      async enqueueOutboxEntries(payloads) {
        if (options.failWake) throw new Error("queue unavailable");
        outboxJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        if (options.failWake) throw new Error("queue unavailable");
        rebuildJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  return { processor, outboxJobs, rebuildJobs };
}

async function register(tx: DbClient = harness.db) {
  return await persistDocumentOutboxEntries(
    tx,
    [source],
    async (db, entries) => {
      await db
        .insert(organizationDocumentOutboxEntries)
        .values(entries.map(({ id, source, createdAt }) => ({ ...source, id, createdAt })));
    },
    new Date(),
  );
}

test("source registration is rolled back with its source transaction", async () => {
  let failure: unknown;
  try {
    await harness.db.transaction(async (tx) => {
      await register(tx);
      throw new Error("source mutation rejected");
    });
  } catch (error) {
    failure = error;
  }
  const rows = await harness.sql`SELECT id FROM organization_document_outbox`;
  expect(failure).toBeInstanceOf(Error);
  expect([...rows]).toEqual([]);
});

test("completed outbox replay keeps the original requirements and never increments their versions", async () => {
  const { processor, rebuildJobs } = createProcessor();
  const [entry] = await register();
  await processor.processOutbox(entry!);
  const replay = await processor.processOutbox(entry!);
  const work = await harness.sql`SELECT version,status FROM organization_document_rebuild_state`;
  expect(replay).toEqual({ status: "replayed" });
  expect(rebuildJobs).toEqual([
    { targetId: 1, version: "1" },
    { targetId: 1, version: "1" },
  ]);
  expect([...work]).toEqual([{ version: "1", status: "pending" }]);
});

test.each([21_844, 21_845, 66_000])(
  "expansion registers all %i targets and replays their original versions",
  async (count) => {
    const targets = Array.from({ length: count }, (_, index) => count - index);
    const { processor, rebuildJobs } = createProcessor({ targets: [...targets, 1, count] });
    await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status)
    VALUES (1,7,'processed')`;
    const [entry] = await register();
    const expanded = await processor.processOutbox(entry!);
    const [receipt] = await harness.sql`SELECT status,rebuild_requests FROM organization_document_outbox`;
    const metadata = await harness.sql`SELECT count(*)::integer AS count FROM source_metadata`;
    const requirements = await harness.sql`SELECT organization_id,version,status
    FROM organization_document_rebuild_state ORDER BY organization_id`;
    expect(expanded).toEqual({ status: "expanded", registered: count });
    expect(receipt!.status).toBe("processed");
    expect(receipt!.rebuild_requests).toEqual(
      Array.from({ length: count }, (_, index) => ({ targetId: index + 1, version: index === 0 ? "8" : "1" })),
    );
    expect(rebuildJobs).toEqual(receipt!.rebuild_requests);
    expect(metadata[0]!.count).toBe(count);
    expect(requirements).toHaveLength(count);
    expect(
      requirements.every((row) => row.status === "pending" && row.version === (row.organization_id === 1 ? "8" : "1")),
    ).toBe(true);
    const replayed = await processor.processOutbox(entry!);
    const [unchanged] = await harness.sql`SELECT count(*)::integer AS count FROM organization_document_rebuild_state
    WHERE version <> CASE WHEN organization_id=1 THEN 8 ELSE 1 END`;
    expect(replayed).toEqual({ status: "replayed" });
    expect(unchanged!.count).toBe(0);
    expect(rebuildJobs.slice(count)).toEqual(receipt!.rebuild_requests);
  },
);

test("a later expansion batch failure rolls back new and existing requirements before retry", async () => {
  const { processor } = createProcessor({ targets: Array.from({ length: 1_002 }, (_, index) => index + 1) });
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status)
    VALUES (1,7,'processed')`;
  const [entry] = await register();
  await harness.sql.unsafe(`CREATE FUNCTION reject_second() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.organization_id=1001 THEN RAISE EXCEPTION 'controlled expansion failure'; END IF; RETURN NEW; END $$`);
  await harness.sql.unsafe(
    "CREATE TRIGGER reject_second BEFORE INSERT ON organization_document_rebuild_state FOR EACH ROW EXECUTE FUNCTION reject_second()",
  );
  let failure: unknown;
  try {
    await processor.processOutbox(entry!);
  } catch (error) {
    failure = error;
  }
  const work = await harness.sql`SELECT organization_id,version,status FROM organization_document_rebuild_state`;
  const receipts = await harness.sql`SELECT status,rebuild_requests FROM organization_document_outbox`;
  await harness.sql.unsafe("DROP TRIGGER reject_second ON organization_document_rebuild_state");
  await harness.sql.unsafe("DROP FUNCTION reject_second()");
  const retry = await processor.processOutbox(entry!);
  const retried =
    await harness.sql`SELECT organization_id,version FROM organization_document_rebuild_state ORDER BY organization_id`;
  expect(failure).toBeInstanceOf(Error);
  expect([...work]).toEqual([{ organization_id: 1, version: "7", status: "processed" }]);
  expect([...receipts]).toEqual([{ status: "failed", rebuild_requests: [] }]);
  expect(retry).toEqual({ status: "expanded", registered: 1_002 });
  expect([...retried]).toEqual(
    Array.from({ length: 1_002 }, (_, index) => ({ organization_id: index + 1, version: index === 0 ? "8" : "1" })),
  );
});

test("domain registration failure rolls back requirements, metadata and receipt together before retry", async () => {
  const [entry] = await register();
  let failure: unknown;
  try {
    await createProcessor({ failRegistered: true }).processor.processOutbox(entry!);
  } catch (error) {
    failure = error;
  }
  const requirements = await harness.sql`SELECT version FROM organization_document_rebuild_state`;
  const metadata = await harness.sql`SELECT version FROM source_metadata`;
  const entries = await harness.sql`SELECT status,rebuild_requests FROM organization_document_outbox`;
  expect(failure).toBeInstanceOf(Error);
  expect([...requirements]).toEqual([]);
  expect([...metadata]).toEqual([]);
  expect([...entries]).toEqual([{ status: "failed", rebuild_requests: [] }]);
  const retried = await createProcessor().processor.processOutbox(entry!);
  const committedMetadata = await harness.sql`SELECT target_id,version FROM source_metadata`;
  expect(retried).toEqual({ status: "expanded", registered: 1 });
  expect([...committedMetadata]).toEqual([{ target_id: 1, version: "1" }]);
});

test("publication and pending external obligations roll back together and stay retryable", async () => {
  const rejected = createProcessor({ failPublish: true });
  const [entry] = await register();
  await rejected.processor.processOutbox(entry!);
  let failure: unknown;
  try {
    await rejected.processor.processRebuild({ targetId: 1, version: "1" });
  } catch (error) {
    failure = error;
  }
  const documents = await harness.sql`SELECT source_version FROM organization_document`;
  const obligations = await harness.sql`SELECT version FROM followup`;
  const work = await harness.sql`SELECT version,status FROM organization_document_rebuild_state`;
  const retry = await createProcessor().processor.processRebuild({ targetId: 1, version: "1" });
  expect(failure).toBeInstanceOf(Error);
  expect([...documents]).toEqual([]);
  expect([...obligations]).toEqual([]);
  expect([...work]).toEqual([{ version: "1", status: "failed" }]);
  expect(retry).toEqual({ status: "published" });
});

test("external publication failure leaves committed completion and its durable recovery obligation intact", async () => {
  const { processor } = createProcessor({ failAfterPublish: true });
  const [entry] = await register();
  await processor.processOutbox(entry!);
  let failure: unknown;
  try {
    await processor.processRebuild({ targetId: 1, version: "1" });
  } catch (error) {
    failure = error;
  }
  const documents = await harness.sql`SELECT source_version FROM organization_document`;
  const obligations = await harness.sql`SELECT version FROM followup`;
  const work = await harness.sql`SELECT version,status FROM organization_document_rebuild_state`;
  expect(failure).toBeInstanceOf(Error);
  expect([...documents]).toEqual([{ source_version: "1" }]);
  expect([...obligations]).toEqual([{ version: "1" }]);
  expect([...work]).toEqual([{ version: "1", status: "processed" }]);
});

test("repair recovers both lost wakeups and fences a previous same-version owner", async () => {
  const { processor, outboxJobs, rebuildJobs } = createProcessor();
  const [entry] = await register();
  const pending = await processor.repairFailedOrStale({ limit: 10, staleBefore: new Date() });
  await processor.processOutbox(entry!);
  const old = await processor.prepareRebuild({ targetId: 1, version: "1" });
  await harness.db
    .update(organizationDocumentRebuildStates)
    .set({ processingStartedAt: new Date(0) })
    .where(eq(organizationDocumentRebuildStates.organizationId, 1));
  const recovered = await processor.repairFailedOrStale({ limit: 10, staleBefore: new Date() });
  const replacement = await processor.prepareRebuild({ targetId: 1, version: "1" });
  const stale = await processor.publishPrepared(old!);
  const published = await processor.publishPrepared(replacement!);
  expect(pending.outbox).toMatchObject({ selected: 1, enqueued: 1 });
  expect(outboxJobs).toEqual([entry!]);
  expect(recovered.rebuilds).toMatchObject({ selected: 1, enqueued: 1 });
  expect(rebuildJobs).toEqual([
    { targetId: 1, version: "1" },
    { targetId: 1, version: "1" },
  ]);
  expect(stale).toEqual({ status: "stale" });
  expect(published).toEqual({ status: "published" });
});

test("large versions remain exact and a newer requirement fences an older candidate", async () => {
  const { processor } = createProcessor();
  const [entry] = await register();
  await processor.processOutbox(entry!);
  await harness.sql`UPDATE organization_document_rebuild_state SET version=9007199254740993 WHERE organization_id=1`;
  const prepared = await processor.prepareRebuild({ targetId: 1, version: "9007199254740993" });
  const [newEntry] = await register();
  await processor.processOutbox(newEntry!);
  const stale = await processor.publishPrepared(prepared!);
  const published = await processor.processRebuild({ targetId: 1, version: "9007199254740994" });
  const document = await harness.sql`SELECT source_version,document FROM organization_document`;
  expect(stale).toEqual({ status: "stale" });
  expect(published).toEqual({ status: "published" });
  expect(document[0]).toEqual({
    source_version: "9007199254740994",
    document: { name: "Published", sourceVersion: "9007199254740994" },
  });
});

test("batch claims keep exact versions and only acquire current pending or failed targets", async () => {
  const { processor } = createProcessor();
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status,processing_token,processing_started_at)
    VALUES (1,9007199254740993,'pending',NULL,NULL),
      (2,1,'processing','10000000-0000-4000-8000-000000000002',now()),
      (3,1,'processed',NULL,NULL),(4,7,'failed',NULL,NULL)`;
  const claims = await processor.claimRebuilds([
    { targetId: 4, version: "7" },
    { targetId: 1, version: "9007199254740992" },
    { targetId: 1, version: "9007199254740993" },
    { targetId: 1, version: "9007199254740993" },
    { targetId: 2, version: "1" },
    { targetId: 3, version: "1" },
  ]);
  const work = await harness.sql`SELECT organization_id,version,status,processing_token,attempts
    FROM organization_document_rebuild_state ORDER BY organization_id`;
  expect(claims.map(({ targetId, version }) => ({ targetId, version }))).toEqual([
    { targetId: 1, version: "9007199254740993" },
    { targetId: 4, version: "7" },
  ]);
  expect(new Set(claims.map(({ processingToken }) => processingToken)).size).toBe(2);
  expect(work.map(({ organization_id, status, attempts }) => ({ organization_id, status, attempts }))).toEqual([
    { organization_id: 1, status: "processing", attempts: 1 },
    { organization_id: 2, status: "processing", attempts: 0 },
    { organization_id: 3, status: "processed", attempts: 0 },
    { organization_id: 4, status: "processing", attempts: 1 },
  ]);
  expect(work[0]!.processing_token).toBe(claims[0]!.processingToken);
  expect(work[3]!.processing_token).toBe(claims[1]!.processingToken);
});

test("failed batch cleanup cannot clear replacement owners or newer requirements", async () => {
  const { processor } = createProcessor();
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status)
    VALUES (1,1,'pending'),(2,1,'pending'),(3,1,'pending')`;
  const old = await processor.claimRebuilds([1, 2, 3].map((targetId) => ({ targetId, version: "1" })));
  await harness.sql`UPDATE organization_document_rebuild_state SET status='pending',processing_token=NULL
    WHERE organization_id=1`;
  const replacement = await processor.claimRebuilds([{ targetId: 1, version: "1" }]);
  await harness.sql`UPDATE organization_document_rebuild_state SET version=2,status='pending',processing_token=NULL
    WHERE organization_id=2`;
  await processor.failRebuilds(old, new Error("batch source unavailable"));
  const work = await harness.sql`SELECT organization_id,version,status,processing_token,last_error
    FROM organization_document_rebuild_state ORDER BY organization_id`;
  expect(work[0]).toMatchObject({
    organization_id: 1,
    version: "1",
    status: "processing",
    processing_token: replacement[0]!.processingToken,
  });
  expect(work[1]).toMatchObject({ organization_id: 2, version: "2", status: "pending", processing_token: null });
  expect(work[2]).toMatchObject({
    organization_id: 3,
    version: "1",
    status: "failed",
    processing_token: null,
    last_error: "batch source unavailable",
  });
});

test("a later batch claim failure does not leave earlier targets owned", async () => {
  const { processor } = createProcessor();
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status)
    SELECT generate_series(1,1002),1,'pending'`;
  await harness.sql.unsafe(`CREATE FUNCTION reject_claim() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.organization_id=1001 THEN RAISE EXCEPTION 'controlled claim failure'; END IF; RETURN NEW; END $$`);
  await harness.sql.unsafe(
    "CREATE TRIGGER reject_claim BEFORE UPDATE ON organization_document_rebuild_state FOR EACH ROW EXECUTE FUNCTION reject_claim()",
  );
  let failure: unknown;
  try {
    await processor.claimRebuilds(Array.from({ length: 1_002 }, (_, index) => ({ targetId: index + 1, version: "1" })));
  } catch (error) {
    failure = error;
  } finally {
    await harness.sql.unsafe("DROP TRIGGER reject_claim ON organization_document_rebuild_state");
    await harness.sql.unsafe("DROP FUNCTION reject_claim()");
  }
  const [work] = await harness.sql`SELECT count(*)::integer AS pending FROM organization_document_rebuild_state
    WHERE status='pending' AND processing_token IS NULL AND attempts=0`;
  expect(failure).toBeInstanceOf(Error);
  expect(work!.pending).toBe(1_002);
});

test("failed wakeups retain diagnostics and requirements in both durable stages", async () => {
  const [entry] = await register();
  await harness.sql`UPDATE organization_document_outbox SET status='failed',last_error='expansion failed',attempts=3 WHERE id=${entry!.outboxId}`;
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,version,status,last_error,attempts) VALUES (1,7,'failed','build failed',3)`;
  const report = await createProcessor({ failWake: true }).processor.repairFailedOrStale({
    staleBefore: new Date(),
    limit: 10,
  });
  const outbox = await harness.sql`SELECT status,last_error,attempts FROM organization_document_outbox`;
  const rebuilds =
    await harness.sql`SELECT version,status,last_error,attempts FROM organization_document_rebuild_state`;
  expect(report).toEqual({
    outbox: { selected: 1, enqueued: 0, failed: 1 },
    rebuilds: { selected: 1, enqueued: 0, failed: 1 },
    enqueued: 0,
    failed: 2,
  });
  expect(outbox[0]).toMatchObject({ status: "pending", last_error: "expansion failed", attempts: 3 });
  expect(rebuilds[0]).toMatchObject({ version: "7", status: "pending", last_error: "build failed", attempts: 3 });
});

test("repair resets and wakes both durable stages beyond the SQL parameter limit", async () => {
  const count = 65_534;
  const entries = await harness.sql`INSERT INTO organization_document_outbox
    (id,organization_id,scope,status,last_error,attempts)
    SELECT gen_random_uuid(), id, 'self', 'failed', 'expansion failed', 3
    FROM generate_series(1, ${count}::integer) AS id RETURNING id`;
  await harness.sql`INSERT INTO organization_document_rebuild_state
    (organization_id,version,status,last_error,attempts)
    SELECT id, 7, 'failed', 'build failed', 3 FROM generate_series(1, ${count}::integer) AS id`;
  const { processor, outboxJobs, rebuildJobs } = createProcessor();
  const report = await processor.repairFailedOrStale({ staleBefore: new Date(), limit: count });
  const [outbox] = await harness.sql`SELECT count(*)::integer AS count FROM organization_document_outbox
    WHERE status='pending' AND attempts=3 AND last_error='expansion failed'`;
  const [rebuilds] = await harness.sql`SELECT count(*)::integer AS count FROM organization_document_rebuild_state
    WHERE status='pending' AND version=7 AND attempts=3 AND last_error='build failed'`;
  expect(report).toEqual({
    outbox: { selected: count, enqueued: count, failed: 0 },
    rebuilds: { selected: count, enqueued: count, failed: 0 },
    enqueued: count * 2,
    failed: 0,
  });
  expect(outboxJobs.map(({ outboxId }) => outboxId).sort()).toEqual(entries.map(({ id }) => id).sort());
  expect(rebuildJobs).toEqual(Array.from({ length: count }, (_, index) => ({ targetId: index + 1, version: "7" })));
  expect(outbox!.count).toBe(count);
  expect(rebuilds!.count).toBe(count);
});

test("repair skips active transactions even when their claims are old", async () => {
  const [entry] = await register();
  await harness.sql`UPDATE organization_document_outbox SET status='processing',processing_token='00000000-0000-4000-8000-000000000001',processing_started_at='2000-01-01' WHERE id=${entry!.outboxId}`;
  await harness.sql`INSERT INTO organization_document_rebuild_state (organization_id,status,processing_token,processing_started_at)
    VALUES (1,'processing','00000000-0000-4000-8000-000000000002','2000-01-01')`;
  const blocker = await harness.sql.reserve();
  try {
    await blocker.unsafe("BEGIN");
    await blocker.unsafe("SELECT id FROM organization_document_outbox FOR UPDATE");
    await blocker.unsafe("SELECT organization_id FROM organization_document_rebuild_state FOR UPDATE");
    const report = await createProcessor().processor.repairFailedOrStale({ staleBefore: new Date(), limit: 10 });
    expect(report).toEqual({
      outbox: { selected: 0, enqueued: 0, failed: 0 },
      rebuilds: { selected: 0, enqueued: 0, failed: 0 },
      enqueued: 0,
      failed: 0,
    });
  } finally {
    await blocker.unsafe("ROLLBACK");
    blocker.release();
  }
});

test("a late outbox owner cannot consume a receipt after an expired claim is replaced", async () => {
  const [entry] = await register();
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
  const lateOperation = createProcessor({ db: delayedDb }).processor.processOutbox(entry!);
  try {
    await claimed;
    const { processor } = createProcessor();
    await processor.repairFailedOrStale({ staleBefore: new Date(Date.now() + 1000), limit: 10 });
    const replacement = await processor.processOutbox(entry!);
    release();
    const late = await lateOperation;
    const work = await harness.sql`SELECT version,status FROM organization_document_rebuild_state`;
    expect(replacement).toEqual({ status: "expanded", registered: 1 });
    expect(late).toEqual({ status: "stale" });
    expect([...work]).toEqual([{ version: "1", status: "pending" }]);
  } finally {
    release();
    await lateOperation;
  }
});
