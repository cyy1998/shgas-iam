import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createSubjectAccessRepair } from "@iam/api-core/subject-access";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { createUnitOfWork } from "@iam/api-core/uow";
import {
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  type RebuildUserDocumentJobPayload,
  RoleAssignmentTargetType,
  type UserDocumentOutboxJobPayload,
  UserStatus,
} from "@iam/contracts";
import {
  clients,
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  roles,
  userDocumentOutboxEntries,
  userDocumentRebuildStates,
  userDocuments,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { eq } from "drizzle-orm";
import { createUserDocumentInvalidation, type UserDocumentSourceChange } from "../../src/producer";
import { createInternalUserDocumentQueryRepository } from "../../src/query/internal-user-query.repository";
import { createInternalUserDocumentQueryService } from "../../src/query/internal-user-query.service";
import type { DocumentFactsCacheRecord } from "../../src/subject-facts";
import { createDocumentFactsReader, createSubjectFactsReader } from "../../src/subject-facts";
import {
  createCurrentUserDocumentProjectionBundle,
  createSubjectAccessAuthorityRepository,
  createUserDocumentUpdateProcessor,
} from "../../src/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";
import { createRedisTestHarness, type RedisTestScope } from "../support/redis-test-harness";

const observedAt = new Date("2026-10-26T10:00:00Z");
const clock = { nowDate: () => observedAt };
const logger = { info() {}, warn() {}, error() {} };
const subject = "10000000-0000-4000-8000-000000000001";
let pg: Awaited<ReturnType<typeof createPostgresTestHarness>>;
let redis: Awaited<ReturnType<typeof createRedisTestHarness>>;
beforeAll(async () => {
  pg = await createPostgresTestHarness();
  try {
    redis = await createRedisTestHarness();
  } catch (error) {
    await pg.close();
    throw error;
  }
});
beforeEach(async () => {
  await pg.reset();
  await pg.sql`TRUNCATE role_assignment, role, client, organization_responsibility_assignment, employment, organization_closure, organization, position RESTART IDENTITY CASCADE`;
  await pg.db.insert(users).values({ id: 1, subjectIdentifier: subject, username: "first", name: "First" });
});
afterEach(async () => {
  await redis?.reset();
});
afterAll(async () => {
  await runWithOwnedTestResources(async (lifecycle) => {
    lifecycle.registerCleanup(() => pg?.close());
    lifecycle.registerCleanup(() => redis?.close());
  });
});

function runtime(
  scope: RedisTestScope,
  options: {
    logger?: { warn(data: unknown, message: string): void };
    publish?: (record: DocumentFactsCacheRecord) => ReturnType<RedisTestScope["firstFactsPublisher"]["publish"]>;
    repair?: { repairSubject(subjectIdentifier: string): Promise<unknown> };
    projection?: ReturnType<typeof createCurrentUserDocumentProjectionBundle>;
  } = {},
) {
  const jobs: Array<
    | { kind: "outbox"; payload: UserDocumentOutboxJobPayload }
    | { kind: "rebuild"; payload: RebuildUserDocumentJobPayload }
  > = [];
  let failWake = false;
  const jobProducer = {
    async enqueueOutboxEntries(payloads: UserDocumentOutboxJobPayload[]) {
      if (failWake) throw new Error("QueueUnavailable");
      jobs.push(...payloads.map((payload) => ({ kind: "outbox" as const, payload })));
      return { enqueued: payloads.length, jobIds: payloads.map(() => randomUUID()) };
    },
    async enqueueRebuildJobs(payloads: RebuildUserDocumentJobPayload[]) {
      if (failWake) throw new Error("QueueUnavailable");
      jobs.push(...payloads.map((payload) => ({ kind: "rebuild" as const, payload })));
      return { enqueued: payloads.length, jobIds: payloads.map(() => randomUUID()) };
    },
  };
  const uow = createUnitOfWork({
    db: pg.db,
    logger,
    createTxPorts: (tx, lifecycle) => ({
      db: tx,
      invalidation: createUserDocumentInvalidation({ db: tx, lifecycle, jobProducer, clock }),
    }),
  });
  const processor = createUserDocumentUpdateProcessor({
    db: pg.db,
    jobProducer,
    clock,
    logger: options.logger ?? logger,
    batchSize: 10,
    projection: options.projection ?? createCurrentUserDocumentProjectionBundle(),
    subjectFactsPublisher: { publish: options.publish ?? scope.firstFactsPublisher.publish },
    subjectAccessRepair: options.repair ?? {
      async repairSubject() {
        return { status: "stable" };
      },
    },
  });
  return {
    uow,
    processor,
    jobs,
    setWakeFailure(value: boolean) {
      failWake = value;
    },
    async record(changes: readonly UserDocumentSourceChange[]) {
      await uow.transaction(async (tx) => {
        await tx.invalidation.recordChanges(changes);
      });
    },
    async drain() {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        if (job.kind === "outbox") await processor.processOutbox(job.payload);
        else await processor.process(job.payload);
      }
    },
  };
}

async function batchRequests(context: ReturnType<typeof runtime>) {
  const requests: RebuildUserDocumentJobPayload[] = [];
  for (let job = context.jobs.shift(); job; job = context.jobs.shift()) {
    if (job.kind === "outbox") await context.processor.processOutbox(job.payload);
    else requests.push(job.payload);
  }
  return requests;
}

async function withRedisScope(work: (scope: RedisTestScope) => Promise<void>) {
  const scope = await redis.createScope();
  try {
    await work(scope);
  } finally {
    await scope.close();
  }
}

async function createSecondUser() {
  await pg.db.insert(users).values({
    id: 2,
    subjectIdentifier: "10000000-0000-4000-8000-000000000002",
    username: "second",
    name: "Second",
  });
}

test("batch rebuilding publishes healthy users when another user's source is invalid", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    await pg.db.update(users).set({ name: "" }).where(eq(users.id, 1));
    const context = runtime(scope);
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const requests = await batchRequests(context);
    let failure: unknown;
    try {
      await context.processor.processBatch(requests);
    } catch (error) {
      failure = error;
    }
    const documents = await pg.sql`SELECT user_id,source_version FROM user_document ORDER BY user_id`;
    const work = await pg.sql`SELECT user_id,status,processing_token FROM user_document_rebuild_state ORDER BY user_id`;
    expect(failure).toBeInstanceOf(AggregateError);
    expect([...documents]).toEqual([{ user_id: 2, source_version: "1" }]);
    expect([...work]).toEqual([
      { user_id: 1, status: "failed", processing_token: null },
      { user_id: 2, status: "processed", processing_token: null },
    ]);
    await pg.db.update(users).set({ name: "First" }).where(eq(users.id, 1));
    const retry = await context.processor.processBatch(requests);
    expect(retry).toMatchObject({ status: "rebuilt", requested: 2, rebuilt: 1, skipped: 1, stale: 0 });
  });
});

test("a shared batch source failure releases every current claim for repair", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    const projection = createCurrentUserDocumentProjectionBundle();
    const context = runtime(scope, {
      projection: {
        ...projection,
        createBuilder(input) {
          return {
            ...projection.createBuilder(input),
            async buildManyResults() {
              throw new Error("SourceSnapshotUnavailable");
            },
          };
        },
      },
    });
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const requests = await batchRequests(context);
    let failure: unknown;
    try {
      await context.processor.processBatch(requests);
    } catch (error) {
      failure = error;
    }
    const work = await pg.sql`SELECT user_id,status,processing_token FROM user_document_rebuild_state ORDER BY user_id`;
    const documents = await pg.sql`SELECT user_id FROM user_document`;
    expect(failure).toBeInstanceOf(AggregateError);
    expect([...work]).toEqual([
      { user_id: 1, status: "failed", processing_token: null },
      { user_id: 2, status: "failed", processing_token: null },
    ]);
    expect([...documents]).toEqual([]);
    const repaired = await runtime(scope).processor.processBatch(requests);
    expect(repaired).toMatchObject({ rebuilt: 2, skipped: 0 });
  });
});

test("a batch builder that omits a claimed target cannot complete any unverified result", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    const projection = createCurrentUserDocumentProjectionBundle();
    const context = runtime(scope, {
      projection: {
        ...projection,
        createBuilder(input) {
          const builder = projection.createBuilder(input);
          return {
            ...builder,
            async buildManyResults(targets) {
              return (await builder.buildManyResults(targets)).filter(({ userId }) => userId !== 2);
            },
          };
        },
      },
    });
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const requests = await batchRequests(context);
    let failure: unknown;
    try {
      await context.processor.processBatch(requests);
    } catch (error) {
      failure = error;
    }
    const documents = await pg.sql`SELECT user_id FROM user_document`;
    const work = await pg.sql`SELECT status,processing_token FROM user_document_rebuild_state`;
    expect(failure).toBeInstanceOf(AggregateError);
    expect([...documents]).toEqual([]);
    expect(work.every((row) => row.status === "failed" && row.processing_token === null)).toBe(true);
  });
});

test("a publication batch commits every healthy document before any cache side effect starts", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    const observed: number[] = [];
    const context = runtime(scope, {
      async publish(record) {
        const [coverage] = await pg.sql`SELECT count(*)::int AS count FROM user_document
          WHERE source_version=1 AND document IS NOT NULL`;
        observed.push(coverage!.count);
        return await scope.firstFactsPublisher.publish(record);
      },
    });
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const result = await context.processor.processBatch(await batchRequests(context));
    expect(result).toMatchObject({ rebuilt: 2 });
    expect(observed).toEqual([2, 2]);
    const work = await pg.sql`SELECT status,post_publication_status FROM user_document_rebuild_state`;
    expect(work.every((row) => row.status === "processed" && row.post_publication_status === "processed")).toBe(true);
  });
});

test("batch cache failures retain committed documents and do not block other users", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    const context = runtime(scope, {
      async publish(record) {
        if (record.subjectIdentifier === subject) throw new Error("FactsUnavailable");
        return await scope.firstFactsPublisher.publish(record);
      },
    });
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const requests = await batchRequests(context);
    const result = await context.processor.processBatch(requests);
    const work =
      await pg.sql`SELECT user_id,status,post_publication_status FROM user_document_rebuild_state ORDER BY user_id`;
    expect(result).toMatchObject({ rebuilt: 2 });
    expect([...work]).toEqual([
      { user_id: 1, status: "processed", post_publication_status: "failed" },
      { user_id: 2, status: "processed", post_publication_status: "processed" },
    ]);
    const repair = await runtime(scope).processor.repairFailedOrStale({ staleBefore: new Date(), limit: 10 });
    expect(repair.postPublication).toMatchObject({ selected: 1, completed: 1, failed: 0 });
  });
});

test("a newer request fences only its stale member of an in-flight batch", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    const projection = createCurrentUserDocumentProjectionBundle();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const context = runtime(scope, {
      projection: {
        ...projection,
        createBuilder(input) {
          const builder = projection.createBuilder(input);
          return {
            ...builder,
            async buildManyResults(targets) {
              const results = await builder.buildManyResults(targets);
              entered.resolve();
              await resume.promise;
              return results;
            },
          };
        },
      },
    });
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const requests = await batchRequests(context);
    const oldBatch = context.processor.processBatch(requests);
    void oldBatch.catch((error) => entered.reject(error));
    let oldResult: Awaited<typeof oldBatch> | undefined;
    try {
      await entered.promise;
      const replacement = runtime(scope);
      await replacement.uow.transaction(async (tx) => {
        await tx.db.update(users).set({ name: "First updated" }).where(eq(users.id, 1));
        await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
      });
      const current = await replacement.processor.processBatch(await batchRequests(replacement));
      expect(current).toMatchObject({ rebuilt: 1 });
    } finally {
      resume.resolve();
      oldResult = await oldBatch;
    }
    const documents =
      await pg.sql`SELECT user_id,source_version,document->>'name' AS name FROM user_document ORDER BY user_id`;
    expect(oldResult).toMatchObject({ rebuilt: 1, stale: 1 });
    expect([...documents]).toEqual([
      { user_id: 1, source_version: "2", name: "First updated" },
      { user_id: 2, source_version: "1", name: "Second" },
    ]);
  });
});

test("a missing post-publication registration cannot acknowledge the corresponding document", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    const context = runtime(scope);
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const requests = await batchRequests(context);
    await pg.sql.unsafe(`CREATE FUNCTION suppress_post_registration() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id=1 AND NEW.post_publication_status='pending' THEN RETURN NULL; END IF; RETURN NEW; END $$`);
    await pg.sql.unsafe(
      "CREATE TRIGGER suppress_post_registration BEFORE UPDATE ON user_document_rebuild_state FOR EACH ROW EXECUTE FUNCTION suppress_post_registration()",
    );
    let failure: unknown;
    try {
      await context.processor.processBatch(requests);
    } catch (error) {
      failure = error;
    } finally {
      await pg.sql.unsafe("DROP TRIGGER suppress_post_registration ON user_document_rebuild_state");
      await pg.sql.unsafe("DROP FUNCTION suppress_post_registration()");
    }
    const documents = await pg.sql`SELECT user_id FROM user_document ORDER BY user_id`;
    const work =
      await pg.sql`SELECT user_id,status,post_publication_status FROM user_document_rebuild_state ORDER BY user_id`;
    expect(failure).toBeInstanceOf(AggregateError);
    expect([...documents]).toEqual([{ user_id: 2 }]);
    expect([...work]).toEqual([
      { user_id: 1, status: "failed", post_publication_status: null },
      { user_id: 2, status: "processed", post_publication_status: "processed" },
    ]);
  });
});

test("one target's publication rollback does not stop healthy batch members", async () => {
  await withRedisScope(async (scope) => {
    await createSecondUser();
    const context = runtime(scope);
    await context.record([
      { kind: "user", userId: 1 },
      { kind: "user", userId: 2 },
    ]);
    const requests = await batchRequests(context);
    await pg.sql.unsafe(`CREATE FUNCTION reject_batch_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.user_id=1 THEN RAISE EXCEPTION 'controlled publication failure'; END IF; RETURN NEW; END $$`);
    await pg.sql.unsafe(
      "CREATE TRIGGER reject_batch_publication BEFORE INSERT ON user_document FOR EACH ROW EXECUTE FUNCTION reject_batch_publication()",
    );
    let failure: unknown;
    try {
      await context.processor.processBatch(requests);
    } catch (error) {
      failure = error;
    } finally {
      await pg.sql.unsafe("DROP TRIGGER reject_batch_publication ON user_document");
      await pg.sql.unsafe("DROP FUNCTION reject_batch_publication()");
    }
    const documents = await pg.sql`SELECT user_id FROM user_document ORDER BY user_id`;
    const work =
      await pg.sql`SELECT user_id,status,post_publication_status FROM user_document_rebuild_state ORDER BY user_id`;
    expect(failure).toBeInstanceOf(AggregateError);
    expect([...documents]).toEqual([{ user_id: 2 }]);
    expect([...work]).toEqual([
      { user_id: 1, status: "failed", post_publication_status: null },
      { user_id: 2, status: "processed", post_publication_status: "processed" },
    ]);
    const retry = await context.processor.processBatch(requests);
    expect(retry).toMatchObject({ rebuilt: 1, skipped: 1 });
  });
});

function accessRuntime(scope: RedisTestScope, publish?: NonNullable<Parameters<typeof runtime>[1]>["publish"]) {
  const authority = createSubjectAccessAuthorityRepository({
    db: pg.db,
    subjectFactsPublisher: scope.firstFactsPublisher,
  });
  const access = createSubjectAccessRepair({
    barrier: scope.subjectAccessBarrier,
    backlog: scope.subjectAccessStore,
    authority,
    logger,
    retryDelayMs: 1,
  });
  return { context: runtime(scope, { publish, repair: access }), authority, access };
}

async function commitDeletion(context: ReturnType<typeof runtime>, scope: RedisTestScope) {
  const deleting = await scope.subjectAccessBarrier.beginBlocking(subject);
  await context.uow.transaction(async (tx) => {
    await tx.db.update(users).set({ isDelete: true }).where(eq(users.id, 1));
    await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
  });
  // Represent the recoverable gap after source commit and before lifecycle finalization.
  await scope.subjectAccessBarrier.prepareRepair(deleting, "disabled");
}

async function settleBarrier(
  scope: RedisTestScope,
  access: ReturnType<typeof createSubjectAccessRepair>,
  state: "enabled" | "disabled",
) {
  const deadline = performance.now() + 2_000;
  let observed = await scope.subjectAccessBarrier.read(subject);
  while (observed.state !== state && performance.now() < deadline) {
    await access.repairPending({ limit: 1 });
    observed = await scope.subjectAccessBarrier.read(subject);
  }
  expect(observed.state).toBe(state);
}

test("a delayed read-through cannot replace the deletion tombstone or hide its distinct reader result", async () => {
  const scope = await redis.createScope();
  const { context, access } = accessRuntime(scope);
  await scope.subjectAccessBootstrap.seedMany([{ subjectIdentifier: subject, state: "enabled" }], new Date());
  const reader = createDocumentFactsReader({ db: pg.db, cache: scope.firstCache });
  const missing = await reader.read(subject);
  expect(missing).toEqual({ kind: "missing" });
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  const full = await reader.read(subject);
  expect(full.kind).toBe("document");

  // Drop only the pre-deletion cache to start a real PostgreSQL read-through.
  await scope.clearPublishedUserDocumentRecord(subject);
  const loaded = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const delayedReader = createDocumentFactsReader({
    db: pg.db,
    cache: {
      read: scope.firstCache.read,
      async publish(record) {
        loaded.resolve();
        await release.promise;
        return await scope.firstCache.publish(record);
      },
    },
  });
  const delayed = delayedReader.read(subject);
  try {
    await Promise.race([
      loaded.promise,
      delayed.then(() => {
        throw new Error("Expected a pending PostgreSQL read-through publication");
      }),
    ]);
    await commitDeletion(context, scope);
    await context.drain();
  } finally {
    release.resolve();
    await delayed;
  }
  await settleBarrier(scope, access, "disabled");
  const tombstone = await reader.read(subject);
  const projectedFacts = await createSubjectFactsReader({ db: pg.db, cache: scope.firstCache }).read(subject);
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  const [published] = await pg.db.select().from(userDocuments);
  expect(tombstone).toMatchObject({ kind: "tombstone", record: { kind: "tombstone", sourceVersion: "2" } });
  expect(projectedFacts).toBeNull();
  expect(cached).toMatchObject({ kind: "tombstone", sourceVersion: "2" });
  expect(cached).not.toHaveProperty("facts");
  expect(published).toMatchObject({ userId: 1, subjectIdentifier: subject, sourceVersion: "2", document: null });
});

test("a deleted user's committed tombstone retains failed cache work and still repairs its disabled barrier", async () => {
  const scope = await redis.createScope();
  let failDeletionCache = false;
  const { context, authority, access } = accessRuntime(scope, async (record) => {
    if (failDeletionCache && record.kind === "tombstone") throw new Error("RedisUnavailable");
    return await scope.firstFactsPublisher.publish(record);
  });
  await scope.subjectAccessBootstrap.seedMany([{ subjectIdentifier: subject, state: "enabled" }], new Date());
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  const oldFacts = await scope.readPublishedUserDocumentRecord(subject);
  if (oldFacts?.kind !== "document") throw new Error("Expected complete initial Facts");
  await commitDeletion(context, scope);
  failDeletionCache = true;
  await context.drain();
  const [committed] = await pg.db.select().from(userDocuments);
  const [pending] = await pg.db.select().from(userDocumentRebuildStates);
  const authoritative = await authority.resolve(subject);
  const blocked = await scope.subjectAccessBarrier.read(subject);
  const failedCache = await scope.readPublishedUserDocumentRecord(subject);
  expect(committed).toMatchObject({ document: null, sourceVersion: "2" });
  expect(pending).toMatchObject({ status: "processed", postPublicationVersion: "2", postPublicationStatus: "failed" });
  expect(authoritative).toEqual({ accountState: "disabled", factsState: "not_current" });
  expect(blocked.state).toBe("blocking");
  expect(failedCache).toEqual(oldFacts);

  failDeletionCache = false;
  await scope.clearPublishedUserDocumentRecord(subject);
  const readThrough = await createDocumentFactsReader({ db: pg.db, cache: scope.firstCache }).read(subject);
  const [unacknowledged] = await pg.db.select().from(userDocumentRebuildStates);
  const notRestoredByCache = await scope.subjectAccessBarrier.read(subject);
  expect(readThrough).toMatchObject({ kind: "tombstone", record: { sourceVersion: "2" } });
  expect(unacknowledged?.postPublicationStatus).toBe("failed");
  expect(notRestoredByCache.state).toBe("blocking");
  const repaired = await context.processor.repairFailedOrStale({ staleBefore: observedAt, limit: 10 });
  await settleBarrier(scope, access, "disabled");
  const delayed = await scope.secondFactsPublisher.publish(oldFacts);
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  const [finished] = await pg.db.select().from(userDocumentRebuildStates);
  expect(repaired).toMatchObject({ failed: 0, postPublication: { completed: 1 } });
  expect(delayed.status).toBe("retained-newer");
  expect(cached).toMatchObject({ kind: "tombstone", sourceVersion: "2" });
  expect(cached).not.toHaveProperty("facts");
  expect(finished?.postPublicationStatus).toBe("processed");
});

test.each([UserStatus.Pause, UserStatus.Disable])(
  "a non-deleted %s account retains full directory/Facts while access stays disabled",
  async (status) => {
    const scope = await redis.createScope();
    const { context, access, authority } = accessRuntime(scope);
    await scope.subjectAccessBootstrap.seedMany([{ subjectIdentifier: subject, state: "enabled" }], new Date());
    const blocking = await scope.subjectAccessBarrier.beginBlocking(subject);
    await context.uow.transaction(async (tx) => {
      await tx.db.update(users).set({ status }).where(eq(users.id, 1));
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
    });
    await scope.subjectAccessBarrier.prepareRepair(blocking, "disabled");
    await context.drain();
    await settleBarrier(scope, access, "disabled");
    const detail = await createInternalUserDocumentQueryService({
      documentRepository: createInternalUserDocumentQueryRepository(pg.db),
    }).getDetailByUsername("first", "internal");
    const facts = await createDocumentFactsReader({ db: pg.db, cache: scope.firstCache }).read(subject);
    const resolved = await authority.resolve(subject);
    expect(detail.status).toBe(status);
    expect(facts).toMatchObject({ kind: "document", facts: { profile: { username: "first" }, employments: [] } });
    expect(resolved).toEqual({ accountState: "disabled", factsState: "not_current" });
  },
);

test("an equal-version cache tombstone cannot acknowledge full PG Facts or unblock an enabled account", async () => {
  const scope = await redis.createScope();
  const { context, authority, access } = accessRuntime(scope);
  await scope.subjectAccessBootstrap.seedMany([{ subjectIdentifier: subject, state: "enabled" }], new Date());
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  if (cached?.kind !== "document") throw new Error("Expected complete initial Facts");
  await scope.secondFactsPublisher.publish({
    userId: cached.userId,
    subjectIdentifier: cached.subjectIdentifier,
    schemaVersion: cached.schemaVersion,
    sourceVersion: cached.sourceVersion,
    publishedAt: cached.publishedAt,
    kind: "tombstone",
  });
  const enabling = await scope.subjectAccessBarrier.beginBlocking(subject);
  await scope.subjectAccessBarrier.prepareRepair(enabling, "enabled");
  await pg.db.update(userDocumentRebuildStates).set({ postPublicationStatus: "pending" });
  const repair = await context.processor.repairFailedOrStale({ staleBefore: observedAt, limit: 10 });
  const resolved = await authority.resolve(subject);
  const attempted = await access.repairSubject(subject);
  const blocked = await scope.subjectAccessBarrier.read(subject);
  const [pending] = await pg.db.select().from(userDocumentRebuildStates);
  expect(repair).toMatchObject({ failed: 1, postPublication: { completed: 0, failed: 1 } });
  expect(resolved).toEqual({ accountState: "enabled", factsState: "not_current" });
  expect(attempted.status).toBe("deferred");
  expect(blocked.state).toBe("blocking");
  expect(pending?.postPublicationStatus).toBe("failed");

  await context.processor.backfillAllUsers();
  await context.drain();
  await settleBarrier(scope, access, "enabled");
  const current = await scope.readPublishedUserDocumentRecord(subject);
  expect(current).toMatchObject({ kind: "document", sourceVersion: "2" });
});

test.each(["cache", "access"])(
  "processed PostgreSQL work retains and repairs its failed %s publication",
  async (stage) => {
    const scope = await redis.createScope();
    let fail = false;
    const context = runtime(scope, {
      async publish(record) {
        if (fail && stage === "cache") {
          fail = false;
          throw new Error("RedisUnavailable");
        }
        return await scope.firstFactsPublisher.publish(record);
      },
      repair: {
        async repairSubject() {
          if (fail && stage === "access") {
            fail = false;
            return { status: "failed" };
          }
          return { status: "stable" };
        },
      },
    });
    await context.record([{ kind: "user", userId: 1 }]);
    await context.drain();
    const oldCache = await scope.readPublishedUserDocumentRecord(subject);
    await context.uow.transaction(async (tx) => {
      await tx.db.update(users).set({ name: "Current" }).where(eq(users.id, 1));
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
    });
    fail = true;
    await context.drain();
    const [committed] = await pg.db.select().from(userDocumentRebuildStates);
    const cachedBeforeRepair = await scope.readPublishedUserDocumentRecord(subject);
    expect(committed).toMatchObject({
      version: "2",
      status: "processed",
      postPublicationVersion: "2",
      postPublicationStatus: "failed",
    });
    expect(cachedBeforeRepair?.sourceVersion).toBe(stage === "cache" ? "1" : "2");
    const repair = await context.processor.repairFailedOrStale({ staleBefore: observedAt, limit: 10 });
    const cached = await scope.readPublishedUserDocumentRecord(subject);
    const [finished] = await pg.db.select().from(userDocumentRebuildStates);
    expect(repair).toMatchObject({ postPublication: { selected: 1, completed: 1, failed: 0 } });
    expect(cached).toMatchObject({ sourceVersion: "2", facts: { profile: { name: "Current" } } });
    expect(finished).toMatchObject({ version: "2", postPublicationStatus: "processed" });
    const late = await scope.firstFactsPublisher.publish(oldCache!);
    const retained = await scope.readPublishedUserDocumentRecord(subject);
    expect(late.status).toBe("retained-newer");
    expect(retained?.sourceVersion).toBe("2");
  },
);

test("publication of a new version resets its exhausted post-publication budget", async () => {
  const scope = await redis.createScope();
  const context = runtime(scope);
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  await pg.db.update(userDocumentRebuildStates).set({ postPublicationStatus: "failed", postPublicationAttempts: 5 });
  const exhausted = await context.processor.repairFailedOrStale({ staleBefore: observedAt, limit: 1 });
  expect(exhausted).toMatchObject({ exhausted: 1, postPublication: { selected: 0, exhausted: 1 } });
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  const [state] = await pg.db.select().from(userDocumentRebuildStates);
  expect(state).toMatchObject({
    version: "2",
    postPublicationVersion: "2",
    postPublicationStatus: "processed",
    postPublicationAttempts: 1,
  });
  const record = await scope.readPublishedUserDocumentRecord(subject);
  expect(record?.sourceVersion).toBe("2");
});

test("a late failed post-publication owner cannot erase a recovered completion of the same version", async () => {
  const scope = await redis.createScope();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0;
  const context = runtime(scope, {
    async publish(record) {
      if (++calls === 1) {
        entered.resolve();
        await release.promise;
        throw new Error("LateOwnerFailure");
      }
      return await scope.firstFactsPublisher.publish(record);
    },
  });
  await context.record([{ kind: "user", userId: 1 }]);
  const original = context.drain();
  try {
    await entered.promise;
    const report = await context.processor.repairFailedOrStale({
      staleBefore: new Date(observedAt.getTime() + 1),
      limit: 10,
    });
    expect(report).toMatchObject({ failed: 0, postPublication: { completed: 1, failed: 0 } });
  } finally {
    release.resolve();
    await original;
  }
  const [state] = await pg.db.select().from(userDocumentRebuildStates);
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  expect(state).toMatchObject({
    status: "processed",
    postPublicationStatus: "processed",
    postPublicationToken: null,
    postPublicationAttempts: 2,
    postPublicationError: null,
  });
  expect(cached?.sourceVersion).toBe(state?.version);
});

test("a retained newer Redis publication cannot acknowledge an older PG obligation or restore access", async () => {
  const scope = await redis.createScope();
  const context = runtime(scope);
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  const record = await scope.readPublishedUserDocumentRecord(subject);
  if (!record) throw new Error("Missing initial publication");
  await scope.firstFactsPublisher.publish({ ...record, sourceVersion: "10" });
  await pg.db.update(userDocumentRebuildStates).set({ postPublicationStatus: "pending" });
  const report = await context.processor.repairFailedOrStale({ staleBefore: observedAt, limit: 10 });
  const authority = createSubjectAccessAuthorityRepository({
    db: pg.db,
    subjectFactsPublisher: scope.firstFactsPublisher,
  });
  const resolved = await authority.resolve(subject);
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  const [state] = await pg.db.select().from(userDocumentRebuildStates);
  expect(report).toMatchObject({ failed: 1, postPublication: { selected: 1, completed: 0, failed: 1 } });
  expect(resolved).toEqual({ accountState: "enabled", factsState: "not_current" });
  expect(cached?.sourceVersion).toBe("10");
  expect(state).toMatchObject({ status: "processed", postPublicationVersion: "1", postPublicationStatus: "failed" });
});

test("an Enable source commit cannot restore access before its direct Outbox is expanded and published", async () => {
  const scope = await redis.createScope();
  const authority = createSubjectAccessAuthorityRepository({
    db: pg.db,
    subjectFactsPublisher: scope.firstFactsPublisher,
  });
  const access = createSubjectAccessRepair({
    barrier: scope.subjectAccessBarrier,
    backlog: scope.subjectAccessStore,
    authority,
    logger,
    retryDelayMs: 1,
  });
  const context = runtime(scope, { repair: access });
  await scope.subjectAccessBootstrap.seedMany([{ subjectIdentifier: subject, state: "enabled" }], new Date());
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  await pg.db
    .insert(userDocumentOutboxEntries)
    .values({ id: randomUUID(), source: { change: { kind: "user", userId: 999 } } });
  const unrelated = await authority.resolve(subject);
  expect(unrelated).toEqual({ accountState: "enabled", factsState: "current" });
  const disable = await scope.subjectAccessBarrier.beginBlocking(subject);
  await pg.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.id, 1));
  await scope.subjectAccessBarrier.prepareRepair(disable, "disabled");
  await scope.subjectAccessBarrier.finalize(disable, "disabled");
  const enabling = await scope.subjectAccessBarrier.beginBlocking(subject);
  await context.uow.transaction(async (tx) => {
    await tx.db.update(users).set({ status: UserStatus.Enable }).where(eq(users.id, 1));
    await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
  });
  await scope.subjectAccessBarrier.prepareRepair(enabling, "enabled");
  const before = await authority.resolve(subject);
  const attempted = await access.repairSubject(subject);
  const barrierBefore = await scope.subjectAccessBarrier.read(subject);
  expect(before).toEqual({ accountState: "enabled", factsState: "not_current" });
  expect(attempted.status).toBe("deferred");
  expect(barrierBefore.state).toBe("blocking");
  await context.drain();
  // The repair backlog uses Redis server time; wait for eligibility through its public bounded drain.
  let barrierAfter = await scope.subjectAccessBarrier.read(subject);
  const deadline = Date.now() + 2_000;
  while (barrierAfter.state === "blocking" && Date.now() < deadline) {
    await access.repairPending({ limit: 1 });
    barrierAfter = await scope.subjectAccessBarrier.read(subject);
  }
  expect(barrierAfter.state).toBe("enabled");
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  expect(cached?.sourceVersion).toBe("2");
});

test("lost Outbox wakeups retain direct ended-user obligations and replay does not advance their version", async () => {
  const scope = await redis.createScope();
  const context = runtime(scope);
  context.setWakeFailure(true);
  await context.record([
    { kind: "employment", userId: 1 },
    { kind: "organization-responsibility-assignment", userId: 1 },
  ]);
  const pending = await pg.db.select().from(userDocumentOutboxEntries);
  expect(pending.map(({ status }) => status)).toEqual(["pending", "pending"]);
  context.setWakeFailure(false);
  await context.processor.repairFailedOrStale({ staleBefore: observedAt, limit: 10 });
  await context.drain();
  const [first] = await pg.db.select().from(userDocumentRebuildStates);
  for (const entry of pending) await context.processor.processOutbox({ outboxId: entry.id });
  await context.drain();
  const [replayed] = await pg.db.select().from(userDocumentRebuildStates);
  expect(first).toMatchObject({ userId: 1, version: "2", status: "processed" });
  expect(replayed?.version).toBe(first?.version);
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  expect(cached?.sourceVersion).toBe("2");
});

const sources: Array<{ label: string; change: UserDocumentSourceChange; userIds: number[] }> = [
  { label: "user", change: { kind: "user", userId: 1 }, userIds: [1] },
  { label: "employment", change: { kind: "employment", userId: 1 }, userIds: [1] },
  {
    label: "responsibility holder",
    change: { kind: "organization-responsibility-assignment", userId: 2 },
    userIds: [2],
  },
  {
    label: "responsibility catalog",
    change: { kind: "organization-responsibility-type", typeCodes: [OrganizationResponsibilityTypeCode.Head] },
    userIds: [2],
  },
  {
    label: "organization and cross-tree holder",
    change: { kind: "organization", organizationId: 10 },
    userIds: [1, 2],
  },
  { label: "position", change: { kind: "position", positionId: 10 }, userIds: [1, 2] },
  { label: "role's three target kinds", change: { kind: "role", roleId: 10 }, userIds: [1, 2] },
  {
    label: "removed employment assignment target",
    change: { kind: "role-assignment", targetType: RoleAssignmentTargetType.Employment, targetId: 100 },
    userIds: [1],
  },
  {
    label: "removed position assignment target",
    change: { kind: "role-assignment", targetType: RoleAssignmentTargetType.Position, targetId: 10 },
    userIds: [1, 2],
  },
  {
    label: "removed organization assignment target",
    change: { kind: "role-assignment", targetType: RoleAssignmentTargetType.Organization, targetId: 10 },
    userIds: [1],
  },
];

test.each(sources)("$label changes expand after commit and publish all required users", async ({ change, userIds }) => {
  await seedAssociations();
  if (change.kind === "role-assignment") await pg.db.delete(roleAssignments);
  const scope = await redis.createScope();
  const context = runtime(scope);
  await context.record([change]);
  const before = await pg.db.select().from(userDocumentRebuildStates);
  expect(before).toEqual([]);
  await context.drain();
  const work = await pg.db.select().from(userDocumentRebuildStates).orderBy(userDocumentRebuildStates.userId);
  expect(work.map(({ userId }) => userId)).toEqual(userIds);
  expect(
    work.every(({ status, postPublicationStatus }) => status === "processed" && postPublicationStatus === "processed"),
  ).toBe(true);
  for (const userId of userIds) {
    const cached = await scope.readPublishedUserDocumentRecord(
      userId === 1 ? subject : "10000000-0000-4000-8000-000000000002",
    );
    expect(cached?.sourceVersion).toBe("1");
  }
});

test("committed source metadata survives expansion and reaches its rebuild wake-up", async () => {
  const scope = await redis.createScope();
  const context = runtime(scope);
  const metadata = { requestId: "user-document-request", traceId: "user-document-trace" };
  await context.uow.transaction(
    async (tx) => {
      await tx.invalidation.recordChanges([{ kind: "employment", userId: 1 }]);
    },
    { observability: metadata },
  );
  const job = context.jobs.shift();
  if (job?.kind !== "outbox") throw new Error("Missing source wake-up");
  await context.processor.processOutbox(job.payload);
  expect(context.jobs).toMatchObject([{ kind: "rebuild", payload: { userId: 1, ...metadata } }]);
  const [entry] = await pg.db.select().from(userDocumentOutboxEntries);
  expect(entry).toMatchObject({
    source: { change: { kind: "employment", userId: 1 }, ...metadata },
    status: "processed",
  });
});

test("a source with no associated users completes an empty receipt without inventing rebuild work", async () => {
  const scope = await redis.createScope();
  const context = runtime(scope);
  await context.record([{ kind: "role", roleId: 999 }]);
  await context.drain();
  const [entry] = await pg.db.select().from(userDocumentOutboxEntries);
  const states = await pg.db.select().from(userDocumentRebuildStates);
  expect(entry).toMatchObject({ status: "processed", rebuildRequests: [] });
  expect(states).toEqual([]);
});

test("source rollback leaves neither Outbox nor rebuild obligations", async () => {
  const scope = await redis.createScope();
  const context = runtime(scope);
  let failure: unknown;
  try {
    await context.uow.transaction(async (tx) => {
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
      throw new Error("SourceRejected");
    });
  } catch (error) {
    failure = error;
  }
  const entries = await pg.db.select().from(userDocumentOutboxEntries);
  const rebuilds = await pg.db.select().from(userDocumentRebuildStates);
  expect(failure).toBeInstanceOf(Error);
  expect(entries).toEqual([]);
  expect(rebuilds).toEqual([]);
  expect(context.jobs).toEqual([]);
});

async function seedAssociations() {
  await pg.db
    .insert(users)
    .values({ id: 2, subjectIdentifier: "10000000-0000-4000-8000-000000000002", username: "second", name: "Second" });
  await pg.db.insert(positions).values({ id: 10, posCode: "POSITION", posName: "Position" });
  await pg.db.insert(organizations).values([
    {
      id: 10,
      orgCode: "ROOT",
      orgName: "Root",
      path: "/10",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    },
    {
      id: 11,
      parentId: 10,
      businessParentId: 10,
      orgCode: "CHILD",
      orgName: "Child",
      path: "/10/11",
      level: OrganizationLevel.Two,
      orgType: OrganizationType.Department,
    },
    {
      id: 20,
      orgCode: "OUTSIDE",
      orgName: "Outside",
      path: "/20",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    },
  ]);
  await pg.db.insert(organizationClosures).values([
    { ancestorId: 10, descendantId: 10, depth: 0 },
    { ancestorId: 11, descendantId: 11, depth: 0 },
    { ancestorId: 10, descendantId: 11, depth: 1 },
    { ancestorId: 20, descendantId: 20, depth: 0 },
  ]);
  await pg.db.insert(employments).values([
    { id: 100, userId: 1, orgId: 11, posId: 10, startTime: new Date("2026-01-01T00:00:00Z") },
    { id: 101, userId: 2, orgId: 20, posId: 10, startTime: new Date("2026-01-01T00:00:00Z") },
  ]);
  await pg.db.insert(organizationResponsibilityAssignments).values({
    employmentId: 101,
    targetOrganizationId: 11,
    typeCode: OrganizationResponsibilityTypeCode.Head,
    status: OrganizationResponsibilityAssignmentStatus.Enable,
    startTime: new Date("2026-01-01T00:00:00Z"),
  });
  await pg.db
    .insert(clients)
    .values({ id: 10, clientCode: "CLIENT", clientName: "Client", clientSecret: "fixture", extAttributes: {} });
  await pg.db.insert(roles).values({ id: 10, clientId: 10, roleCode: "ROLE", roleName: "Role" });
  await pg.db.insert(roleAssignments).values([
    { roleId: 10, targetType: RoleAssignmentTargetType.Employment, targetId: 100 },
    { roleId: 10, targetType: RoleAssignmentTargetType.Position, targetId: 10 },
    { roleId: 10, targetType: RoleAssignmentTargetType.Organization, targetId: 10, includeDescendants: true },
  ]);
}

test("formal post-publication failure logs retain recovery identity without serializing cache commands", async () => {
  const scope = await redis.createScope(),
    logs: unknown[] = [];
  const canary = "SUBJECT_FACTS_MUST_NOT_REACH_LOGS";
  const context = runtime(scope, {
    logger: {
      warn(data, message) {
        logs.push({ data, message });
      },
    },
    publish: async (record) => {
      throw Object.assign(new Error(canary), {
        name: "ReplyError",
        command: { name: "eval", args: [JSON.stringify(record), canary] },
      });
    },
  });
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  const [state] = await pg.db.select().from(userDocumentRebuildStates);
  expect(state).toMatchObject({
    status: "processed",
    postPublicationStatus: "failed",
    postPublicationError: "ReplyError",
  });
  expect(logs).toContainEqual({
    data: { userId: 1, version: "1", errorType: "ReplyError" },
    message: "User Document post-publication remains pending",
  });
  const serialized = JSON.stringify(logs);
  expect(serialized).not.toContain(canary);
  expect(serialized).not.toContain("command");
  expect(serialized).not.toContain("args");
});

test("a prepared older User Document cannot publish over the next committed requirement", async () => {
  const scope = await redis.createScope(),
    context = runtime(scope);
  await context.record([{ kind: "user", userId: 1 }]);
  const first = context.jobs.shift();
  if (first?.kind !== "outbox") throw new Error("Missing first wake");
  await context.processor.processOutbox(first.payload);
  const stale = await context.processor.prepareRebuild({ targetId: 1, version: "1" });
  if (stale === null) throw new Error("Missing first candidate");
  await context.uow.transaction(async (tx) => {
    await tx.db.update(users).set({ name: "Newest source" }).where(eq(users.id, 1));
    await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
  });
  await context.drain();
  const rejected = await context.processor.publishPrepared(stale);
  const [stored] = await pg.db.select().from(userDocuments),
    [state] = await pg.db.select().from(userDocumentRebuildStates);
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  expect(rejected).toEqual({ status: "stale" });
  expect(stored).toMatchObject({ sourceVersion: "2", document: { name: "Newest source" } });
  expect(state).toMatchObject({
    version: "2",
    status: "processed",
    postPublicationVersion: "2",
    postPublicationStatus: "processed",
  });
  expect(cached).toMatchObject({ sourceVersion: "2", facts: { profile: { name: "Newest source" } } });
});

test("User Document row, processed state and pending external obligation roll back atomically before retry", async () => {
  const scope = await redis.createScope(),
    context = runtime(scope);
  await context.record([{ kind: "user", userId: 1 }]);
  await context.drain();
  await context.uow.transaction(async (tx) => {
    await tx.db.update(users).set({ name: "Retry source" }).where(eq(users.id, 1));
    await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
  });
  const wake = context.jobs.shift();
  if (wake?.kind !== "outbox") throw new Error("Missing next wake");
  await context.processor.processOutbox(wake.payload);
  const rebuild = context.jobs.shift();
  if (rebuild?.kind !== "rebuild") throw new Error("Missing next rebuild");
  const prepared = await context.processor.prepareRebuild({ targetId: 1, version: "2" });
  if (!prepared) throw new Error("Missing next candidate");
  await pg.sql.unsafe(
    `CREATE FUNCTION reject_pending_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version=2 AND NEW.post_publication_status='pending' THEN RAISE EXCEPTION 'ControlledPublicationFailure'; END IF; RETURN NEW; END $$`,
  );
  await pg.sql.unsafe(
    "CREATE TRIGGER reject_pending_publication BEFORE UPDATE ON user_document_rebuild_state FOR EACH ROW EXECUTE FUNCTION reject_pending_publication()",
  );
  let failure: unknown;
  try {
    await context.processor.publishPrepared(prepared);
  } catch (error) {
    failure = error;
  } finally {
    await pg.sql.unsafe("DROP TRIGGER reject_pending_publication ON user_document_rebuild_state");
    await pg.sql.unsafe("DROP FUNCTION reject_pending_publication()");
  }
  const [stored] = await pg.db.select().from(userDocuments),
    [state] = await pg.db.select().from(userDocumentRebuildStates);
  const cached = await scope.readPublishedUserDocumentRecord(subject);
  expect(failure).toBeInstanceOf(Error);
  expect(stored).toMatchObject({ sourceVersion: "1", document: { name: "First" } });
  expect(state).toMatchObject({
    version: "2",
    status: "failed",
    postPublicationVersion: "1",
    postPublicationStatus: "processed",
  });
  expect(cached?.sourceVersion).toBe("1");
  const result = await context.processor.process(rebuild.payload),
    [retried] = await pg.db.select().from(userDocuments),
    [completed] = await pg.db.select().from(userDocumentRebuildStates);
  expect(result.status).toBe("rebuilt");
  expect(retried).toMatchObject({ sourceVersion: "2", document: { name: "Retry source" } });
  expect(completed).toMatchObject({
    status: "processed",
    postPublicationVersion: "2",
    postPublicationStatus: "processed",
  });
});
