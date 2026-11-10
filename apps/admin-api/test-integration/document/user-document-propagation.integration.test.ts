import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createRoleAdapter } from "@admin-api/routes/admin/role/role.adapter";
import { createRoleRoute } from "@admin-api/routes/admin/role/role.index";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createPositionService } from "@admin-api/services/position/position.service";
import type { AdminRoleTransactionPorts } from "@admin-api/services/role/role.port";
import { createRoleService } from "@admin-api/services/role/role.service";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createCreateOrganizationResponsibilityAssignmentUseCase } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.use-case";
import { createManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import { createErrorHandler } from "@iam/api-core/middlewares";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  RoleAssignmentTargetType,
  RoleStatus,
} from "@iam/contracts";
import {
  auditLogs,
  clients,
  employments,
  organizationClosures,
  organizations,
  positions,
  roles,
  userDocumentOutboxEntries,
  userDocumentRebuildStates,
  userDocuments,
  users,
} from "@iam/db/schema";
import { StoredUserDocumentSchema } from "@iam/documents/user/document";
import { createUserDocumentJobProducer } from "@iam/documents/user/producer";
import {
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
  DocumentFactsCacheRecordSchema,
} from "@iam/documents/user/subject-facts";
import { createUserDocumentWorkerModule } from "@iam/documents/user/worker";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  addTestAdminAuthorizationMiddleware,
  testFullOrganizationResponsibilityAuthorization,
} from "../../src/testing/admin-authorization";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import { type AdminApiRedisTestScope, createAdminApiRedisTestHarness } from "../support/redis-test-harness";

const observedAt = new Date("2026-10-26T12:00:00Z");
const logger = { info() {}, warn() {}, error() {} };
let pg: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  pg = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await pg.reset();
  await pg.sql`truncate role_assignment, role, client restart identity cascade`;
  await pg.db.insert(clients).values({
    id: 1,
    clientCode: "test-client",
    clientName: "Test client",
    clientSecret: "synthetic",
    extAttributes: {},
  });
  await pg.db.insert(roles).values({ roleCode: "ROLE", roleName: "Role", clientId: 1 });
  await pg.db.insert(users).values({ id: 1, username: "holder", name: "Holder" });
  await pg.db.insert(organizations).values({
    id: 10,
    orgCode: "ROOT",
    orgName: "Root",
    orgType: OrganizationType.Company,
    level: OrganizationLevel.One,
    path: "/10",
  });
  await pg.db.insert(organizationClosures).values({ ancestorId: 10, descendantId: 10, depth: 0 });
  await pg.db.insert(positions).values({ id: 20, posCode: "POSITION", posName: "Position" });
  await pg.db.insert(employments).values({
    id: 30,
    userId: 1,
    orgId: 10,
    posId: 20,
    startTime: new Date("2026-10-01T00:00:00Z"),
  });
});
afterAll(async () => {
  await pg?.close();
});

function runtime(
  decorateRole: (tx: AdminRoleTransactionPorts) => AdminRoleTransactionPorts = (tx) => tx,
  options: {
    factsRedis?: AdminApiRedisTestScope["redis"];
    pausePosition?: { reached: () => void; released: Promise<void> };
    pauseOrganization?: { reached: () => void; released: Promise<void> };
  } = {},
) {
  let currentTime = observedAt;
  const runtimeClock = { nowDate: () => currentTime };
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
    clock: runtimeClock,
    userDocumentJobProducer: jobProducer,
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries(entries) {
        return { enqueued: entries.length };
      },
    },
  });
  const repositories = createAdminApiRepositories(pg.db);
  const role = createRoleService({
    roleRepository: repositories.role,
    uow: mapUnitOfWork(uow, (tx) =>
      decorateRole({
        roleRepository: tx.repositories.role,
        auditService: tx.auditService,
        userDocumentInvalidation: tx.userDocumentInvalidation,
      }),
    ),
  });
  const position = createPositionService({
    positionRepository: repositories.position,
    uow: mapUnitOfWork(uow, (tx) => ({
      positionRepository: tx.repositories.position,
      auditService: tx.auditService,
      userDocumentInvalidation: {
        async recordChanges(changes) {
          await tx.userDocumentInvalidation.recordChanges(changes);
          options.pausePosition?.reached();
          await options.pausePosition?.released;
        },
      },
    })),
  });
  const employment = createCreateEmploymentUseCase({
    clock: runtimeClock,
    uow: mapUnitOfWork(uow, (tx) => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      positionReader: tx.repositories.position,
      userReader: tx.repositories.user,
      auditLogWriter: tx.auditService,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  const availability = createChangeEmploymentAvailabilityUseCase({
    uow: mapUnitOfWork(uow, (tx) => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      auditLogWriter: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
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
          options.pauseOrganization?.reached();
          await options.pauseOrganization?.released;
        },
      },
    })),
  });
  const responsibility = createCreateOrganizationResponsibilityAssignmentUseCase({
    clock: runtimeClock,
    uow: mapUnitOfWork(uow, (tx) => ({
      assignmentStore: tx.repositories.organizationResponsibility,
      employmentReader: tx.repositories.organizationResponsibility,
      organizationReader: tx.repositories.organizationResponsibility,
      auditLogWriter: tx.auditService,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  const responsibilityLifecycle = createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
    clock: runtimeClock,
    uow: mapUnitOfWork(uow, (tx) => ({
      assignmentStore: tx.repositories.organizationResponsibility,
      auditLogWriter: tx.auditService,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  const endEmployment = createEndEmploymentUseCase({
    clock: runtimeClock,
    uow: mapUnitOfWork(uow, (tx) => ({
      employmentStore: tx.repositories.employment,
      auditLogWriter: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  let processJob: ((job: { id: string; name: string; data: unknown }) => Promise<unknown>) | undefined;
  const worker = createUserDocumentWorkerModule({
    db: pg.db,
    redis: { host: "localhost", port: 6379, db: 0 },
    subjectFactsRedis: options.factsRedis ?? {
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
    clock: runtimeClock,
    config: { concurrency: 1, rebuildBatchSize: 10, backfillBatchSize: 10 },
    factories: {
      createQueue: (() => queue) as never,
      createWorker: ((input: { processor: typeof processJob }) => {
        processJob = input.processor;
        return { async close() {}, on() {} };
      }) as never,
    },
  });
  const factsReader = createSubjectFactsReader({
    db: pg.db,
    cache: options.factsRedis
      ? createSubjectFactsRedisCache(options.factsRedis)
      : {
          async read() {
            return null;
          },
          async publish() {
            return { status: "published" };
          },
        },
  });
  async function readFacts(username = "holder") {
    const account = await pg.db.query.users.findFirst({ where: { username } });
    if (!account) throw new Error("Expected a source identity for the published-facts read");
    const facts = await factsReader.read(account.subjectIdentifier);
    if (!facts) throw new Error("Expected published User Document facts");
    return facts;
  }
  return {
    role,
    position,
    employment,
    availability,
    organization,
    responsibility,
    responsibilityLifecycle,
    endEmployment,
    worker,
    observeAt(value: Date) {
      currentTime = value;
    },
    readFacts,
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
      if (!processJob) throw new Error("Worker has not started");
      for (const job of consumed) await processJob(job);
    },
    async readRoles(username = "holder") {
      const facts = await readFacts(username);
      return facts.employments.flatMap((employment) =>
        employment.clientAuthorizations.flatMap((authorization) => authorization.roles.map(({ code }) => code)),
      );
    },
  };
}

async function seedDescendantHolder() {
  await pg.db.insert(organizations).values({
    id: 11,
    parentId: 10,
    businessParentId: 10,
    orgCode: "CHILD",
    orgName: "Child",
    orgType: OrganizationType.Department,
    level: OrganizationLevel.Two,
    path: "/10/11",
  });
  await pg.db.insert(organizationClosures).values([
    { ancestorId: 10, descendantId: 11, depth: 1 },
    { ancestorId: 11, descendantId: 11, depth: 0 },
  ]);
  await pg.db.update(employments).set({ orgId: 11 }).where(eq(employments.id, 30));
  await pg.db.insert(users).values({ id: 2, username: "root-holder", name: "Root holder" });
  await pg.db.insert(employments).values({
    id: 31,
    userId: 2,
    orgId: 10,
    posId: 20,
    startTime: new Date("2026-10-01T00:00:00Z"),
  });
}

async function seedResponsibilityTarget() {
  await pg.db.insert(organizations).values([
    {
      id: 40,
      orgCode: "TARGET_ROOT",
      orgName: "Target ancestor",
      orgType: OrganizationType.Company,
      level: OrganizationLevel.One,
      path: "/40",
    },
    {
      id: 41,
      parentId: 40,
      businessParentId: 40,
      orgCode: "TARGET",
      orgName: "Target",
      orgType: OrganizationType.Department,
      level: OrganizationLevel.Two,
      path: "/40/41",
    },
  ]);
  await pg.db.insert(organizationClosures).values([
    { ancestorId: 40, descendantId: 40, depth: 0 },
    { ancestorId: 40, descendantId: 41, depth: 1 },
    { ancestorId: 41, descendantId: 41, depth: 0 },
  ]);
}

test("an Organization change expands at processing time to a later cross-tree responsibility holder", async () => {
  await seedResponsibilityTarget();
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const context = runtime(undefined, {
    pauseOrganization: { reached: () => reached.resolve(), released: release.promise },
  });
  await context.worker.startConsumers();
  const updating = context.organization.updateOrganization("TARGET_ROOT", { orgName: "New target ancestor" });
  try {
    await Promise.race([reached.promise, updating]);
    context.observeAt(new Date(observedAt.getTime() + 1000));
    await context.responsibility.execute(
      {
        employmentId: 30,
        targetOrganizationCode: "TARGET",
        typeCode: OrganizationResponsibilityTypeCode.Head,
      },
      { authorization: testFullOrganizationResponsibilityAuthorization },
    );
    await context.flush();
    const before = await context.readFacts();
    expect(before.employments[0]?.responsibilities[0]?.targetOrganization.path[0]?.name).toBe("Target ancestor");
    release.resolve();
    await updating;
    await context.flush();
    const after = await context.readFacts();
    expect(after.employments[0]?.responsibilities[0]?.targetOrganization.path[0]?.name).toBe("New target ancestor");
  } finally {
    release.resolve();
    await Promise.allSettled([updating]);
    await context.worker.close();
  }
}, 15_000);

test.each(["responsibility", "employment"] as const)(
  "ending a %s removes published facts through the original holder",
  async (operation) => {
    await seedResponsibilityTarget();
    const context = runtime();
    await context.worker.startConsumers();
    try {
      const created = await context.responsibility.execute(
        {
          employmentId: 30,
          targetOrganizationCode: "TARGET",
          typeCode: OrganizationResponsibilityTypeCode.Head,
        },
        { authorization: testFullOrganizationResponsibilityAuthorization },
      );
      await context.flush();
      const before = await context.readFacts();
      expect(before.employments[0]?.responsibilities).toHaveLength(1);
      context.observeAt(new Date(observedAt.getTime() + 1000));
      if (operation === "responsibility")
        await context.responsibilityLifecycle.execute(
          { id: created.result.id, command: "end" },
          { authorization: testFullOrganizationResponsibilityAuthorization },
        );
      else await context.endEmployment.execute({ employmentId: 30 });
      await context.flush();
      const after = await context.readFacts();
      if (operation === "responsibility") {
        expect(after.employments).toHaveLength(1);
        expect(after.employments[0]?.responsibilities).toEqual([]);
      } else expect(after.employments).toEqual([]);
    } finally {
      await context.worker.close();
    }
  },
);

test.each([
  { operation: "narrow", rootRoles: ["ROLE"] },
  { operation: "delete", rootRoles: [] },
] as const)(
  "organization assignment $operation removes old descendant authorization and replays safely",
  async ({ operation, rootRoles }) => {
    await seedDescendantHolder();
    const context = runtime();
    await context.worker.startConsumers();
    try {
      const created = await context.role.createAssignment("ROLE", {
        targetType: RoleAssignmentTargetType.Organization,
        orgCode: "ROOT",
        includeDescendants: true,
      });
      await context.flush();
      const before = await context.readRoles();
      expect(before).toEqual(["ROLE"]);
      if (operation === "narrow") await context.role.updateAssignmentScope("ROLE", created.result.id, false);
      else await context.role.deleteAssignment("ROLE", created.result.id);
      const consumed = await context.flush();
      const descendantRoles = await context.readRoles();
      const remainingRootRoles = await context.readRoles("root-holder");
      expect(descendantRoles).toEqual([]);
      expect(remainingRootRoles).toEqual([...rootRoles]);
      const settled = await pg.db
        .select({
          userId: userDocumentRebuildStates.userId,
          version: userDocumentRebuildStates.version,
          status: userDocumentRebuildStates.status,
        })
        .from(userDocumentRebuildStates)
        .orderBy(userDocumentRebuildStates.userId);
      expect(settled.every(({ status }) => status === "processed")).toBe(true);
      await context.replay(consumed);
      await context.flush();
      const replayed = await pg.db
        .select({
          userId: userDocumentRebuildStates.userId,
          version: userDocumentRebuildStates.version,
          status: userDocumentRebuildStates.status,
        })
        .from(userDocumentRebuildStates)
        .orderBy(userDocumentRebuildStates.userId);
      expect(replayed).toEqual(settled);
    } finally {
      await context.worker.close();
    }
  },
);

test.each([
  RoleAssignmentTargetType.Employment,
  RoleAssignmentTargetType.Position,
  RoleAssignmentTargetType.Organization,
])("Role state changes propagate through the %s assignment target and physical deletion", async (targetType) => {
  const context = runtime();
  await context.worker.startConsumers();
  try {
    const created = await context.role.createAssignment("ROLE", {
      targetType,
      ...(targetType === RoleAssignmentTargetType.Employment
        ? { employmentId: 30 }
        : targetType === RoleAssignmentTargetType.Position
          ? { posCode: "POSITION" }
          : { orgCode: "ROOT", includeDescendants: false }),
    });
    await context.flush();
    const initial = await context.readRoles();
    expect(initial).toEqual(["ROLE"]);
    await context.role.updateRoleStatus("ROLE", RoleStatus.Pause);
    await context.flush();
    const paused = await context.readRoles();
    expect(paused).toEqual([]);
    await context.role.updateRoleStatus("ROLE", RoleStatus.Enable);
    await context.flush();
    const enabled = await context.readRoles();
    expect(enabled).toEqual(["ROLE"]);
    await context.role.deleteAssignment("ROLE", created.result.id);
    await context.flush();
    const deleted = await context.readRoles();
    expect(deleted).toEqual([]);
  } finally {
    await context.worker.close();
  }
});

test.each(["create", "resume"] as const)(
  "a Position change catches a concurrent Employment %s after it published the old name",
  async (operation) => {
    if (operation === "create") await pg.db.delete(employments);
    else await pg.db.update(employments).set({ status: EmploymentStatus.Pause }).where(eq(employments.id, 30));
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const context = runtime(undefined, {
      pausePosition: { reached: () => reached.resolve(), released: release.promise },
    });
    await context.worker.startConsumers();
    const updating = context.position.updatePosition("POSITION", { posName: "New position" });
    try {
      await Promise.race([reached.promise, updating]);
      if (operation === "create")
        await context.employment.execute({ username: "holder", orgCode: "ROOT", posCode: "POSITION" });
      else await context.availability.execute({ employmentId: 30, command: "resume", expectedAncestorOrgCode: "ROOT" });
      await context.flush();
      const before = await context.readFacts();
      expect(before.employments[0]?.position.name).toBe("Position");
      release.resolve();
      await updating;
      await context.flush();
      const after = await context.readFacts();
      expect(after.employments[0]?.position.name).toBe("New position");
    } finally {
      release.resolve();
      await Promise.allSettled([updating]);
      await context.worker.close();
    }
  },
  15_000,
);

test("Role deletion rolls back its source fact and audit when Outbox registration fails", async () => {
  const sentinel = new Error("Injected source registration failure");
  const context = runtime((tx) => ({
    ...tx,
    userDocumentInvalidation: {
      async recordChanges(changes) {
        await tx.userDocumentInvalidation.recordChanges(changes);
        throw sentinel;
      },
    },
  }));
  let failure: unknown;
  try {
    await context.role.deleteRole("ROLE");
  } catch (error) {
    failure = error;
  }
  expect(failure).toBe(sentinel);
  const role = await context.role.getRoleDetailByCode("ROLE");
  const work = await pg.db.select().from(userDocumentOutboxEntries);
  const audits = await pg.db.select().from(auditLogs);
  expect(role.roleCode).toBe("ROLE");
  expect(work).toEqual([]);
  expect(audits).toEqual([]);
  await context.worker.close();
});

test.each([
  { targetType: RoleAssignmentTargetType.Employment, employmentId: 30 },
  { targetType: RoleAssignmentTargetType.Position, posCode: "POSITION" },
  { targetType: RoleAssignmentTargetType.Organization, orgCode: "ROOT" },
] as const)("Admin publishes and revokes Global Roles through $targetType assignments", async (target) => {
  await runWithOwnedTestResources(async (lifecycle) => {
    const redis = await createAdminApiRedisTestHarness();
    lifecycle.registerCleanup(() => redis.close());
    const scope = await redis.createScope();
    const context = runtime(undefined, { factsRedis: scope.redis });
    lifecycle.registerCleanup(() => context.worker.close());
    await context.worker.startConsumers();

    await pg.db.insert(organizations).values({
      id: 11,
      orgCode: "OTHER",
      orgName: "Other",
      path: "/11",
      orgType: OrganizationType.Company,
      level: OrganizationLevel.One,
    });
    await pg.db.insert(organizationClosures).values({ ancestorId: 11, descendantId: 11, depth: 0 });
    await pg.db.insert(positions).values({ id: 21, posCode: "OTHER", posName: "Other position" });
    await pg.db.insert(users).values({ id: 2, username: "unaffected", name: "Unaffected" });
    await pg.db.insert(employments).values([
      { id: 31, userId: 1, orgId: 11, posId: 21, startTime: new Date("2026-10-01T00:00:00Z") },
      { id: 32, userId: 2, orgId: 11, posId: 21, startTime: new Date("2026-10-01T00:00:00Z") },
    ]);
    const app = new Hono();
    addTestAdminAuthorizationMiddleware(app);
    app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
    app.route("/admin", createRoleRoute(createRoleAdapter({ roleService: context.role })));
    const request = (path: string, body?: object, method = "POST") =>
      app.request(`/admin/roles${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      });

    const appRole = await request("/ROLE/assignments", {
      targetType: RoleAssignmentTargetType.Employment,
      employmentId: 30,
    });
    expect(appRole.status).toBe(200);
    await context.flush();
    const subject = await pg.db.query.users.findFirst({ where: { id: 1 } });
    if (!subject) throw new Error("Expected a source user");
    const cache = createSubjectFactsRedisCache(scope.observer);
    async function readPublication(codes: string[], previousVersion?: string) {
      const row = await pg.db.query.userDocuments.findFirst({ where: { userId: 1 } });
      if (!row) throw new Error("Expected a published User Document");
      if (previousVersion !== undefined) expect(BigInt(row.sourceVersion)).toBeGreaterThan(BigInt(previousVersion));
      const document = StoredUserDocumentSchema.parse(row.document);
      const record = DocumentFactsCacheRecordSchema.parse(
        JSON.parse((await cache.read(row.subjectIdentifier)) ?? "null"),
      );
      if (record.kind !== "document") throw new Error("Expected a published Facts cache record");
      expect(record.sourceVersion).toBe(row.sourceVersion);
      expect(record.facts.employments).toEqual(document.employments);
      const facts = await context.readFacts();
      expect(facts.sourceVersion).toBe(row.sourceVersion);
      expect(facts.employments).toEqual(document.employments);
      expect(
        facts.employments.map((employment) => ({
          position: employment.position.code,
          global: (employment.globalRoles ?? []).map(({ code }) => code),
          client: employment.clientAuthorizations.flatMap((authorization) =>
            authorization.roles.map(({ code }) => code),
          ),
        })),
      ).toEqual([
        { position: "OTHER", global: [], client: [] },
        { position: "POSITION", global: codes, client: ["ROLE"] },
      ]);
      const unaffected = await pg.db.query.userDocuments.findFirst({ where: { userId: 2 } });
      expect(unaffected).toBeUndefined();
      return row.sourceVersion;
    }

    const original = await readPublication([]);
    const legacy = await pg.db.query.userDocuments.findFirst({ where: { userId: 1 } });
    expect(StoredUserDocumentSchema.parse(legacy?.document).employments[0]).not.toHaveProperty("globalRoles");
    const emptyCache = createSubjectFactsRedisCache(scope.redis, { keyPrefix: "test:global-role:fallback:" });
    const cachedBeforeFallback = await emptyCache.read(subject.subjectIdentifier);
    expect(cachedBeforeFallback).toBeNull();
    const fallbackReader = createSubjectFactsReader({ db: pg.db, cache: emptyCache });
    const fallback = await fallbackReader.read(subject.subjectIdentifier);
    expect(fallback).toEqual(await context.readFacts());
    const cachedAfterFallback = await emptyCache.read(subject.subjectIdentifier);
    expect(JSON.parse(cachedAfterFallback ?? "null")).toMatchObject({ kind: "document", sourceVersion: original });

    const created = await request("", { roleType: "global", roleCode: "global:reviewer", roleName: "Reviewer" });
    expect(created.status).toBe(200);
    const codePath = "/global%3Areviewer";
    const assigned = await request(`${codePath}/assignments`, target);
    expect(assigned.status).toBe(200);
    const { data } = z
      .object({ data: z.object({ result: z.object({ id: z.number() }) }) })
      .parse(await assigned.json());
    await context.flush();
    const assignedVersion = await readPublication(["global:reviewer"], original);

    const blockedDelete = await request(codePath, undefined, "DELETE");
    expect(blockedDelete.status).toBe(409);

    const disabled = await request(`${codePath}/status`, { status: RoleStatus.Disable }, "PATCH");
    expect(disabled.status).toBe(200);
    await context.flush();
    const disabledVersion = await readPublication([], assignedVersion);

    const enabled = await request(`${codePath}/status`, { status: RoleStatus.Enable }, "PATCH");
    expect(enabled.status).toBe(200);
    await context.flush();
    const enabledVersion = await readPublication(["global:reviewer"], disabledVersion);

    const removed = await request(`${codePath}/assignments/${data.result.id}`, undefined, "DELETE");
    expect(removed.status).toBe(200);
    await context.flush();
    await readPublication([], enabledVersion);

    const deleted = await request(codePath, undefined, "DELETE");
    expect(deleted.status).toBe(200);
    await context.flush();
    await readPublication([]);
  });
});
