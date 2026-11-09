import { expect, test } from "bun:test";
import { createConnection, createServer, type Socket } from "node:net";
import process from "node:process";
import { OrganizationLevel, OrganizationType } from "@iam/contracts";
import { organizationClosures, organizations } from "@iam/db/schema";
import {
  type CreateOrganizationDocumentInvalidationInput,
  createOrganizationDocumentInvalidation,
  createOrganizationDocumentWriteResources,
  type OrganizationOutboxJobPayload,
} from "@iam/documents/organization/producer";
import { createOrganizationDocumentWorkerModule } from "@iam/documents/organization/worker";
import { parseDedicatedRedisTestUrl, runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { createUnitOfWork } from "@iam/unit-of-work";
import { eq } from "drizzle-orm";
import { createWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import {
  createWorkerRedisTestHarness,
  resetWorkerRedisTestDatabase,
  resolveWorkerRedisTestUrl,
} from "../support/redis-test-harness";

const logger = { info() {}, warn() {}, error() {} };

test("a committed Organization transaction combines two registrations into one wake without dropping either Outbox entry", async () => {
  await withFixture(async (fixture) => {
    const wakes: OrganizationOutboxJobPayload[][] = [];
    const uow = fixture.unitOfWork({
      async enqueueOutboxEntries(payloads) {
        wakes.push(payloads);
        return { enqueued: payloads.length };
      },
    });
    const result = await uow.transaction(async (tx) => {
      await tx.db.update(organizations).set({ orgName: "After" }).where(eq(organizations.id, 1));
      await tx.invalidation.recordChanges([{ kind: "updated", organizationId: 1, changedFields: ["name"] }]);
      await tx.db.update(organizations).set({ isVirtual: true }).where(eq(organizations.id, 1));
      await tx.invalidation.recordChanges([{ kind: "updated", organizationId: 1, changedFields: ["isVirtual"] }]);
      expect(wakes).toHaveLength(0);
      return { saved: true };
    });
    const [source] = await fixture.pg.sql`SELECT org_name,is_virtual FROM organization WHERE id=1`;
    const entries = await fixture.pg.sql<{ id: string; status: string; scope: string }[]>`
      SELECT id,status,scope FROM organization_document_outbox`;
    expect(result).toEqual({ saved: true });
    expect(source).toEqual({ org_name: "After", is_virtual: true });
    expect(entries.map(({ status }) => status)).toEqual(["pending", "pending"]);
    expect(entries.map(({ scope }) => scope).sort()).toEqual(["self", "subtree"]);
    expect(wakes).toHaveLength(1);
    expect(wakes[0]?.map(({ outboxId }) => outboxId).sort()).toEqual(entries.map(({ id }) => id).sort());
  });
});

test("an Organization rollback keeps the source unchanged and discards both the Outbox and wake", async () => {
  await withFixture(async (fixture) => {
    let wakes = 0;
    const uow = fixture.unitOfWork({
      async enqueueOutboxEntries(payloads) {
        wakes += 1;
        return { enqueued: payloads.length };
      },
    });
    const rejected = new Error("reject source mutation");
    let failure: unknown;
    try {
      await uow.transaction(async (tx) => {
        await tx.db.update(organizations).set({ orgName: "After" }).where(eq(organizations.id, 1));
        await tx.invalidation.recordChanges([{ kind: "updated", organizationId: 1, changedFields: ["name"] }]);
        throw rejected;
      });
    } catch (error) {
      failure = error;
    }
    const [source] = await fixture.pg.sql`SELECT org_name FROM organization WHERE id=1`;
    const entries = await fixture.pg.sql`SELECT id FROM organization_document_outbox`;
    expect(failure).toBe(rejected);
    expect(source?.org_name).toBe("Before");
    expect(entries).toHaveLength(0);
    expect(wakes).toBe(0);
  });
});

test("a ready Redis connection that becomes silent times out, releases its socket and recovers through repair", async () => {
  await withFixture(async (fixture) => {
    const proxy = await createReplyGateProxy(fixture.redisConfig);
    fixture.stopExecutors.push(proxy.close);
    const unavailable = createOrganizationDocumentWriteResources({
      redis: { ...fixture.redisConfig, host: "127.0.0.1", port: proxy.port },
      logger,
    });
    fixture.stopExecutors.push(() => unavailable.close());
    // Establish a working Redis/BullMQ connection before suppressing replies: a
    // connectTimeout alone cannot release this already-ready connection.
    await unavailable.queue.waitUntilReady();
    const originalSocketClosed = proxy.silenceReplies();
    const warnings: Record<string, unknown>[] = [];
    const uow = fixture.unitOfWork(unavailable.jobProducer, {
      ...logger,
      warn(data: Record<string, unknown>) {
        warnings.push(data);
      },
    });
    const started = performance.now();
    const result = await uow.transaction(async (tx) => {
      await tx.db.update(organizations).set({ orgName: "After" }).where(eq(organizations.id, 1));
      await tx.invalidation.recordChanges([{ kind: "updated", organizationId: 1, changedFields: ["name"] }]);
      await tx.db.update(organizations).set({ isVirtual: true }).where(eq(organizations.id, 1));
      await tx.invalidation.recordChanges([{ kind: "updated", organizationId: 1, changedFields: ["isVirtual"] }]);
      return { saved: true };
    });
    const durationMs = performance.now() - started;
    const [source] = await fixture.pg.sql`SELECT org_name,is_virtual FROM organization WHERE id=1`;
    const entries = await fixture.pg.sql<
      { id: string; status: string }[]
    >`SELECT id,status FROM organization_document_outbox`;
    expect(result).toEqual({ saved: true });
    expect(durationMs).toBeLessThan(3_000);
    expect(source).toEqual({ org_name: "After", is_virtual: true });
    expect(entries.map(({ status }) => status)).toEqual(["pending", "pending"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ afterCommit: "organization_document.outbox.wake_up", mode: "bestEffort" });
    // Observe automatic release before explicitly closing either resource. This
    // assertion fails if only the caller deadline is added without socketTimeout.
    await within(originalSocketClosed, 3_000);
    const closeStarted = performance.now();
    await unavailable.close();
    expect(performance.now() - closeStarted).toBeLessThan(1_000);
    await proxy.close();

    const recovered = createOrganizationDocumentWriteResources({ redis: fixture.redisConfig, logger });
    fixture.stopExecutors.push(() => recovered.close());
    const consumer = createOrganizationDocumentWorkerModule({
      db: fixture.pg.db,
      redis: fixture.redisConfig,
      logger,
      config: { concurrency: 1 },
    });
    fixture.stopExecutors.push(consumer.close);
    await consumer.queue.waitUntilReady();
    await recovered.queue.waitUntilReady();
    const repaired = await consumer.processor.repairFailedOrStale({ staleBefore: new Date(), limit: 10 });
    expect(repaired).toMatchObject({ enqueued: 2, failed: 0 });
    await consumer.startConsumers();
    await waitUntil(async () => {
      const [row] = await fixture.pg
        .sql`SELECT status FROM organization_document_rebuild_state WHERE organization_id=1`;
      return row?.status === "processed";
    });
    await waitForQueue(recovered.queue);
    const [published] = await fixture.pg.sql<
      { name: string; virtual: boolean; source_version: string; version: string }[]
    >`
      SELECT document->>'name' AS name,(document->>'isVirtual')::boolean AS virtual,source_version,version
      FROM organization_document JOIN organization_document_rebuild_state USING (organization_id) WHERE organization_id=1`;
    expect(published).toEqual({ name: "After", virtual: true, source_version: "2", version: "2" });

    // Both repair and an original timed-out addBulk can deliver the same durable
    // entries. Replaying again must retain their registered rebuild versions.
    await recovered.jobProducer.enqueueOutboxEntries(entries.map(({ id }) => ({ outboxId: id })));
    await waitForQueue(recovered.queue);
    const [replayed] = await fixture.pg.sql`SELECT source_version,version
      FROM organization_document JOIN organization_document_rebuild_state USING (organization_id) WHERE organization_id=1`;
    expect(replayed).toEqual({ source_version: published?.source_version, version: published?.version });
  });
}, 20_000);

async function withFixture(work: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) {
  const stopExecutors: Array<() => Promise<void> | void> = [];
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    registerCleanup(async () => {
      if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
    });
    await work(await createFixture(stopExecutors));
  });
}

async function createFixture(stopExecutors: Array<() => Promise<void> | void>) {
  const pg = await createWorkerPostgresTestHarness();
  stopExecutors.push(pg.close);
  const redis = await createWorkerRedisTestHarness();
  stopExecutors.push(redis.close);
  const redisConfig = parseDedicatedRedisTestUrl({
    name: "IAM_WORKER_TEST_REDIS_URL",
    value: resolveWorkerRedisTestUrl(process.env),
  });
  await pg.db.insert(organizations).values({
    id: 1,
    orgCode: "WAKE-UP",
    orgName: "Before",
    parentId: -1,
    path: "/1",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
  });
  await pg.db.insert(organizationClosures).values({ ancestorId: 1, descendantId: 1, depth: 0 });
  return {
    pg,
    redisConfig,
    stopExecutors,
    unitOfWork(
      jobProducer: CreateOrganizationDocumentInvalidationInput["jobProducer"],
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
          invalidation: createOrganizationDocumentInvalidation({ db, lifecycle, jobProducer }),
        }),
      });
    },
  };
}

async function waitForQueue(queue: ReturnType<typeof createOrganizationDocumentWriteResources>["queue"]) {
  await waitUntil(async () => {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
    if (counts.failed) throw new Error("Organization recovery left a failed queue job");
    return counts.waiting === 0 && counts.active === 0 && counts.delayed === 0;
  });
}

async function waitUntil(predicate: () => Promise<boolean>) {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Organization wake-up recovery did not converge");
}

async function within<T>(operation: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("The silent ready Redis socket was not released")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function createReplyGateProxy(upstream: { host: string; port: number }) {
  const sockets = new Set<Socket>();
  const clients = new Set<Socket>();
  let silent = false;
  let closing: Promise<void> | undefined;
  const server = createServer((client) => {
    const remote = createConnection({ host: upstream.host, port: upstream.port });
    clients.add(client);
    for (const socket of [client, remote]) {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.on("close", () => sockets.delete(socket));
    }
    client.on("close", () => {
      clients.delete(client);
      remote.destroy();
    });
    remote.on("close", () => client.destroy());
    client.pipe(remote);
    remote.on("data", (chunk) => {
      if (!silent) client.write(chunk);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Redis reply proxy has no TCP address");
  return {
    port: address.port,
    silenceReplies() {
      const client = [...clients][0];
      if (!client) throw new Error("The producer has no ready Redis connection to silence");
      silent = true;
      return new Promise<void>((resolve) => client.once("close", () => resolve()));
    },
    close() {
      closing ??= (async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      })();
      return closing;
    },
  };
}
