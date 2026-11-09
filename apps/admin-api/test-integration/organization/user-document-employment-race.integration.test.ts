import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { OrganizationLevel, OrganizationType } from "@iam/contracts";
import { organizationClosures, organizations, positions, users } from "@iam/db/schema";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { createInternalUserDocumentQueryRepository, createInternalUserDocumentQueryService } from "@iam/user-document";
import { createUserDocumentJobProducer } from "@iam/user-document/producer";
import { createUserDocumentWorkerModule } from "@iam/user-document/worker";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";

const observedAt = new Date("2026-10-26T12:00:00Z");
const clock = { nowDate: () => observedAt };
const logger = { info() {}, warn() {}, error() {} };
let pg: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  pg = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await pg.reset();
  await pg.db.insert(users).values({ username: "holder", name: "Holder" });
  const [ancestor, child] = await pg.db
    .insert(organizations)
    .values([
      {
        id: 10,
        orgCode: "ANCESTOR",
        orgName: "Old ancestor",
        orgType: OrganizationType.Company,
        level: OrganizationLevel.One,
        path: "/10",
      },
      {
        id: 11,
        parentId: 10,
        businessParentId: 10,
        orgCode: "CHILD",
        orgName: "Child",
        orgType: OrganizationType.Department,
        level: OrganizationLevel.Two,
        path: "/10/11",
      },
    ])
    .returning();
  await pg.db.insert(organizationClosures).values([
    { ancestorId: ancestor!.id, descendantId: ancestor!.id, depth: 0 },
    { ancestorId: child!.id, descendantId: child!.id, depth: 0 },
    { ancestorId: ancestor!.id, descendantId: child!.id, depth: 1 },
  ]);
  await pg.db.insert(positions).values({ posCode: "POSITION", posName: "Position" });
});
afterAll(async () => {
  await pg?.close();
});

function runtime(pause?: { reached: () => void; released: Promise<void> }) {
  const jobs: Array<{ id: string; name: string; data: unknown }> = [];
  const queue = {
    async addBulk(batch: Array<{ name: string; data: unknown; opts: { jobId: string } }>) {
      const added = batch.map(({ name, data, opts }) => ({ id: opts.jobId, name, data }));
      jobs.push(...added);
      return added;
    },
    async close() {},
  };
  const jobProducer = createUserDocumentJobProducer(queue);
  const uow = createAdminApiUnitOfWork({
    db: pg.db,
    logger,
    clock,
    userDocumentJobProducer: jobProducer,
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries(entries) {
        return { enqueued: entries.length };
      },
    },
  });
  const repositories = createAdminApiRepositories(pg.db);
  const organization = createOrganizationService({
    organizationRepository: repositories.organization,
    responsibilityReader: repositories.organizationResponsibility,
    uow: mapUnitOfWork(uow, (tx) => ({
      organizationRepository: tx.repositories.organization,
      auditService: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      organizationDocumentInvalidation: tx.organizationDocumentInvalidation,
      userDocumentInvalidation: {
        async recordChanges(changes) {
          await tx.userDocumentInvalidation.recordChanges(changes);
          pause?.reached();
          await pause?.released;
        },
      },
    })),
  });
  const employment = createCreateEmploymentUseCase({
    clock,
    uow: mapUnitOfWork(uow, (tx) => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      positionReader: tx.repositories.position,
      userReader: tx.repositories.user,
      auditLogWriter: tx.auditService,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  let processJob: ((job: { id: string; name: string; data: unknown }) => Promise<unknown>) | undefined;
  const worker = createUserDocumentWorkerModule({
    db: pg.db,
    redis: { host: "localhost", port: 6379, db: 0 },
    subjectFactsRedis: {
      async eval() {
        return 1;
      },
    },
    subjectAccessRepair: {
      async repairSubject() {
        return { status: "stable" };
      },
    },
    logger,
    clock,
    config: { concurrency: 1, rebuildBatchSize: 10, backfillBatchSize: 10 },
    factories: {
      createQueue: (() => queue) as never,
      createWorker: ((input: { processor: typeof processJob }) => {
        processJob = input.processor;
        return { async close() {}, on() {} };
      }) as never,
    },
  });
  return {
    organization,
    employment,
    worker,
    async flush() {
      const consumed = [];
      for (let next = jobs.shift(); next; next = jobs.shift()) {
        if (!processJob) throw new Error("Worker has not started");
        await processJob(next);
        consumed.push(next);
      }
      return consumed;
    },
    async replay(consumed: typeof jobs) {
      for (const job of consumed) await processJob!(job);
    },
    detail: createInternalUserDocumentQueryService({
      documentRepository: createInternalUserDocumentQueryRepository(pg.db),
    }),
  };
}

test("a committed ancestor change repairs the old document published by a concurrent first employment", async () => {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const context = runtime({ reached: () => reached.resolve(), released: release.promise });
  await context.worker.startConsumers();
  const update = context.organization.updateOrganization("ANCESTOR", { orgName: "New ancestor" });
  try {
    await reached.promise;
    await context.employment.execute({ username: "holder", orgCode: "CHILD", posCode: "POSITION" });
    const consumed = await context.flush();
    const before = await context.detail.getDetailByUsername("holder", "internal");
    expect(before.employments[0]?.organization.path[0]?.name).toBe("Old ancestor");
    release.resolve();
    await update;
    await context.worker.maintenance.repairFailedOrStale({
      staleBefore: new Date(observedAt.getTime() + 1),
      limit: 10,
    });
    await context.flush();
    await context.replay(consumed);
    await context.flush();
    const after = await context.detail.getDetailByUsername("holder", "internal");
    expect(after.employments[0]?.organization.path[0]?.name).toBe("New ancestor");
  } finally {
    release.resolve();
    await Promise.allSettled([update]);
    await context.worker.close();
  }
}, 15_000);

test.each(["organization-first", "employment-first"])(
  "serial %s updates publish the same committed ancestor name",
  async (order) => {
    const context = runtime();
    await context.worker.startConsumers();
    try {
      if (order === "organization-first") {
        await context.organization.updateOrganization("ANCESTOR", { orgName: "New ancestor" });
        await context.flush();
      }
      await context.employment.execute({ username: "holder", orgCode: "CHILD", posCode: "POSITION" });
      await context.flush();
      if (order === "employment-first") {
        await context.organization.updateOrganization("ANCESTOR", { orgName: "New ancestor" });
        await context.flush();
      }
      const result = await context.detail.getDetailByUsername("holder", "internal");
      expect(result.employments[0]?.organization.path[0]?.name).toBe("New ancestor");
    } finally {
      await context.worker.close();
    }
  },
);
