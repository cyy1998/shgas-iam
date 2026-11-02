import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  OrganizationResponsibilityTypeCode,
  type RebuildUserDocumentJobPayload,
  UserDocumentRebuildReason,
} from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import { userDocumentOutboxEntries } from "@iam/db/schema";
import { createUserDocumentAffectedUserRepository } from "../../src/invalidation/affected-user.repository";
import { createCurrentUserDocumentProjectionBundle, createUserDocumentUpdateProcessor } from "../../src/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const observedAt = new Date("2026-10-26T10:00:00Z");
let pg: Awaited<ReturnType<typeof createPostgresTestHarness>>;
beforeAll(async () => {
  pg = await createPostgresTestHarness();
});
beforeEach(async () => {
  await pg.reset();
  await pg.sql`TRUNCATE employment RESTART IDENTITY CASCADE`;
});
afterAll(async () => {
  await pg?.close();
});

function runtime() {
  const jobs: RebuildUserDocumentJobPayload[] = [];
  const processor = createUserDocumentUpdateProcessor({
    db: pg.db,
    clock: { nowDate: () => observedAt },
    logger: { warn() {} },
    batchSize: 10,
    projection: createCurrentUserDocumentProjectionBundle(),
    subjectFactsPublisher: {
      async publish() {
        return { status: "published" as const };
      },
    },
    subjectAccessRepair: {
      async repairSubject() {
        return { status: "stable" };
      },
    },
    jobProducer: {
      async enqueueOutboxEntries(entries) {
        return { enqueued: entries.length, jobIds: entries.map(() => randomUUID()) };
      },
      async enqueueRebuildJobs(requests) {
        jobs.push(...requests);
        return { enqueued: requests.length, jobIds: requests.map(() => randomUUID()) };
      },
    },
  });
  return { processor, jobs };
}

test("a large completed receipt replays every target with its original version and current metadata", async () => {
  const count = 65_534;
  await pg.sql`INSERT INTO user_document_rebuild_state
    (user_id, version, reason_codes, dirty_at, request_id, trace_id)
    SELECT id, 2, ${JSON.stringify([UserDocumentRebuildReason.OrganizationUpdated])}::jsonb,
      ${observedAt.toISOString()}, 'large-request', 'large-trace'
    FROM generate_series(1, ${count}) AS id`;
  const id = randomUUID();
  await pg.db.insert(userDocumentOutboxEntries).values({
    id,
    source: { change: { kind: "user", userId: 1 } },
    status: "processed",
    rebuildRequests: Array.from({ length: count }, (_, index) => ({ targetId: index + 1, version: "1" })),
  });
  const { processor, jobs } = runtime();
  const result = await processor.processOutbox({ outboxId: id });
  expect(result).toEqual({ status: "replayed" });
  expect(jobs.length).toBe(count);
  expect(new Set(jobs.map(({ userId }) => userId)).size).toBe(count);
  expect(
    jobs.every(
      (job) =>
        job.version === "1" &&
        job.requestId === "large-request" &&
        job.traceId === "large-trace" &&
        job.reason === UserDocumentRebuildReason.OrganizationUpdated &&
        job.requestedAt === observedAt.toISOString(),
    ),
  ).toBe(true);
  expect(jobs.at(-1)?.userId).toBe(count);
});

test("a large position expansion commits every requirement with its source metadata", async () => {
  const count = 65_534;
  await seedEmployments(count);
  const id = randomUUID();
  await pg.db.insert(userDocumentOutboxEntries).values({
    id,
    source: {
      change: { kind: "position", positionId: 1 },
      requestId: "position-request",
      traceId: "position-trace",
    },
  });
  const { processor, jobs } = runtime();
  const result = await processor.processOutbox({ outboxId: id });
  const [coverage] = await pg.sql`SELECT count(*)::integer AS count,
    bool_and(version=1 AND reason_codes=${JSON.stringify([UserDocumentRebuildReason.PositionUpdated])}::jsonb
      AND request_id='position-request' AND trace_id='position-trace') AS complete
    FROM user_document_rebuild_state`;
  const [receipt] = await pg.sql`SELECT status, jsonb_array_length(rebuild_requests) AS count
    FROM user_document_outbox WHERE id=${id}`;
  expect(result).toEqual({ status: "expanded", registered: count });
  expect(coverage).toEqual({ count, complete: true });
  expect(receipt).toEqual({ status: "processed", count });
  expect(new Set(jobs.map(({ userId }) => userId)).size).toBe(count);
  expect(
    jobs.every(
      (job) =>
        job.version === "1" &&
        job.requestId === "position-request" &&
        job.traceId === "position-trace" &&
        job.reason === UserDocumentRebuildReason.PositionUpdated,
    ),
  ).toBe(true);
});

test("a later registration metadata failure rolls back earlier batches and their receipt before retry", async () => {
  const count = 2_001;
  await seedEmployments(count);
  await pg.sql`INSERT INTO user_document_rebuild_state (user_id, version, request_id)
    SELECT id, 7, 'original-request' FROM generate_series(1, ${count}) AS id`;
  const id = randomUUID();
  await pg.db.insert(userDocumentOutboxEntries).values({
    id,
    source: { change: { kind: "position", positionId: 1 }, requestId: "rejected-request" },
  });
  const { processor, jobs } = runtime();
  await pg.sql.unsafe(`CREATE FUNCTION reject_later_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.user_id=1500 AND NEW.request_id='rejected-request'
      THEN RAISE EXCEPTION 'LaterMetadataRejected'; END IF; RETURN NEW; END $$`);
  await pg.sql.unsafe(
    "CREATE TRIGGER reject_later_metadata BEFORE UPDATE ON user_document_rebuild_state FOR EACH ROW EXECUTE FUNCTION reject_later_metadata()",
  );
  let failure: unknown;
  try {
    await processor.processOutbox({ outboxId: id });
  } catch (error) {
    failure = error;
  } finally {
    await pg.sql.unsafe("DROP TRIGGER reject_later_metadata ON user_document_rebuild_state");
    await pg.sql.unsafe("DROP FUNCTION reject_later_metadata()");
  }
  const [rolledBack] = await pg.sql`SELECT count(*)::integer AS count,
    bool_and(version=7 AND request_id='original-request' AND reason_codes='[]'::jsonb) AS unchanged
    FROM user_document_rebuild_state`;
  const [receipt] = await pg.sql`SELECT status, rebuild_requests FROM user_document_outbox WHERE id=${id}`;
  expect(failure).toBeInstanceOf(Error);
  expect(rolledBack).toEqual({ count, unchanged: true });
  expect(receipt).toEqual({ status: "failed", rebuild_requests: [] });
  expect(jobs).toEqual([]);
  const result = await processor.processOutbox({ outboxId: id });
  expect(result).toEqual({ status: "expanded", registered: count });
  expect(jobs.length).toBe(count);
  expect(jobs.every((job) => job.version === "8" && job.requestId === "rejected-request")).toBe(true);
});

test("large responsibility employment lists retain every distinct affected user", async () => {
  const count = 65_534;
  await seedEmployments(count);
  // A user can hold several assignments; duplicate resolver output must not duplicate rebuild work.
  await pg.sql`UPDATE employment SET user_id=1, dept_id=id WHERE id IN (1001, 65534)`;
  const employmentIds = Array.from({ length: count }, (_, index) => count - index);
  employmentIds.push(1, 1001, 65534);
  const repository = createUserDocumentAffectedUserRepository(
    pg.db,
    {
      async resolveAffectedUserIds() {
        return [];
      },
    },
    {
      async resolveHolderEmploymentIds() {
        return employmentIds;
      },
      async resolveHolderEmploymentIdsByTypes() {
        return employmentIds;
      },
    },
  );
  const ids = await repository.findResponsibilityHoldersByTypeCodes(
    [OrganizationResponsibilityTypeCode.Head],
    observedAt,
  );
  expect(ids.length).toBe(count - 2);
  expect(new Set(ids).size).toBe(count - 2);
  expect(ids).toContain(1);
  expect(ids).toContain(65_533);
  expect(ids).not.toContain(1001);
  expect(ids).not.toContain(65_534);
});

test("large post-publication repair rolls back only the rejected ownership page", async () => {
  const count = 65_534;
  await pg.sql`INSERT INTO user_document_rebuild_state
    (user_id, status, post_publication_version, post_publication_status, post_publication_token, post_publication_started_at)
    SELECT id, 'processed', 1, 'processing', gen_random_uuid(), '2000-01-01'::timestamp
    FROM generate_series(1, ${count}) AS id`;
  await pg.sql.unsafe(`CREATE FUNCTION reject_later_repair() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.user_id=15 AND NEW.post_publication_status='processing'
      AND NEW.post_publication_token IS DISTINCT FROM OLD.post_publication_token
      THEN RAISE EXCEPTION 'LaterRepairRejected'; END IF; RETURN NEW; END $$`);
  await pg.sql.unsafe(
    "CREATE TRIGGER reject_later_repair BEFORE UPDATE ON user_document_rebuild_state FOR EACH ROW EXECUTE FUNCTION reject_later_repair()",
  );
  let failure: unknown;
  try {
    await runtime().processor.repairFailedOrStale({ staleBefore: observedAt, limit: count });
  } catch (error) {
    failure = error;
  } finally {
    await pg.sql.unsafe("DROP TRIGGER reject_later_repair ON user_document_rebuild_state");
    await pg.sql.unsafe("DROP FUNCTION reject_later_repair()");
  }
  const [remaining] = await pg.sql`SELECT count(*)::integer AS count,
    count(*) FILTER (WHERE user_id<=10 AND post_publication_status='failed'
      AND post_publication_token IS NULL AND post_publication_attempts=1)::integer AS recorded,
    count(*) FILTER (WHERE user_id>10 AND post_publication_status='processing'
      AND post_publication_token IS NOT NULL AND post_publication_attempts=0
      AND post_publication_started_at='2000-01-01'::timestamp)::integer AS untouched
    FROM user_document_rebuild_state`;
  expect(extractPostgresError(failure)?.code).toBe("P0001");
  expect(remaining).toEqual({ count, recorded: 10, untouched: count - 10 });
});

async function seedEmployments(count: number) {
  await pg.sql`INSERT INTO employment (id, user_id, pos_id, dept_id, start_time)
    SELECT id, id, 1, 1, '2026-01-01'::timestamp FROM generate_series(1, ${count}) AS id`;
}
