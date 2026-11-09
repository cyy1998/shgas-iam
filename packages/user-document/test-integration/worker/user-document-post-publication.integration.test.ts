import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { UserDocumentWorkStatus } from "@iam/contracts";
import { userDocumentRebuildStates, userDocuments, users } from "@iam/db/schema";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { asc, eq } from "drizzle-orm";
import postgres from "postgres";
import { publication } from "../../src/__tests__/document-fixture";
import type { DocumentFactsCacheRecord } from "../../src/document";
import { createUserDocumentPostPublicationProcessor } from "../../src/worker/user-document-post-publication.processor";
import { createCurrentUserDocumentProjectionBundle } from "../../src/worker/user-document-projection";
import { createPostgresTestHarness } from "../support/postgres-test-harness";
import { createRedisTestHarness, type RedisTestScope } from "../support/redis-test-harness";

const at = new Date("2026-11-02T10:00:00.000Z");
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
});
afterEach(async () => {
  await redis?.reset();
});
afterAll(async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    registerCleanup(() => pg?.close());
    registerCleanup(() => redis?.close());
  });
});

function processor(
  scope: RedisTestScope,
  options: {
    publish?: (record: DocumentFactsCacheRecord) => Promise<{ status: "published" | "retained-newer" }>;
    repair?: { repairSubject(subjectIdentifier: string): Promise<unknown> };
    logger?: { warn(data: Record<string, unknown>, message: string): void };
    concurrency?: number;
    batchSize?: number;
    projection?: ReturnType<typeof createCurrentUserDocumentProjectionBundle>;
    db?: typeof pg.db;
  } = {},
) {
  return createUserDocumentPostPublicationProcessor({
    db: options.db ?? pg.db,
    projection: options.projection ?? createCurrentUserDocumentProjectionBundle(),
    subjectFactsPublisher: { publish: options.publish ?? scope.firstFactsPublisher.publish },
    subjectAccessRepair: options.repair ?? {
      async repairSubject() {
        return { status: "stable" };
      },
    },
    logger: options.logger ?? { warn() {} },
    clock: { nowDate: () => at },
    batchSize: options.batchSize ?? 100,
    concurrency: options.concurrency,
  });
}

async function seed(count: number, version = "1", db = pg.db) {
  const publications = Array.from({ length: count }, (_, index) => publication(index + 1, version));
  await db.insert(users).values(
    publications.map((row) => ({
      id: row.userId,
      subjectIdentifier: row.subjectIdentifier,
      username: row.document.username,
      name: row.document.name,
    })),
  );
  await db.insert(userDocuments).values(publications);
  await db.insert(userDocumentRebuildStates).values(
    publications.map((row) => ({
      userId: row.userId,
      version: row.sourceVersion,
      status: UserDocumentWorkStatus.Processed,
      processedAt: at,
      postPublicationVersion: row.sourceVersion,
      postPublicationStatus: "pending" as const,
    })),
  );
  return publications.map((row) => ({ userId: row.userId, version: row.sourceVersion }));
}

test("batch post-publication keeps healthy work completed and repairs only a failed member", async () => {
  const scope = await redis.createScope();
  const requests = await seed(2);
  let failSecond = true;
  const warnings: Record<string, unknown>[] = [];
  const context = processor(scope, {
    async publish(record) {
      if (record.userId === 2 && failSecond) {
        failSecond = false;
        throw new Error("sensitive-command-payload");
      }
      return await scope.firstFactsPublisher.publish(record);
    },
    logger: {
      warn(data) {
        warnings.push(data);
      },
    },
  });

  const result = await context.processMany(requests);
  const states = await pg.db.select().from(userDocumentRebuildStates).orderBy(asc(userDocumentRebuildStates.userId));
  const healthy = await scope.readPublishedUserDocumentRecord(publication(1).subjectIdentifier);
  const failed = await scope.readPublishedUserDocumentRecord(publication(2).subjectIdentifier);
  expect(result).toEqual({ selected: 2, completed: 1, skipped: 0, failed: 1, exhausted: 0 });
  expect(states).toMatchObject([
    { status: "processed", postPublicationStatus: "processed" },
    { status: "processed", postPublicationStatus: "failed", postPublicationError: "Error" },
  ]);
  expect(healthy).toMatchObject({ sourceVersion: "1", kind: "document" });
  expect(failed).toBeNull();
  expect(warnings).toEqual([{ userId: 2, version: "1", errorType: "Error" }]);

  const repaired = await context.repairFailedOrStale({ staleBefore: at, limit: 10 });
  const recovered = await scope.readPublishedUserDocumentRecord(publication(2).subjectIdentifier);
  const duplicate = await context.processMany(requests);
  expect(repaired).toEqual({ selected: 1, completed: 1, skipped: 0, failed: 0, exhausted: 0 });
  expect(recovered).toMatchObject({ sourceVersion: "1", kind: "document" });
  expect(duplicate).toEqual({ selected: 2, completed: 0, skipped: 2, failed: 0, exhausted: 0 });
});

test("exhausted low IDs release repair capacity and duplicate consumption cannot restart them", async () => {
  const scope = await redis.createScope();
  await seed(3);
  const calls: number[] = [];
  let failing = true;
  const context = processor(scope, {
    batchSize: 1,
    async publish(record) {
      calls.push(record.userId);
      if (record.userId < 3 && failing) throw new Error("RedisUnavailable");
      return await scope.firstFactsPublisher.publish(record);
    },
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const report = await context.repairFailedOrStale({ staleBefore: at, limit: 2 });
    expect(report).toEqual({ selected: 2, completed: 0, skipped: 0, failed: 2, exhausted: attempt === 5 ? 2 : 0 });
  }
  const repaired = await context.repairFailedOrStale({ staleBefore: at, limit: 2 });
  expect(repaired).toEqual({ selected: 1, completed: 1, skipped: 0, failed: 0, exhausted: 2 });
  const duplicate = await context.process(1, "1");
  expect(duplicate).toEqual({ status: "exhausted" });
  expect(calls.filter((id) => id === 1)).toHaveLength(5);
  const unchanged = await context.repairFailedOrStale({ staleBefore: at, limit: 1 });
  expect(unchanged).toEqual({ selected: 0, completed: 0, skipped: 0, failed: 0, exhausted: 2 });
  const states = await pg.db.select().from(userDocumentRebuildStates).orderBy(asc(userDocumentRebuildStates.userId));
  expect(states).toMatchObject([
    { status: "processed", postPublicationStatus: "failed", postPublicationAttempts: 5 },
    { status: "processed", postPublicationStatus: "failed", postPublicationAttempts: 5 },
    { status: "processed", postPublicationStatus: "processed", postPublicationAttempts: 1 },
  ]);
  let mismatched: unknown;
  try {
    await context.retryExhausted({ userId: 1, version: "2", staleBefore: at });
  } catch (error) {
    mismatched = error;
  }
  expect(mismatched).toBeInstanceOf(Error);
  failing = false;
  const explicit = await context.retryExhausted({ userId: 1, version: "1", staleBefore: at });
  expect(explicit).toEqual({ selected: 1, completed: 1, skipped: 0, failed: 0, exhausted: 0 });
  const [retried] = await pg.db.select().from(userDocumentRebuildStates).where(eq(userDocumentRebuildStates.userId, 1));
  expect(retried).toMatchObject({ postPublicationStatus: "processed", postPublicationAttempts: 1 });
});

test("forced repair resets only selected exhausted budgets and keeps other work untouched", async () => {
  const scope = await redis.createScope();
  await seed(6);
  await pg.db.update(userDocumentRebuildStates).set({ postPublicationStatus: "failed", postPublicationAttempts: 5 });
  await pg.db
    .update(userDocumentRebuildStates)
    .set({ postPublicationAttempts: 8 })
    .where(eq(userDocumentRebuildStates.userId, 3));
  const token = "10000000-0000-4000-8000-000000000004";
  await pg.db
    .update(userDocumentRebuildStates)
    .set({ postPublicationStatus: "processing", postPublicationToken: token, postPublicationStartedAt: at })
    .where(eq(userDocumentRebuildStates.userId, 4));
  await pg.db
    .update(userDocumentRebuildStates)
    .set({ postPublicationStatus: "processed", postPublicationCompletedAt: at })
    .where(eq(userDocumentRebuildStates.userId, 5));
  await pg.db
    .update(userDocumentRebuildStates)
    .set({ postPublicationStatus: "pending", postPublicationAttempts: 2 })
    .where(eq(userDocumentRebuildStates.userId, 6));
  const context = processor(scope, { batchSize: 1 });
  const first = await context.repairFailedOrStale({ staleBefore: at, limit: 2, force: true });
  expect(first).toEqual({ selected: 2, completed: 2, skipped: 0, failed: 0, exhausted: 1 });
  const states = await pg.db.select().from(userDocumentRebuildStates).orderBy(asc(userDocumentRebuildStates.userId));
  expect(states).toMatchObject([
    { postPublicationStatus: "processed", postPublicationAttempts: 1 },
    { postPublicationStatus: "processed", postPublicationAttempts: 1 },
    { postPublicationStatus: "failed", postPublicationAttempts: 8 },
    { postPublicationStatus: "processing", postPublicationAttempts: 5, postPublicationToken: token },
    { postPublicationStatus: "processed", postPublicationAttempts: 5 },
    { postPublicationStatus: "pending", postPublicationAttempts: 2 },
  ]);
  const second = await context.repairFailedOrStale({ staleBefore: at, limit: 10, force: true });
  expect(second).toEqual({ selected: 2, completed: 2, skipped: 0, failed: 0, exhausted: 0 });
  const unexhausted = await pg.db
    .select()
    .from(userDocumentRebuildStates)
    .where(eq(userDocumentRebuildStates.userId, 6));
  expect(unexhausted).toMatchObject([{ postPublicationAttempts: 3 }]);
});

test("forced failures keep their renewed budget and are attempted only once per repair call", async () => {
  const scope = await redis.createScope();
  await seed(2);
  await pg.db.update(userDocumentRebuildStates).set({ postPublicationStatus: "failed", postPublicationAttempts: 5 });
  const context = processor(scope, {
    batchSize: 1,
    async publish() {
      throw new Error("RedisUnavailable");
    },
  });
  const report = await context.repairFailedOrStale({ staleBefore: at, limit: 10, force: true });
  expect(report).toEqual({ selected: 2, completed: 0, skipped: 0, failed: 2, exhausted: 0 });
  const states = await pg.db.select().from(userDocumentRebuildStates);
  expect(states.every((row) => row.postPublicationStatus === "failed" && row.postPublicationAttempts === 1)).toBe(true);
});

test.each(["targeted", "force"])(
  "the active fifth attempt is protected and %s stale takeover fences its late owner",
  async (mode) => {
    const scope = await redis.createScope();
    await seed(1);
    await pg.db.update(userDocumentRebuildStates).set({ postPublicationAttempts: 4 });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    const context = processor(scope, {
      async publish(record) {
        if (++calls === 1) {
          entered.resolve();
          await release.promise;
          throw new Error("LateOwnerFailure");
        }
        return await scope.firstFactsPublisher.publish(record);
      },
    });
    const original = context.process(1, "1");
    try {
      await entered.promise;
      const active = await context.repairFailedOrStale({ staleBefore: at, limit: 1 });
      expect(active).toEqual({ selected: 0, completed: 0, skipped: 0, failed: 0, exhausted: 0 });
      const forcedActive = await context.repairFailedOrStale({ staleBefore: at, limit: 1, force: true });
      expect(forcedActive).toEqual({ selected: 0, completed: 0, skipped: 0, failed: 0, exhausted: 0 });
      let activeRetry: unknown;
      try {
        await context.retryExhausted({ userId: 1, version: "1", staleBefore: at });
      } catch (error) {
        activeRetry = error;
      }
      expect(activeRetry).toBeInstanceOf(Error);
      await pg.db.update(userDocumentRebuildStates).set({ postPublicationStartedAt: new Date(at.getTime() - 1) });
      const stale = await context.repairFailedOrStale({ staleBefore: at, limit: 1 });
      expect(stale).toEqual({ selected: 0, completed: 0, skipped: 0, failed: 0, exhausted: 1 });
      const takeover =
        mode === "force"
          ? await context.repairFailedOrStale({ staleBefore: at, limit: 1, force: true })
          : await context.retryExhausted({ userId: 1, version: "1", staleBefore: at });
      expect(takeover).toEqual({ selected: 1, completed: 1, skipped: 0, failed: 0, exhausted: 0 });
    } finally {
      release.resolve();
      await original;
    }
    const [state] = await pg.db.select().from(userDocumentRebuildStates);
    expect(state).toMatchObject({
      postPublicationStatus: "processed",
      postPublicationAttempts: 1,
      postPublicationToken: null,
      postPublicationError: null,
    });
    expect(calls).toBe(2);
  },
);

test("concurrent calls share the same bounded external-effect slots", async () => {
  const scope = await redis.createScope();
  const requests = await seed(4);
  const parsed = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const projection = createCurrentUserDocumentProjectionBundle();
  let parsedCount = 0;
  let active = 0;
  let peak = 0;
  const context = processor(scope, {
    concurrency: 2,
    projection: {
      ...projection,
      parseDocumentRow(row) {
        const document = projection.parseDocumentRow(row);
        if (++parsedCount === 4) parsed.resolve();
        return document;
      },
    },
    async publish(record) {
      active += 1;
      peak = Math.max(peak, active);
      try {
        await release.promise;
        return await scope.firstFactsPublisher.publish(record);
      } finally {
        active -= 1;
      }
    },
  });
  const first = context.processMany(requests.slice(0, 2));
  const second = context.processMany(requests.slice(2));
  try {
    await parsed.promise;
    expect(peak).toBe(2);
  } finally {
    release.resolve();
    await Promise.all([first, second]);
  }
});

test("a slow Facts publisher neither delays healthy completion nor starts its Access repair early", async () => {
  const scope = await redis.createScope();
  const requests = await seed(4);
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const accessCalls: string[] = [];
  const context = processor(scope, {
    concurrency: 2,
    async publish(record) {
      if (record.userId === 1) {
        started.resolve();
        await release.promise;
      }
      return await scope.firstFactsPublisher.publish(record);
    },
    repair: {
      async repairSubject(subjectIdentifier) {
        accessCalls.push(subjectIdentifier);
        return { status: "deferred" };
      },
    },
  });
  let finished = false;
  const work = context.processMany(requests).then((report) => {
    finished = true;
    return report;
  });
  try {
    await started.promise;
    await waitForPostStatus([2, 3, 4], "processed");
    expect(finished).toBe(false);
    expect(accessCalls.toSorted()).toEqual([2, 3, 4].map((id) => publication(id).subjectIdentifier).toSorted());
  } finally {
    release.resolve();
    const report = await work;
    expect(report).toEqual({ selected: 4, completed: 4, skipped: 0, failed: 0, exhausted: 0 });
  }
});

test("successful external effects remain repairable after a batch completion transaction fails", async () => {
  const scope = await redis.createScope();
  const requests = await seed(3);
  const published = Promise.withResolvers<void>();
  let publications = 0;
  const context = processor(scope, {
    async publish(record) {
      const result = await scope.firstFactsPublisher.publish(record);
      if (++publications === 3) published.resolve();
      await published.promise;
      return result;
    },
  });
  await pg.sql.unsafe(`CREATE FUNCTION fail_post_completion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.post_publication_status='processed' THEN RAISE EXCEPTION 'simulated-completion-failure'; END IF;
    RETURN NEW; END $$`);
  await pg.sql.unsafe(`CREATE TRIGGER fail_post_completion BEFORE UPDATE ON user_document_rebuild_state
    FOR EACH ROW EXECUTE FUNCTION fail_post_completion()`);
  let failure: unknown;
  try {
    try {
      await context.processMany(requests);
    } catch (error) {
      failure = error;
    }
  } finally {
    await pg.sql.unsafe("DROP TRIGGER fail_post_completion ON user_document_rebuild_state");
    await pg.sql.unsafe("DROP FUNCTION fail_post_completion()");
  }
  expect(failure).toBeInstanceOf(Error);
  const unfinished = await pg.db.select().from(userDocumentRebuildStates);
  expect(unfinished).toHaveLength(3);
  expect(unfinished.every((row) => row.status === "processed" && row.postPublicationStatus === "failed")).toBe(true);
  const cached = await scope.factsInspector.inspectMany([1, 2, 3].map((id) => publication(id).subjectIdentifier));
  expect(cached.every((row) => row.status === "valid")).toBe(true);
  const repaired = await context.repairFailedOrStale({ staleBefore: at, limit: 10 });
  expect(repaired).toEqual({ selected: 3, completed: 3, skipped: 0, failed: 0, exhausted: 0 });
});

test("cancelling repair removes a waiting shared slot without waiting for another call's slow subject", async () => {
  const scope = await redis.createScope();
  await seed(2);
  const firstStarted = Promise.withResolvers<void>();
  const secondParsed = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const projection = createCurrentUserDocumentProjectionBundle();
  const calls: number[] = [];
  const context = processor(scope, {
    concurrency: 1,
    projection: {
      ...projection,
      parseDocumentRow(row) {
        const parsed = projection.parseDocumentRow(row);
        if (parsed.userId === 2) secondParsed.resolve();
        return parsed;
      },
    },
    async publish(record) {
      calls.push(record.userId);
      if (record.userId === 1) {
        firstStarted.resolve();
        await release.promise;
      }
      return await scope.firstFactsPublisher.publish(record);
    },
  });
  const first = context.process(1, "1");
  const controller = new AbortController();
  const reason = new Error("RepairCancelled");
  let cancellation: unknown;
  try {
    await firstStarted.promise;
    const repair = context.repairFailedOrStale({ staleBefore: at, limit: 1, signal: controller.signal });
    await secondParsed.promise;
    controller.abort(reason);
    try {
      await repair;
    } catch (error) {
      cancellation = error;
    }
    expect(cancellation).toBe(reason);
    expect(calls).toEqual([1]);
    const [waiting] = await pg.db
      .select()
      .from(userDocumentRebuildStates)
      .where(eq(userDocumentRebuildStates.userId, 2));
    expect(waiting).toMatchObject({ status: "processed", postPublicationStatus: "failed", postPublicationToken: null });
  } finally {
    release.resolve();
    await first;
  }
  const recovered = await context.process(2, "1");
  expect(recovered).toEqual({ status: "processed" });
  expect(calls).toEqual([1, 2]);
});

test("metadata waits preserve stricter session budgets and LOCAL settings roll back", async () => {
  const scope = await redis.createScope();
  const single = await createPostgresTestHarness({ createSql: Object.assign(singleConnectionSql, postgres) });
  let unlock: (() => Promise<void>) | undefined;
  try {
    const requests = await seed(1, "1", single.db);
    const lock = await single.holdDirtyRowLock(1);
    unlock = lock.commit;
    await single.sql`SET lock_timeout='50ms'`;
    await single.sql`SET statement_timeout='1s'`;
    const context = processor(scope, { db: single.db });
    const start = performance.now();
    let failure: unknown;
    try {
      await context.processMany(requests);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(performance.now() - start).toBeLessThan(2_000);
    const [settings] =
      await single.sql`SELECT current_setting('lock_timeout') AS lock_timeout,current_setting('statement_timeout') AS statement_timeout`;
    expect(settings).toEqual({ lock_timeout: "50ms", statement_timeout: "1s" });
  } finally {
    await unlock?.();
    await single.close();
  }
}, 15_000);

async function waitForPostStatus(userIds: number[], status: string) {
  const deadline = performance.now() + 2_000;
  while (performance.now() < deadline) {
    const rows = await pg.db
      .select({ userId: userDocumentRebuildStates.userId, status: userDocumentRebuildStates.postPublicationStatus })
      .from(userDocumentRebuildStates);
    if (userIds.every((userId) => rows.some((row) => row.userId === userId && row.status === status))) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Healthy post-publication completion did not become visible before slow subject release");
}

function singleConnectionSql<T extends Record<string, postgres.PostgresType> = {}>(
  urlOrOptions?: string | postgres.Options<T>,
  options?: postgres.Options<T>,
) {
  return typeof urlOrOptions === "string"
    ? postgres(urlOrOptions, { ...options, max: 1 })
    : postgres({ ...urlOrOptions, max: 1 });
}
