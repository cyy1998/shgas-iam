import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
import type { UserDocumentJobName, UserDocumentJobPayload } from "@iam/contracts";
import { userDocumentOutboxEntries, userDocumentRebuildStates, userDocuments, users } from "@iam/db/schema";
import type { DocumentOutboxJob } from "@iam/document-update";
import { createJobWorker } from "@iam/jobs";
import {
  parseDedicatedRedisTestUrl,
  requireExternalTestUrl,
  runWithOwnedTestResources,
} from "@iam/test-support/external-test-resources";
import { createUnitOfWork } from "@iam/unit-of-work";
import { eq } from "drizzle-orm";
import {
  type CreateUserDocumentInvalidationDeps,
  createUserDocumentInvalidation,
  createUserDocumentWriteResources,
} from "../../src/producer";
import {
  createCurrentUserDocumentProjectionBundle,
  createUserDocumentJobProcessor,
  createUserDocumentUpdateProcessor,
} from "../../src/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";
import { createRedisTestHarness } from "../support/redis-test-harness";

const subjectIdentifier = "10000000-0000-4000-8000-000000000296";
const clock = { nowDate: () => new Date() };
const logger = { info() {}, warn() {}, error() {} };
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
  await pg.db.insert(users).values({ id: 1, subjectIdentifier, username: "wake-up", name: "Before" });
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

function createWritingUnitOfWork(
  jobProducer: CreateUserDocumentInvalidationDeps["jobProducer"],
  log: {
    warn(data: Record<string, unknown>, message: string): void;
    error(data: Record<string, unknown>, message: string): void;
  } = logger,
) {
  return createUnitOfWork({
    db: pg.db,
    logger: log,
    createTxPorts: (db, lifecycle) => ({
      db,
      invalidation: createUserDocumentInvalidation({ db, lifecycle, jobProducer, clock }),
    }),
  });
}

test("one committed transaction wakes all persisted Outbox entries once", async () => {
  const wakes: DocumentOutboxJob[][] = [];
  const uow = createWritingUnitOfWork({
    async enqueueOutboxEntries(jobs) {
      wakes.push(jobs);
      return { enqueued: jobs.length };
    },
  });

  const result = await uow.transaction(async (tx) => {
    await tx.db.update(users).set({ name: "After" }).where(eq(users.id, 1));
    await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
    await tx.invalidation.recordChanges([{ kind: "employment", userId: 1 }]);
    expect(wakes).toHaveLength(0);
    return { saved: true };
  });

  const [user] = await pg.db.select().from(users);
  const entries = await pg.db.select().from(userDocumentOutboxEntries);
  expect(result).toEqual({ saved: true });
  expect(user?.name).toBe("After");
  expect(entries).toHaveLength(2);
  expect(wakes).toHaveLength(1);
  expect(wakes[0]?.map(({ outboxId }) => outboxId).sort()).toEqual(entries.map(({ id }) => id).sort());
});

test("a rolled-back transaction neither preserves its Outbox nor wakes the queue", async () => {
  let wakes = 0;
  const uow = createWritingUnitOfWork({
    async enqueueOutboxEntries(jobs) {
      wakes += 1;
      return { enqueued: jobs.length };
    },
  });
  const rejected = new Error("reject business change");
  let failure: unknown;
  try {
    await uow.transaction(async (tx) => {
      await tx.db.update(users).set({ name: "After" }).where(eq(users.id, 1));
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
      throw rejected;
    });
  } catch (error) {
    failure = error;
  }

  const [user] = await pg.db.select().from(users);
  const entries = await pg.db.select().from(userDocumentOutboxEntries);
  expect(failure).toBe(rejected);
  expect(user?.name).toBe("Before");
  expect(entries).toHaveLength(0);
  expect(wakes).toBe(0);
});

test("a refused Redis connection preserves the committed result and pending Outbox", async () => {
  const peer = await createSilentPeer();
  await peer.close();
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const unavailable = createUserDocumentWriteResources({
      redis: { host: "127.0.0.1", port: peer.port, db: 0 },
      logger,
    });
    registerCleanup(() => unavailable.close());
    const uow = createWritingUnitOfWork(unavailable.jobProducer);
    const started = performance.now();
    const saved = await uow.transaction(async (tx) => {
      await tx.db.update(users).set({ name: "After" }).where(eq(users.id, 1));
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
      return { saved: true };
    });
    const durationMs = performance.now() - started;
    const [user] = await pg.db.select().from(users);
    const entries = await pg.db.select().from(userDocumentOutboxEntries);
    expect(saved).toEqual({ saved: true });
    expect(durationMs).toBeLessThan(3_000);
    expect(user?.name).toBe("After");
    expect(entries.map(({ status }) => status)).toEqual(["pending"]);
  });
});

test("a silent Redis peer bounds the committed save and repair publishes it after Redis recovers", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const silentPeer = await createSilentPeer();
    registerCleanup(silentPeer.close);
    const warnings: Record<string, unknown>[] = [];
    const prefix = `iam:test:user-document:wake-up:${randomUUID()}`;
    const unavailable = createUserDocumentWriteResources({
      redis: { host: "127.0.0.1", port: silentPeer.port, db: 0 },
      prefix,
      logger,
    });
    registerCleanup(() => unavailable.close());
    const uow = createWritingUnitOfWork(unavailable.jobProducer, {
      ...logger,
      warn(data: Record<string, unknown>) {
        warnings.push(data);
      },
    });

    const started = performance.now();
    const saved = await uow.transaction(async (tx) => {
      await tx.db.update(users).set({ name: "After" }).where(eq(users.id, 1));
      await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
      return { saved: true };
    });
    const durationMs = performance.now() - started;
    await silentPeer.received;
    const [user] = await pg.db.select().from(users);
    const entries = await pg.db.select().from(userDocumentOutboxEntries);
    expect(saved).toEqual({ saved: true });
    expect(durationMs).toBeLessThan(3_000);
    expect(user?.name).toBe("After");
    expect(entries.map(({ status }) => status)).toEqual(["pending"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ afterCommit: "user_document.outbox.wake_up", mode: "bestEffort" });
    const closeStarted = performance.now();
    await unavailable.close();
    expect(performance.now() - closeStarted).toBeLessThan(1_000);

    const redisConfig = parseDedicatedRedisTestUrl({
      name: "IAM_USER_DOCUMENT_TEST_REDIS_URL",
      value: requireExternalTestUrl({
        environment: process.env,
        lane: "User Document wake-up integration",
        name: "IAM_USER_DOCUMENT_TEST_REDIS_URL",
      }),
    });
    const scope = await redis.createScope();
    registerCleanup(() => scope.close());
    const recovered = createUserDocumentWriteResources({ redis: redisConfig, prefix, logger });
    registerCleanup(() => recovered.close());
    await recovered.queue.waitUntilReady();
    const processor = createUserDocumentUpdateProcessor({
      db: pg.db,
      projection: createCurrentUserDocumentProjectionBundle(),
      jobProducer: recovered.jobProducer,
      subjectFactsPublisher: scope.firstFactsPublisher,
      subjectAccessRepair: {
        async repairSubject() {
          return { status: "stable" as const };
        },
      },
      logger,
      clock,
      batchSize: 10,
    });
    const consumer = createJobWorker<UserDocumentJobPayload, unknown, UserDocumentJobName>({
      name: recovered.queue.name,
      redis: redisConfig,
      prefix,
      processor: createUserDocumentJobProcessor({ rebuildProcessor: processor, outboxProcessor: processor, logger }),
      concurrency: 1,
    });
    consumer.on("error", () => {});
    registerCleanup(() => consumer.close());
    await consumer.waitUntilReady();
    const repaired = await processor.repairFailedOrStale({ staleBefore: new Date(), limit: 10 });
    expect(repaired.failed).toBe(0);
    await waitUntil(async () => {
      const [state] = await pg.db.select().from(userDocumentRebuildStates);
      return state?.status === "processed" && state.postPublicationStatus === "processed";
    });
    const [document] = await pg.db.select().from(userDocuments);
    const [publishedState] = await pg.db.select().from(userDocumentRebuildStates);
    const facts = await scope.readPublishedUserDocumentRecord(subjectIdentifier);
    expect(document?.document).toMatchObject({ name: "After" });
    expect(facts?.sourceVersion).toBe(publishedState?.version);

    await recovered.jobProducer.enqueueOutboxEntries(entries.map(({ id }) => ({ outboxId: id })));
    await waitUntil(async () => {
      const counts = await recovered.queue.getJobCounts("waiting", "active", "delayed");
      return counts.waiting === 0 && counts.active === 0 && counts.delayed === 0;
    });
    const [replayedState] = await pg.db.select().from(userDocumentRebuildStates);
    const replayedFacts = await scope.readPublishedUserDocumentRecord(subjectIdentifier);
    expect(replayedState?.version).toBe(publishedState?.version);
    expect(replayedFacts?.sourceVersion).toBe(publishedState?.version);
  });
}, 12_000);

async function waitUntil(predicate: () => Promise<boolean>) {
  const deadline = performance.now() + 3_000;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("User Document recovery did not converge");
}

async function createSilentPeer() {
  const sockets = new Set<Socket>();
  let receive!: () => void;
  const received = new Promise<void>((resolve) => {
    receive = resolve;
  });
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("data", () => receive());
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Silent peer has no TCP address");
  return {
    port: address.port,
    received,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
