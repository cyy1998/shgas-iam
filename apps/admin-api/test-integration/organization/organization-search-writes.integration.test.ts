import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { connect, createServer, type Socket } from "node:net";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { OrganizationType } from "@iam/contracts";
import { organizationSearchChanges, organizations } from "@iam/db/schema";
import { OrganizationCreateDtoSchema } from "@iam/domain/organization";
import {
  createOrganizationSearchQueryRepository,
  createOrganizationSearchQueryService,
} from "@iam/organization-search-read-model";
import { createOrganizationSearchWriteResources } from "@iam/organization-search-read-model/producer";
import {
  createOrganizationSearchProcessor,
  type OrganizationRebuildJobPayload,
} from "@iam/organization-search-read-model/worker";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createAdminApiRedisTestHarness } from "../support/redis-test-harness";

let pg: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;
let redisHarness: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;
beforeAll(async () => {
  pg = await createAdminApiPostgresTestHarness();
  try {
    redisHarness = await createAdminApiRedisTestHarness();
  } catch (error) {
    await runWithOwnedTestResources(async (lifecycle) => {
      lifecycle.registerCleanup(() => pg.close());
      throw error;
    });
  }
});
afterEach(async () => {
  await redisHarness?.reset();
});
afterAll(async () => {
  await runWithOwnedTestResources(async (lifecycle) => {
    lifecycle.registerCleanup(() => pg?.close());
    lifecycle.registerCleanup(() => redisHarness?.close());
  });
});

async function withDeadline<T>(pending: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Test operation did not finish before its deadline")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function createPausedRedisProxy() {
  const url = process.env.IAM_ADMIN_API_TEST_REDIS_URL;
  if (!url) throw new Error("IAM_ADMIN_API_TEST_REDIS_URL is required; no fallback is allowed");
  const redis = new URL(url);
  if (redis.protocol !== "redis:") throw new Error("This TCP fault fixture requires a dedicated redis: URL");
  const sockets = new Set<Socket>();
  const fronts = new Set<Socket>();
  let restored = false;
  function bridge(front: Socket) {
    const back = connect({ host: redis.hostname, port: Number(redis.port || 6379) });
    sockets.add(back);
    back.on("error", () => front.destroy());
    back.once("connect", () => {
      front.pipe(back);
      back.pipe(front);
      front.resume();
    });
    back.once("close", () => {
      sockets.delete(back);
      front.destroy();
    });
    front.once("close", () => back.destroy());
  }
  const server = createServer((front) => {
    front.pause();
    sockets.add(front);
    fronts.add(front);
    front.on("error", () => undefined);
    front.once("close", () => {
      sockets.delete(front);
      fronts.delete(front);
    });
    if (restored) bridge(front);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Redis proxy port was not allocated");
  return {
    redis: {
      host: "127.0.0.1",
      port: address.port,
      db: Number(redis.pathname.slice(1) || "0"),
      username: redis.username || undefined,
      password: redis.password || undefined,
    },
    restore() {
      if (restored) return;
      restored = true;
      for (const front of fronts) bridge(front);
    },
    stall() {
      restored = false;
      for (const socket of sockets) socket.destroy();
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test("a stalled real Redis wake preserves committed source work and the same queue wakes again after recovery", async () => {
  await runWithOwnedTestResources(async (lifecycle) => {
    const proxy = await createPausedRedisProxy();
    const closeProxy = redisHarness.registerStopExecutor(() => proxy.close());
    lifecycle.registerCleanup(closeProxy);
    const resources = createOrganizationSearchWriteResources({
      redis: proxy.redis,
      prefix: `org-write-${randomUUID()}`,
      logger: { error() {} },
    });
    const closeResources = redisHarness.registerStopExecutor(() => resources.close());
    lifecycle.registerCleanup(closeResources);
    const pending: Promise<unknown>[] = [];
    function trackMutation<T>(work: Promise<T>) {
      pending.push(work);
      return work;
    }
    lifecycle.registerCleanup(
      redisHarness.registerStopExecutor(async () => {
        proxy.restore();
        await withDeadline(Promise.allSettled(pending), 5_000);
      }),
    );
    const repositories = createAdminApiRepositories(pg.db);
    const warnings: unknown[] = [];
    const uow = createAdminApiUnitOfWork({
      db: pg.db,
      logger: {
        error() {},
        warn(value: unknown) {
          warnings.push(value);
        },
      },
      clock: { nowDate: () => new Date() },
      userProfileJobProducer: {
        async enqueueRebuildJobs() {
          return { enqueued: 0, jobIds: [] };
        },
      },
      organizationSearchJobProducer: resources.jobProducer,
    });
    const service = createOrganizationService({
      organizationRepository: repositories.organization,
      responsibilityReader: repositories.organizationResponsibility,
      uow: mapUnitOfWork(uow, (tx) => ({
        organizationRepository: tx.repositories.organization,
        auditService: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userProfileInvalidation: tx.userProfileInvalidation,
        organizationSearchInvalidation: tx.organizationSearchInvalidation,
      })),
    });
    const writing = trackMutation(
      service.setOrganization(
        OrganizationCreateDtoSchema.parse({ orgCode: "OUTAGE", orgName: "Outage", orgType: OrganizationType.Company }),
      ),
    );
    const result = await withDeadline(writing, 3_500);
    expect(result).toMatchObject({ changed: true, result: { orgCode: "OUTAGE" } });
    const committed = await pg.db.select().from(organizations);
    const durable = await pg.db.select().from(organizationSearchChanges);
    expect(committed).toMatchObject([{ orgCode: "OUTAGE" }]);
    expect(durable).toMatchObject([{ status: "pending", scope: "self" }]);
    expect(warnings).not.toEqual([]);

    proxy.restore();
    await withDeadline(resources.queue.waitUntilReady(), 5_000);
    const restored = await trackMutation(
      service.setOrganization(
        OrganizationCreateDtoSchema.parse({
          orgCode: "RESTORED",
          orgName: "Restored",
          orgType: OrganizationType.Company,
        }),
      ),
    );
    expect(restored).toMatchObject({ changed: true, result: { orgCode: "RESTORED" } });
    proxy.stall();
    const interrupted = await withDeadline(
      trackMutation(service.updateOrganization("RESTORED", { orgName: "After disconnect" })),
      3_500,
    );
    expect(interrupted).toEqual({ changed: true, result: null });
    proxy.restore();
    const recoveredClient = await resources.queue.getBackend().client;
    if (recoveredClient.status !== "ready") {
      await withDeadline(new Promise<void>((resolve) => recoveredClient.once("ready", resolve)), 5_000);
    }
    const recovered = await withDeadline(
      trackMutation(service.updateOrganization("RESTORED", { orgName: "Recovered" })),
      3_500,
    );
    expect(recovered).toEqual({ changed: true, result: null });
    const changes = await pg.db.select().from(organizationSearchChanges);
    const jobs = await resources.queue.getJobs(["wait"]);
    expect(jobs.map((job) => job.data)).toContainEqual({ changeId: changes.at(-1)!.id });
    const rebuilds: OrganizationRebuildJobPayload[] = [];
    const processor = createOrganizationSearchProcessor({
      db: pg.db,
      jobProducer: {
        async enqueueSourceChanges() {
          return { enqueued: 0 };
        },
        async enqueueRebuilds(payloads) {
          rebuilds.push(...payloads);
          return { enqueued: payloads.length };
        },
      },
    });
    for (const change of changes) await processor.processSourceChange({ changeId: change.id });
    for (const rebuild of rebuilds) await processor.processRebuild(rebuild);
    const documents = await createOrganizationSearchQueryService({
      repository: createOrganizationSearchQueryRepository(pg.db),
    }).search({ filter: { field: "organization.code", op: "in", value: ["OUTAGE", "RESTORED"] } });
    expect(documents).toMatchObject([
      { organization: { code: "OUTAGE" } },
      { organization: { code: "RESTORED", name: "Recovered" } },
    ]);
  });
}, 15_000);

test("closes organization write resources while the first Redis connection has never become ready", async () => {
  await runWithOwnedTestResources(async (lifecycle) => {
    const proxy = await createPausedRedisProxy();
    lifecycle.registerCleanup(redisHarness.registerStopExecutor(() => proxy.close()));
    const resources = createOrganizationSearchWriteResources({
      redis: proxy.redis,
      prefix: `org-close-${randomUUID()}`,
      logger: { error() {} },
    });
    const closeResources = redisHarness.registerStopExecutor(() => resources.close());
    lifecycle.registerCleanup(closeResources);
    const wake = resources.jobProducer.enqueueSourceChanges([{ changeId: randomUUID() }]);
    lifecycle.registerCleanup(
      redisHarness.registerStopExecutor(async () => {
        await withDeadline(Promise.allSettled([wake]), 3_000);
      }),
    );
    await withDeadline(closeResources(), 1_500);
    const outcomes = await withDeadline(Promise.allSettled([wake]), 3_000);
    expect(outcomes).toMatchObject([{ status: "rejected" }]);
  });
});
