import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createPositionService } from "@admin-api/services/position/position.service";
import type { AdminRoleTransactionPorts } from "@admin-api/services/role/role.port";
import { createRoleService } from "@admin-api/services/role/role.service";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createCreateOrganizationResponsibilityAssignmentUseCase } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.use-case";
import { createManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import { mapUnitOfWork } from "@iam/api-core/uow";
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
  users,
} from "@iam/db/schema";
import { createUserDocumentJobProducer } from "@iam/user-document/producer";
import { createSubjectFactsReader } from "@iam/user-document/subject-facts";
import { createUserDocumentWorkerModule } from "@iam/user-document/worker";
import { eq } from "drizzle-orm";
import { testFullOrganizationResponsibilityAuthorization } from "../../src/testing/admin-authorization";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";

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
  await pg.db.insert(roles).values({ id: 1, roleCode: "ROLE", roleName: "Role", clientId: 1 });
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
    cache: {
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

test("a Role deletion removes authorization published by a concurrent new assignment", async () => {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const context = runtime((tx) => ({
    ...tx,
    roleRepository: {
      ...tx.roleRepository,
      async countAssignmentsByRoleId(roleId) {
        const count = await tx.roleRepository.countAssignmentsByRoleId(roleId);
        reached.resolve();
        await release.promise;
        return count;
      },
    },
  }));
  await context.worker.startConsumers();
  const deleting = context.role.deleteRole("ROLE");
  try {
    await Promise.race([reached.promise, deleting]);
    await context.role.createAssignment("ROLE", {
      targetType: RoleAssignmentTargetType.Employment,
      employmentId: 30,
    });
    await context.flush();
    const before = await context.readRoles();
    expect(before).toEqual(["ROLE"]);
    release.resolve();
    await deleting;
    await context.flush();
    const after = await context.readRoles();
    expect(after).toEqual([]);
  } finally {
    release.resolve();
    await Promise.allSettled([deleting]);
    await context.worker.close();
  }
}, 15_000);

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
