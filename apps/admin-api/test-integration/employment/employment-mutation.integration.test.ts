import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import type { AdminApiTxPorts } from "@admin-api/composition/tx";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createEmploymentAdapter } from "@admin-api/routes/admin/employment/employment.adapter";
import { createEmploymentRoute } from "@admin-api/routes/admin/employment/employment.index";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { EmploymentAdminPaginationQueryDtoSchema } from "@admin-api/services/employment/employment.schema";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createManagePrimaryEmploymentUseCase } from "@admin-api/use-cases/employment/manage-primary-employment/manage-primary-employment.use-case";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { createTransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import { createUpdateEmploymentUseCase } from "@admin-api/use-cases/employment/update-employment/update-employment.use-case";
import { createManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import { createErrorHandler } from "@iam/api-core/middlewares";
import {
  OrganizationResponsibilityAssignmentStatus as AssignmentStatus,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import {
  organizationResponsibilityAssignments as assignments,
  auditLogs,
  employments,
  organizationClosures,
  organizations,
  positions,
  subjectAccessTransitions,
  userDocumentOutboxEntries,
  userDocumentRebuildStates,
  users,
} from "@iam/db/schema";
import { createSubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
import { EmploymentAlreadyExistsError, EmploymentNotEditableError } from "@iam/domain/employment";
import { BadRequestError } from "@iam/runtime/errors";
import { createSubjectAccessBarrier } from "@iam/subject-access";
import { createSubjectAccessLifecycle } from "@iam/subject-access/lifecycle";
import { createInMemorySubjectAccessStore } from "@iam/subject-access/testing";
import type { TransactionContext } from "@iam/unit-of-work";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { withTestFullOrganizationResponsibilityAuthorization } from "../../src/testing/admin-authorization";
import type { AdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import {
  createUserDocumentSourceConsumer,
  expectCompletedUserDocumentSources,
} from "../support/user-document-workflow";

let harness: AdminApiPostgresTestHarness;
const now = new Date("2026-09-06T16:00:00Z");
const today = "2026-09-07";
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

function commands(
  decorate: (tx: TransactionContext<AdminApiTxPorts>) => AdminApiTxPorts = (tx) => tx,
  prepareRepairError?: Error,
  revocationError?: Error,
  initialSubjectIdentifier?: string,
  clock = { nowDate: () => now },
) {
  const enqueueRebuildJobs = mock(async () => ({ enqueued: 1, jobIds: ["employment-job"] }));
  const uow = mapUnitOfWork(
    createAdminApiUnitOfWork({
      db: harness.db,
      clock,
      logger: { error: mock(() => undefined), warn: mock(() => undefined) },
      organizationDocumentJobProducer: {
        async enqueueOutboxEntries() {
          return { enqueued: 0 };
        },
      },
      userDocumentJobProducer: createUserDocumentSourceConsumer(harness.db, enqueueRebuildJobs, clock),
    }),
    decorate,
  );
  const lifecycle = mapUnitOfWork(uow, (tx) => ({
    employmentStore: tx.repositories.employment,
    organizationReader: tx.repositories.organization,
    auditLogWriter: tx.auditService,
    responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
    userDocumentInvalidation: tx.userDocumentInvalidation,
  }));
  const repositories = createAdminApiRepositories(harness.db);
  const store = createInMemorySubjectAccessStore(
    initialSubjectIdentifier
      ? [
          {
            version: 1,
            subjectIdentifier: initialSubjectIdentifier,
            state: "enabled",
            transitionId: randomUUID(),
            updatedAt: now.toISOString(),
          },
        ]
      : [],
  );
  const random = { uuid: randomUUID };
  const barrier = createSubjectAccessBarrier({ clock, random, store });
  const revokeUserSessions = mock(async () => {
    if (revocationError) throw revocationError;
  });
  return {
    revokeUserSessions,
    resign: createResignUserUseCase({
      clock,
      userReader: repositories.user,
      sessionRevocation: { prepareUserSessionRevocation: async () => ({ revoke: revokeUserSessions }) },
      subjectAccessLifecycle: createSubjectAccessLifecycle({
        barrier: prepareRepairError
          ? {
              ...barrier,
              prepareRepair: async () => {
                throw prepareRepairError;
              },
            }
          : barrier,
        logger: { warn: mock(() => undefined) },
        random,
        transitionIntent: createSubjectAccessTransitionRepository(harness.db),
      }),
      uow: mapUnitOfWork(uow, (tx) => ({
        employmentStore: tx.repositories.employment,
        userStore: tx.repositories.user,
        subjectAccessMutation: tx.subjectAccessMutation,
        auditLogWriter: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userDocumentInvalidation: tx.userDocumentInvalidation,
      })),
    }),
    enqueueRebuildJobs,
    primary: createManagePrimaryEmploymentUseCase({
      uow: mapUnitOfWork(uow, (tx) => ({
        employmentStore: tx.repositories.employment,
        auditLogWriter: tx.auditService,
        userDocumentInvalidation: tx.userDocumentInvalidation,
      })),
    }),
    transfer: createTransferEmploymentUseCase({
      clock,
      uow: mapUnitOfWork(uow, (tx) => ({
        employmentStore: tx.repositories.employment,
        organizationReader: tx.repositories.organization,
        positionReader: tx.repositories.position,
        userReader: tx.repositories.user,
        auditLogWriter: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userDocumentInvalidation: tx.userDocumentInvalidation,
      })),
    }),
    availability: createChangeEmploymentAvailabilityUseCase({ clock, uow: lifecycle }),
    end: createEndEmploymentUseCase({ clock, uow: lifecycle }),
    create: createCreateEmploymentUseCase({
      clock,
      uow: mapUnitOfWork(uow, (tx) => ({
        employmentStore: tx.repositories.employment,
        organizationReader: tx.repositories.organization,
        positionReader: tx.repositories.position,
        userReader: tx.repositories.user,
        auditLogWriter: tx.auditService,
        userDocumentInvalidation: tx.userDocumentInvalidation,
      })),
    }),
    profile: createEmploymentService({
      employmentRepository: repositories.employment,
      roleRepository: repositories.role,

      roleAssignmentResolver: { resolveEffectiveRoles: async () => new Map() },
    }),
    update: createUpdateEmploymentUseCase({ clock, uow: lifecycle }),
    assignment: withTestFullOrganizationResponsibilityAuthorization(
      createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
        clock,
        uow: mapUnitOfWork(uow, (tx) => ({
          assignmentStore: tx.repositories.organizationResponsibility,
          auditLogWriter: tx.auditService,
          userDocumentInvalidation: tx.userDocumentInvalidation,
        })),
      }),
    ),
  };
}

function employmentApp(subject: ReturnType<typeof commands>, actorUserId: number, scopedOrganizationId?: number) {
  const adapter = createEmploymentAdapter({
    employmentService: subject.profile,
    createEmployment: subject.create,
    transferEmployment: subject.transfer,
    updateEmployment: subject.update,
    changeEmploymentAvailability: subject.availability,
    endEmployment: subject.end,
    managePrimaryEmployment: subject.primary,
    resignUser: subject.resign,
  });
  const app = new Hono<{
    Variables: {
      adminAuthorizationPolicy: ReturnType<typeof createAdminAuthorizationPolicy>;
      userId: number;
      username: string;
      userDetailDto: { roles: string[] };
    };
  }>();
  app.use("*", async (context, next) => {
    context.set("userId", actorUserId);
    context.set("username", "actor");
    context.set("userDetailDto", { roles: [scopedOrganizationId === undefined ? "iam:admin" : "iam:hr-admin"] });
    context.set(
      "adminAuthorizationPolicy",
      createAdminAuthorizationPolicy({
        logger: { warn: mock() },
        hrAdministrationScopeResolver: {
          resolveForActor: async () =>
            scopedOrganizationId === undefined
              ? null
              : {
                  rootOrganizationIds: [scopedOrganizationId],
                  organizationIds: [scopedOrganizationId],
                },
        },
      }),
    );
    await next();
  });
  app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
  app.route("/admin", createEmploymentRoute(adapter));
  app.all("/rpc/*", (context) =>
    fetchRequestHandler({
      endpoint: "/rpc",
      req: context.req.raw,
      router: adapter.employmentAdminRouter,
      createContext: () => ({ hono: context }),
    }),
  );
  return app;
}

async function employmentAuthorization(organizationId: number, scoped: boolean) {
  return createAdminAuthorizationPolicy({
    logger: { warn: mock() },
    hrAdministrationScopeResolver: {
      resolveForActor: async () => ({
        rootOrganizationIds: [organizationId],
        organizationIds: [organizationId],
      }),
    },
  }).getEmploymentAuthorization({
    userId: 99,
    username: "actor",
    roles: [scoped ? "iam:hr-admin" : "iam:admin"],
  });
}

async function seed(withEmployment = true) {
  const [user] = await harness.db
    .insert(users)
    .values({ username: "holder", name: "Holder", userType: UserType.Formal })
    .returning();
  const [org] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "ORG",
      orgName: "Org",
      path: "/ORG",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    })
    .returning();
  await harness.db.insert(organizationClosures).values({ ancestorId: org!.id, descendantId: org!.id, depth: 0 });
  const [position] = await harness.db.insert(positions).values({ posCode: "POS", posName: "Position" }).returning();
  const value = {
    userId: user!.id,
    orgId: org!.id,
    posId: position!.id,
    startTime: "2026-01-01",
    status: EmploymentStatus.Enable,
  };
  const employment = withEmployment ? (await harness.db.insert(employments).values(value).returning())[0]! : undefined;
  return { user: user!, org: org!, position: position!, employment, value };
}
async function seedAssignments(employmentId: number, targetOrganizationId: number) {
  return await harness.db
    .insert(assignments)
    .values([
      {
        employmentId,
        targetOrganizationId,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        status: AssignmentStatus.Enable,
        startTime: new Date("2026-01-01T00:00:00Z"),
      },
      {
        employmentId,
        targetOrganizationId,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        status: AssignmentStatus.Enable,
        startTime: new Date("2026-01-01T00:00:00Z"),
      },
    ])
    .returning();
}
async function facts() {
  return {
    users: await harness.db.select().from(users).orderBy(users.id),
    employments: await harness.db.select().from(employments).orderBy(employments.id),
    assignments: await harness.db.select().from(assignments).orderBy(assignments.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    dirty: await harness.db.select().from(userDocumentRebuildStates),
    outbox: await harness.db.select().from(userDocumentOutboxEntries).orderBy(userDocumentOutboxEntries.id),
  };
}
async function failure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected command failure");
}
async function waitForLock(table: string, minimum = 1) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const rows = await harness.sql<{ blocked: boolean }[]>`select count(*) >= ${minimum} as blocked
      from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'
      and application_name = current_setting('application_name') and pid <> pg_backend_pid()
      and query like ${`%${table}%`}`;
    if (rows[0]!.blocked) return;
  }
  throw new Error(`No blocked PostgreSQL query for ${table}`);
}

describe("Employment lifecycle reads through production PostgreSQL", () => {
  test("filters users independently from broad employment keywords before counting and paging", async () => {
    const fixture = await seed();
    const [otherUser] = await harness.db
      .insert(users)
      .values({
        username: "other_account%7",
        name: "Other User",
        userType: UserType.Formal,
      })
      .returning();
    await harness.db.insert(employments).values({ ...fixture.value, userId: otherUser!.id });
    const repository = createAdminApiRepositories(harness.db).employment;
    const search = (userText: string, exactConditions = {}) =>
      repository.searchEmploymentsFuzzyForAdminPaged(
        EmploymentAdminPaginationQueryDtoSchema.parse({
          pageNum: 1,
          pageSize: 1,
          conditions: { fuzzyConditions: { userText }, exactConditions },
        }),
      );
    const holder = await search(" HOLder ");
    expect(holder.total).toBe(1);
    expect(holder.rows.map((row) => row.id)).toEqual([fixture.employment!.id]);
    for (const text of ["ORG", "Position", String(fixture.employment!.id)]) {
      const page = await search(text);
      expect(page.total).toBe(0);
      expect(page.rows).toEqual([]);
    }
    const excluded = await search("holder", { isPrimary: true });
    expect(excluded.total).toBe(0);
    for (const text of ["%", "_"]) {
      const literal = await search(text);
      expect(literal.total).toBe(1);
      expect(literal.rows[0]?.user.username).toBe(otherUser!.username);
    }
    const outsideScope = await repository.searchEmploymentsFuzzyForAdminPaged(
      EmploymentAdminPaginationQueryDtoSchema.parse({
        pageNum: 1,
        pageSize: 1,
        conditions: { fuzzyConditions: { userText: "holder" }, exactConditions: {} },
      }),
      { organizationIds: [] },
    );
    expect(outsideScope.total).toBe(0);
    const broad = await repository.searchEmploymentsFuzzyForAdminPaged({
      pageNum: 1,
      pageSize: 1,
      conditions: { fuzzyConditions: { text: "ORG" }, exactConditions: {} },
    });
    expect(broad.total).toBe(2);
    expect(broad.rows).toHaveLength(1);
    const blank = await search("  ");
    expect(blank.total).toBe(2);
  });

  test.each([
    {
      name: "paused parents",
      organizationStatus: OrganizationStatus.Pause,
      positionStatus: PositionStatus.Pause,
      isDelete: false,
    },
    {
      name: "disabled parents",
      organizationStatus: OrganizationStatus.Disable,
      positionStatus: PositionStatus.Disable,
      isDelete: false,
    },
    {
      name: "soft-deleted parents",
      organizationStatus: OrganizationStatus.Enable,
      positionStatus: PositionStatus.Enable,
      isDelete: true,
    },
  ])("returns $name without hiding lifecycle facts", async ({ organizationStatus, positionStatus, isDelete }) => {
    const fixture = await seed();
    const [organization] = await harness.db
      .update(organizations)
      .set({ status: organizationStatus, isDelete })
      .where(eq(organizations.id, fixture.org.id))
      .returning();
    const [position] = await harness.db
      .update(positions)
      .set({ status: positionStatus, isDelete })
      .where(eq(positions.id, fixture.position.id))
      .returning();

    if (!fixture.employment || !organization || !position) throw new Error("Expected seeded lifecycle records");
    const repository = createAdminApiRepositories(harness.db).employment;
    const context = await repository.getEmploymentLifecycleContextById(fixture.employment.id);

    expect(context).toEqual({ employment: fixture.employment, organization, position });
  });
});

function updateThroughProtocol(
  app: ReturnType<typeof employmentApp>,
  protocol: "REST" | "tRPC",
  id: number,
  data: Record<string, unknown>,
) {
  return app.request(protocol === "REST" ? `/admin/employments/${id}` : "/rpc/update", {
    method: protocol === "REST" ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(protocol === "REST" ? data : { id, data }),
  });
}

async function expectEmploymentDetail(
  app: ReturnType<typeof employmentApp>,
  protocol: "REST" | "tRPC",
  id: number,
  detail: Record<string, unknown>,
) {
  const path =
    protocol === "REST"
      ? `/admin/employments/${id}`
      : `/rpc/detail?input=${encodeURIComponent(JSON.stringify({ id }))}`;
  const response = await app.request(path);
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toMatchObject(protocol === "REST" ? { data: detail } : { result: { data: detail } });
}

describe("Employment period edits through production PostgreSQL UnitOfWork", () => {
  for (const protocol of ["REST", "tRPC"] as const) {
    test.each([
      { input: { startTime: "2026-09-08", endTime: "2026-09-10" }, calculated: EmploymentStatus.Pending },
      { input: { startTime: today, endTime: "2026-09-08" }, calculated: EmploymentStatus.Enable },
      { input: { startTime: "2026-09-01", endTime: today }, calculated: EmploymentStatus.Disable },
    ])(`${protocol} calculates state for every open Employment with period %#`, async ({ input, calculated }) => {
      const fixture = await seed();
      const app = employmentApp(commands(), fixture.user.id);
      for (const status of [EmploymentStatus.Enable, EmploymentStatus.Pending, EmploymentStatus.Pause] as const) {
        const [position] = await harness.db
          .insert(positions)
          .values({
            posCode: `EDIT-${status}`,
            posName: "Date edit",
          })
          .returning();
        const [employment] = await harness.db
          .insert(employments)
          .values({
            ...fixture.value,
            posId: position!.id,
            startTime: status === EmploymentStatus.Pending ? "2026-10-01" : "2026-01-01",
            status,
          })
          .returning();
        const response = await updateThroughProtocol(app, protocol, employment!.id, input);
        expect(response.status).toBe(200);
        const expectedStatus =
          status === EmploymentStatus.Pause && calculated !== EmploymentStatus.Disable
            ? EmploymentStatus.Pause
            : calculated;
        await expectEmploymentDetail(app, protocol, employment!.id, { ...input, status: expectedStatus });
      }
    });

    test(`${protocol} rejects invalid, concealed, and ended period updates before side effects`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      const subject = commands();
      const full = employmentApp(subject, fixture.user.id);
      const outside = employmentApp(subject, fixture.user.id, fixture.org.id + 100);
      await seedAssignments(id, fixture.org.id);
      const before = await facts();
      for (const [input, schemaRejected] of [
        [{ startTime: "2026-02-30" }, true],
        [{ startTime: "2026-09-02", endTime: "2026-09-02" }, false],
        [{ startTime: "2026-09-03", endTime: "2026-09-02" }, false],
        [{ endTime: fixture.employment!.startTime }, false],
      ] as const) {
        const invalid = await updateThroughProtocol(full, protocol, id, { ...input, description: "Do not write" });
        expect(invalid.status).toBe(protocol === "REST" && schemaRejected ? 422 : 400);
      }
      for (const attemptedId of [id, id + 100]) {
        const denied = await updateThroughProtocol(outside, protocol, attemptedId, { endTime: today });
        expect(denied.status).toBe(404);
      }
      const afterDenials = await facts();
      expect(afterDenials).toEqual(before);
      await subject.end.execute({ employmentId: id });
      const ended = await facts();
      const response = await updateThroughProtocol(full, protocol, id, { startTime: null, endTime: null });
      expect(response.status).toBe(409);
      const after = await facts();
      expect(after).toEqual(ended);
    });

    test(`${protocol} clears dates and never restores a responsibility paused by a date edit`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      const [outside] = await harness.db
        .insert(organizations)
        .values({
          orgCode: "OUTSIDE",
          orgName: "Outside HR",
          path: "/OUTSIDE",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Department,
        })
        .returning();
      const children = await seedAssignments(id, outside!.id);
      await harness.db
        .update(assignments)
        .set({ status: AssignmentStatus.Pause })
        .where(eq(assignments.id, children[1]!.id));
      const app = employmentApp(commands(), fixture.user.id, fixture.org.id);
      const future = await updateThroughProtocol(app, protocol, id, { startTime: "2026-09-08", endTime: "2026-09-09" });
      expect(future.status).toBe(200);
      await expectEmploymentDetail(app, protocol, id, { status: EmploymentStatus.Pending });
      const deferred = await facts();
      expect(deferred.assignments.map(({ status }) => status)).toEqual([
        AssignmentStatus.Pause,
        AssignmentStatus.Pause,
      ]);
      expect(deferred.audits.map(({ action, targetId, eventTime }) => ({ action, targetId, eventTime }))).toEqual([
        { action: "admin.organization_responsibility_assignment.pause", targetId: children[0]!.id, eventTime: now },
        { action: "admin.employment.update", targetId: id, eventTime: now },
      ]);
      await expectCompletedUserDocumentSources(harness.db, fixture.user.id, [
        "employment",
        "organization-responsibility-assignment",
      ]);

      const clearEnd = await updateThroughProtocol(app, protocol, id, { endTime: null });
      expect(clearEnd.status).toBe(200);
      await expectEmploymentDetail(app, protocol, id, {
        startTime: "2026-09-08",
        endTime: null,
        status: EmploymentStatus.Pending,
      });
      const clearStart = await updateThroughProtocol(app, protocol, id, { startTime: null });
      expect(clearStart.status).toBe(200);
      await expectEmploymentDetail(app, protocol, id, {
        startTime: null,
        endTime: null,
        status: EmploymentStatus.Enable,
      });
      const after = await facts();
      expect(after.assignments).toEqual(deferred.assignments);
      const noop = await updateThroughProtocol(app, protocol, id, { startTime: null, endTime: null });
      expect(noop.status).toBe(200);
      const result = { changed: false, result: null };
      const payload = await noop.json();
      expect(payload).toMatchObject(protocol === "REST" ? { data: result } : { result: { data: result } });
      const afterNoop = await facts();
      expect(afterNoop).toEqual(after);
    });

    test(`${protocol} HR edit ends an in-scope Employment and uses the submitted start and actual cutoff day`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      await harness.db.update(employments).set({ isPrimary: true }).where(eq(employments.id, id));
      const children = await seedAssignments(id, fixture.org.id);
      await harness.db
        .update(assignments)
        .set({ status: AssignmentStatus.Pause })
        .where(eq(assignments.id, children[1]!.id));
      const app = employmentApp(commands(), fixture.user.id, fixture.org.id);

      const response = await updateThroughProtocol(app, protocol, id, {
        startTime: "2026-08-30",
        endTime: "2026-09-03",
        description: "Final note",
      });
      expect(response.status).toBe(200);
      const payload = await response.json();
      const result = { changed: true, result: null };
      expect(payload).toMatchObject(protocol === "REST" ? { data: result } : { result: { data: result } });
      await expectEmploymentDetail(app, protocol, id, {
        status: EmploymentStatus.Disable,
        isPrimary: false,
        startTime: "2026-08-30",
        endTime: today,
        description: "Final note",
        allowedActions: { editPeriod: { allowed: false } },
      });
      const after = await facts();
      expect(after.assignments.map(({ status, endTime }) => ({ status, endTime }))).toEqual([
        { status: AssignmentStatus.Disable, endTime: now },
        { status: AssignmentStatus.Disable, endTime: now },
      ]);
      expect(after.audits.find(({ action }) => action === "admin.employment.update")).toMatchObject({
        actorUserId: fixture.user.id,
        actorUsername: "actor",
        details: {
          fromStatus: EmploymentStatus.Enable,
          toStatus: EmploymentStatus.Disable,
          previousPeriod: { startTime: fixture.employment!.startTime, endTime: null },
          finalPeriod: { startTime: "2026-08-30", endTime: today },
        },
      });
      await expectCompletedUserDocumentSources(harness.db, fixture.user.id, [
        "employment",
        "organization-responsibility-assignment",
      ]);
    });
  }
  test("A note edit leaves an overdue Enable Employment and its responsibilities unchanged", async () => {
    const fixture = await seed();
    const id = fixture.employment!.id;
    await harness.db.update(employments).set({ endTime: today }).where(eq(employments.id, id));
    await seedAssignments(id, fixture.org.id);
    const app = employmentApp(commands(), fixture.user.id);
    const before = await facts();

    const note = await updateThroughProtocol(app, "REST", id, { description: "Overdue note" });
    expect(note.status).toBe(200);
    await expectEmploymentDetail(app, "REST", id, {
      status: EmploymentStatus.Enable,
      endTime: today,
      description: "Overdue note",
    });
    const after = await facts();
    expect(after.assignments).toEqual(before.assignments);
    expect(after.audits).toMatchObject([{ details: { patch: { description: "Overdue note" } } }]);

    const samePeriod = await updateThroughProtocol(app, "REST", id, { endTime: today });
    expect(samePeriod.status).toBe(200);
    const samePeriodBody = await samePeriod.json();
    expect(samePeriodBody).toMatchObject({ data: { changed: false, result: null } });
    expect(await facts()).toEqual(after);

    const changedPeriod = await updateThroughProtocol(app, "REST", id, { startTime: "2026-09-01", endTime: today });
    expect(changedPeriod.status).toBe(200);
    await expectEmploymentDetail(app, "REST", id, { status: EmploymentStatus.Disable, endTime: today });
  });

  for (const stage of ["cascade", "audit", "outbox"] as const) {
    test(`Period edit rolls back Employment, selected responsibilities and publication on ${stage} failure`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      const children = await seedAssignments(id, fixture.org.id);
      const before = await facts();
      const sentinel = new Error(`period ${stage} failure`);
      const subject = commands((tx) => ({
        ...tx,
        responsibilityParentLifecycle: {
          ...tx.responsibilityParentLifecycle,
          endOpenAssignmentsForEmployment: async (input) => {
            if (stage !== "cascade")
              return await tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment(input);
            await tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
              ...input,
              selectedAssignments: input.selectedAssignments.filter(({ id }) => id === children[0]!.id),
            });
            throw sentinel;
          },
        },
        auditService: {
          ...tx.auditService,
          recordAuditLog: async (input) => {
            await tx.auditService.recordAuditLog(input);
            if (stage === "audit" && input.action === "admin.employment.update") throw sentinel;
          },
        },
        userDocumentInvalidation: {
          ...tx.userDocumentInvalidation,
          recordChanges: async (changes) => {
            await tx.userDocumentInvalidation.recordChanges(changes);
            if (stage === "outbox") throw sentinel;
          },
        },
      }));

      const error = await failure(() =>
        subject.update.execute({ employmentId: id, endTime: today, description: "Abort" }),
      );
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  for (const command of ["pause", "end"] as const) {
    test(`A concurrent period edit rechecks Employment after ${command} commits`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      await seedAssignments(id, fixture.org.id);
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = commands((tx) => ({
        ...tx,
        auditService: {
          ...tx.auditService,
          recordAuditLog: async (input) => {
            entered.resolve();
            await release.promise;
            await tx.auditService.recordAuditLog(input);
          },
        },
      }));
      const firstPending =
        command === "pause"
          ? first.availability.execute({ employmentId: id, command: "pause" })
          : first.end.execute({ employmentId: id });
      await Promise.race([entered.promise, firstPending]);
      const app = employmentApp(commands(), fixture.user.id);
      const secondPending = updateThroughProtocol(app, "REST", id, { startTime: today, endTime: null });
      try {
        await waitForLock("employment");
      } finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      await firstPending;
      const response = await secondPending;
      expect(response.status).toBe(command === "pause" ? 200 : 409);
      await expectEmploymentDetail(
        app,
        "REST",
        id,
        command === "pause"
          ? { status: EmploymentStatus.Pause, startTime: today, endTime: null }
          : { status: EmploymentStatus.Disable, startTime: fixture.employment!.startTime, endTime: today },
      );
      const after = await facts();
      expect(after.assignments.map(({ status }) => status)).toEqual(
        Array(2).fill(command === "pause" ? AssignmentStatus.Pause : AssignmentStatus.Disable),
      );
      expect(after.audits.filter(({ action }) => action === "admin.employment.update")).toHaveLength(
        command === "pause" ? 1 : 0,
      );
    });
  }

  test.each(["expired edit", "initially future edit", "resume"] as const)(
    "%s ends using the instant after acquiring the selected responsibility locks",
    async (command) => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      const children = await seedAssignments(id, fixture.org.id);
      if (command === "resume") {
        await harness.db
          .update(employments)
          .set({ status: EmploymentStatus.Pause, endTime: today })
          .where(eq(employments.id, id));
      }
      await harness.db
        .update(assignments)
        .set({ status: AssignmentStatus.Pause })
        .where(eq(assignments.id, children[0]!.id));
      const locked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let instant = new Date("2026-09-07T15:59:59Z");
      const clock = { nowDate: () => instant };
      const subject = commands(undefined, undefined, undefined, undefined, clock);
      const app = employmentApp(subject, fixture.user.id);
      const otherTransaction = harness.sql.begin(async (tx) => {
        await tx`select id from organization_responsibility_assignment where id = ${children[1]!.id} for update`;
        locked.resolve();
        await release.promise;
        if (command === "resume")
          await tx`update organization_responsibility_assignment set start_time = ${instant.toISOString()} where id = ${children[1]!.id}`;
      });
      await Promise.race([locked.promise, otherTransaction]);
      const pending =
        command === "resume"
          ? app.request(`/admin/employments/${id}/resume`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ expectedAncestorOrgCode: "ORG" }),
            })
          : updateThroughProtocol(
              app,
              "REST",
              id,
              command === "initially future edit"
                ? { startTime: "2026-09-08", endTime: "2026-09-09" }
                : { endTime: today },
            );
      try {
        await waitForLock("organization_responsibility_assignment");
        const lockedEmployment = await failure(() =>
          harness.sql.begin(async (tx) => {
            await tx`select id from employment where id = ${id} for update nowait`;
          }),
        );
        expect(extractPostgresError(lockedEmployment)?.code).toBe("55P03");
        instant = new Date(command === "initially future edit" ? "2026-09-08T16:00:00Z" : "2026-09-07T16:00:00Z");
      } finally {
        release.resolve();
        await Promise.allSettled([otherTransaction, pending]);
      }
      await otherTransaction;
      const response = await pending;
      expect(response.status).toBe(200);
      await expectEmploymentDetail(app, "REST", id, {
        status: EmploymentStatus.Disable,
        endTime: command === "initially future edit" ? "2026-09-09" : "2026-09-08",
      });
      const after = await facts();
      expect(after.assignments.map(({ status, endTime }) => ({ status, endTime }))).toEqual(
        Array(2).fill({ status: AssignmentStatus.Disable, endTime: instant }),
      );
      expect(after.audits.map(({ action, eventTime }) => ({ action, eventTime }))).toEqual([
        ...Array(2).fill({ action: "admin.organization_responsibility_assignment.end", eventTime: instant }),
        { action: command === "resume" ? "admin.employment.resume" : "admin.employment.update", eventTime: instant },
      ]);
    },
  );

  test("Period edit exposes required after-commit failure with the committed facts still readable", async () => {
    const fixture = await seed();
    const id = fixture.employment!.id;
    const subject = commands((tx) => {
      tx.afterCommit.required("employment-edit-required", () => {
        throw new Error("required propagation failure");
      });
      return tx;
    });
    const app = employmentApp(subject, fixture.user.id);
    const response = await updateThroughProtocol(app, "tRPC", id, { startTime: "2026-09-09" });
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toMatchObject({ error: { data: { serviceCode: "ADMIN_MUTATION_COMMITTED" } } });
    await expectEmploymentDetail(app, "tRPC", id, { status: EmploymentStatus.Pending, startTime: "2026-09-09" });
    const after = await facts();
    expect(after.audits).toMatchObject([{ action: "admin.employment.update", details: { changed: true } }]);
    await expectCompletedUserDocumentSources(harness.db, fixture.user.id);
  });
});
describe("Employment mutations through production PostgreSQL UnitOfWork", () => {
  for (const protocol of ["REST", "tRPC"] as const) {
    const createPath = protocol === "REST" ? "/admin/employments" : "/rpc/create";
    const createInput = { username: "holder", orgCode: "ORG", posCode: "POS" };
    const tomorrow = "2026-09-08";

    async function command(
      app: ReturnType<typeof employmentApp>,
      operation: "pause" | "resume" | "end" | "transfer" | "setPrimary",
      id: number,
      data: Record<string, unknown> = {},
    ) {
      const restOperation = operation === "setPrimary" ? "set-primary" : operation;
      const path = protocol === "REST" ? "/admin/employments/" + id + "/" + restOperation : "/rpc/" + operation;
      const body = protocol === "REST" ? data : operation === "transfer" ? { id, data } : { id, ...data };
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }

    test.each([
      { startTime: tomorrow, endTime: null, target: EmploymentStatus.Pending },
      { startTime: today, endTime: tomorrow, target: EmploymentStatus.Enable },
      { startTime: "2026-09-01", endTime: today, target: EmploymentStatus.Disable },
    ])(
      protocol + " pauses an open Employment and resumes it to state $target",
      async ({ startTime, endTime, target }) => {
        const fixture = await seed(false);
        const initiallyPending = target === EmploymentStatus.Pending;
        const [row] = await harness.db
          .insert(employments)
          .values({
            ...fixture.value,
            startTime,
            endTime,
            isPrimary: true,
            status: initiallyPending ? EmploymentStatus.Pending : EmploymentStatus.Enable,
          })
          .returning();
        const id = row!.id;
        if (!initiallyPending) await seedAssignments(id, fixture.org.id);
        const app = employmentApp(commands(), fixture.user.id, fixture.org.id);
        if (initiallyPending) {
          const before = await facts();
          const rejected = await command(app, "resume", id, { expectedAncestorOrgCode: "ORG" });
          expect(rejected.status).toBe(409);
          expect(await facts()).toEqual(before);
        }

        const paused = await command(app, "pause", id);
        expect(paused.status).toBe(200);
        const afterPause = await facts();
        expect(afterPause.employments[0]).toMatchObject({
          status: EmploymentStatus.Pause,
          startTime,
          endTime,
          isPrimary: true,
        });
        expect(afterPause.assignments.every((item) => item.status === AssignmentStatus.Pause)).toBe(true);

        const resumed = await command(app, "resume", id, { expectedAncestorOrgCode: "ORG" });
        expect(resumed.status).toBe(200);
        const after = await facts();
        const ended = target === EmploymentStatus.Disable;
        expect(after.employments[0]).toMatchObject({ status: target, startTime, endTime, isPrimary: !ended });
        expect(
          after.assignments.every(
            (item) => item.status === (ended ? AssignmentStatus.Disable : AssignmentStatus.Pause),
          ),
        ).toBe(true);
        expect(after.audits.find((item) => item.action === "admin.employment.resume")?.details).toMatchObject({
          changed: true,
          fromStatus: EmploymentStatus.Pause,
          toStatus: target,
          previousPeriod: { startTime, endTime },
          finalPeriod: { startTime, endTime },
        });
        if (ended) {
          expect(after.audits).toContainEqual(
            expect.objectContaining({
              details: expect.objectContaining({ cause: { kind: "employment", action: "resume", employmentId: id } }),
            }),
          );
        }
        if (initiallyPending) {
          const end = await command(app, "end", id);
          expect(end.status).toBe(200);
          expect((await facts()).employments[0]).toMatchObject({
            status: EmploymentStatus.Disable,
            startTime: null,
            endTime: today,
            isPrimary: false,
          });
        }
      },
    );

    test(protocol + " transfers a Pending Employment immediately with an independent cutoff date", async () => {
      const fixture = await seed(false);
      const [row] = await harness.db
        .insert(employments)
        .values({
          ...fixture.value,
          startTime: tomorrow,
          endTime: "2026-09-15",
          isPrimary: true,
          status: EmploymentStatus.Pending,
        })
        .returning();
      await harness.db.insert(positions).values({ posCode: "DEST", posName: "Destination" });
      const app = employmentApp(commands(), fixture.user.id);
      const data = { newOrgCode: "ORG", newPosCode: "DEST", isPrimary: false };
      const before = await facts();
      for (const endTime of [today, "2026-09-06"]) {
        const invalid = await command(app, "transfer", row!.id, { ...data, endTime });
        expect(invalid.status).toBe(400);
        expect(await facts()).toEqual(before);
      }
      const transferred = await command(app, "transfer", row!.id, { ...data, endTime: tomorrow });
      expect(transferred.status).toBe(200);
      const after = await facts();
      expect(after.employments).toMatchObject([
        { id: row!.id, status: EmploymentStatus.Disable, startTime: null, endTime: today, isPrimary: false },
        { status: EmploymentStatus.Enable, startTime: today, endTime: tomorrow, isPrimary: false },
      ]);
    });

    test(protocol + " lets HR set an in-scope Pending Primary and includes it in resignation", async () => {
      const fixture = await seed();
      const [position] = await harness.db
        .insert(positions)
        .values({ posCode: "SECOND", posName: "Second" })
        .returning();
      await harness.db.update(employments).set({ isPrimary: true }).where(eq(employments.id, fixture.employment!.id));
      const [pending] = await harness.db
        .insert(employments)
        .values({
          ...fixture.value,
          posId: position!.id,
          startTime: tomorrow,
          status: EmploymentStatus.Pending,
        })
        .returning();
      const subject = commands();
      const app = employmentApp(subject, fixture.user.id, fixture.org.id);
      const result = await command(app, "setPrimary", pending!.id);
      expect(result.status).toBe(200);
      expect((await facts()).employments.map(({ isPrimary }) => isPrimary)).toEqual([false, true]);

      const resigned = await app.request(
        protocol === "REST" ? "/admin/employments/users/holder/resign" : "/rpc/resignUser",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "holder" }),
        },
      );
      expect(resigned.status).toBe(200);
      const after = await facts();
      expect(after.employments).toMatchObject([
        { status: EmploymentStatus.Disable, isPrimary: false, endTime: today },
        { status: EmploymentStatus.Disable, isPrimary: false, startTime: null, endTime: today },
      ]);
      expect(after.users[0]?.status).toBe(UserStatus.Disable);
    });

    test(protocol + " conceals a Pending Employment outside HR scope without writing", async () => {
      const fixture = await seed(false);
      const [row] = await harness.db
        .insert(employments)
        .values({
          ...fixture.value,
          startTime: tomorrow,
          status: EmploymentStatus.Pending,
        })
        .returning();
      const app = employmentApp(commands(), fixture.user.id, fixture.org.id + 100);
      const before = await facts();
      const denied = await command(app, "pause", row!.id);
      expect(denied.status).toBe(404);
      expect(await facts()).toEqual(before);
    });
    const periods = [
      { input: {}, startTime: today, endTime: null, status: EmploymentStatus.Enable },
      { input: { startTime: today }, startTime: today, endTime: null, status: EmploymentStatus.Enable },
      {
        input: { startTime: "2026-09-06", endTime: "2026-09-08" },
        startTime: "2026-09-06",
        endTime: "2026-09-08",
        status: EmploymentStatus.Enable,
      },
      {
        input: { startTime: "2026-09-08", endTime: null },
        startTime: "2026-09-08",
        endTime: null,
        status: EmploymentStatus.Pending,
      },
      {
        input: { startTime: null, endTime: "2026-09-08" },
        startTime: null,
        endTime: "2026-09-08",
        status: EmploymentStatus.Enable,
      },
    ];
    test.each(periods)(
      protocol + " creates and reads the committed period %#",
      async ({ input, startTime, endTime, status }) => {
        const fixture = await seed(false);
        const app = employmentApp(commands(), fixture.user.id);
        const response = await app.request(createPath, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...createInput, ...input }),
        });
        const created = await response.json();
        expect(response.status).toBe(200);
        const [row] = (await facts()).employments;
        const id = row!.id;
        const result = { changed: true, result: { id } };
        expect(created).toMatchObject(protocol === "REST" ? { data: result } : { result: { data: result } });
        const detailPath =
          protocol === "REST"
            ? "/admin/employments/" + id
            : "/rpc/detail?input=" + encodeURIComponent(JSON.stringify({ id }));
        const detailResponse = await app.request(detailPath);
        const detail = await detailResponse.json();
        expect(detailResponse.status).toBe(200);
        const dates = { startTime, endTime, status };
        expect(detail).toMatchObject(protocol === "REST" ? { data: dates } : { result: { data: dates } });
        expect(row).toMatchObject(dates);
      },
    );

    test.each([
      { startTime: "2026-02-30" },
      { startTime: "0000-01-01" },
      { startTime: "2026-09-07T00:00:00Z" },
      { startTime: today, endTime: today },
      { startTime: "2026-09-08", endTime: today },
      { endTime: today },
      { endTime: "2026-09-06" },
    ])(protocol + " rejects an invalid or expired creation period %#", async (period) => {
      const fixture = await seed(false);
      const app = employmentApp(commands(), fixture.user.id);
      const before = await facts();
      const response = await app.request(createPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...createInput, ...period, isPrimary: true }),
      });
      const schemaRejected =
        period.startTime === "2026-02-30" ||
        period.startTime === "0000-01-01" ||
        period.startTime === "2026-09-07T00:00:00Z";
      expect(response.status).toBe(protocol === "REST" && schemaRejected ? 422 : 400);
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  for (const scoped of [false, true]) {
    for (const status of [UserStatus.Enable, UserStatus.Pause, UserStatus.Disable]) {
      test(`New tenures by ${scoped ? "HR" : "Full"} respect User status ${status}`, async () => {
        const fixture = await seed(false);
        await harness.db.update(users).set({ status }).where(eq(users.id, fixture.user.id));
        const authorization = await employmentAuthorization(fixture.org.id, scoped);
        const subject = commands();
        const before = await facts();
        const operation = () =>
          subject.create.execute(
            { username: "holder", orgCode: "ORG", posCode: "POS", isPrimary: true },
            { authorization },
          );
        if (status === UserStatus.Disable) {
          const error = await failure(operation);
          expect(error).toMatchObject({ httpStatus: 409, message: "用户已停用，不能新增任职或转岗" });
          const after = await facts();
          expect(after).toEqual(before);
          expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
        } else {
          const result = await operation();
          expect(result).toEqual({ changed: true, result: { id: expect.any(Number) } });
          const after = await facts();
          expect(after.employments).toMatchObject([
            {
              id: result.result.id,
              status: EmploymentStatus.Enable,
              isPrimary: true,
              endTime: null,
            },
          ]);
          expect(after.users).toEqual(before.users);
          expect(after.audits).toMatchObject([{ action: "admin.employment.create" }]);
          expect(after.dirty).toHaveLength(1);
          await harness.db.insert(positions).values({ posCode: "DEST", posName: "Destination" });
          const transferred = await subject.transfer.execute(
            {
              employmentId: result.result.id,
              newOrgCode: "ORG",
              newPosCode: "DEST",
              isPrimary: true,
            },
            { authorization },
          );
          const afterTransfer = await facts();
          expect(afterTransfer.users).toEqual(before.users);
          expect(afterTransfer.employments).toMatchObject([
            { id: result.result.id, status: EmploymentStatus.Disable, endTime: today, isPrimary: false },
            { id: transferred.result.id, status: EmploymentStatus.Enable, endTime: null, isPrimary: true },
          ]);
        }
      });
    }
    test(`Transfer ${scoped ? "HR" : "Full"} rejects a disabled User without changing any tenure, responsibility, audit or dirty fact`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      await seedAssignments(id, fixture.org.id);
      await harness.db.update(employments).set({ isPrimary: true }).where(eq(employments.id, id));
      await harness.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.id, fixture.user.id));
      const [otherPosition] = await harness.db
        .insert(positions)
        .values([
          { posCode: "OTHER", posName: "Other primary" },
          { posCode: "DEST", posName: "Destination" },
        ])
        .returning();
      await harness.db.insert(employments).values({ ...fixture.value, posId: otherPosition!.id, isPrimary: true });
      const authorization = await employmentAuthorization(fixture.org.id, scoped);
      const subject = commands();
      const before = await facts();
      const error = await failure(() =>
        subject.transfer.execute(
          { employmentId: id, newOrgCode: "ORG", newPosCode: "DEST", isPrimary: true },
          { authorization },
        ),
      );
      expect(error).toMatchObject({ httpStatus: 409, message: "用户已停用，不能新增任职或转岗" });
      const after = await facts();
      expect(after).toEqual(before);
      expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  for (const scoped of [false, true]) {
    test(`${scoped ? "HR" : "Full"} still manages a disabled User's existing Open Employment and cannot reopen it`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      await seedAssignments(id, fixture.org.id);
      await harness.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.id, fixture.user.id));
      const authorization = await employmentAuthorization(fixture.org.id, scoped);
      const subject = commands();
      const edit = await subject.update.execute(
        { employmentId: id, description: "Maintained while disabled" },
        { authorization },
      );
      expect(edit.changed).toBe(true);
      const pause = await subject.availability.execute({ employmentId: id, command: "pause" }, { authorization });
      expect(pause.changed).toBe(true);
      const set = await subject.primary.execute({ employmentId: id, command: "set" }, { authorization });
      expect(set.changed).toBe(true);
      const clear = await subject.primary.execute({ employmentId: id, command: "clear" }, { authorization });
      expect(clear.changed).toBe(true);
      const resume = await subject.availability.execute(
        { employmentId: id, command: "resume", expectedAncestorOrgCode: "ORG" },
        { authorization },
      );
      expect(resume.changed).toBe(true);
      const ended = await subject.end.execute({ employmentId: id }, { authorization });
      expect(ended.changed).toBe(true);
      const before = await facts();
      expect(before.users[0]!.status).toBe(UserStatus.Disable);
      expect(before.employments[0]).toMatchObject({
        description: "Maintained while disabled",
        status: EmploymentStatus.Disable,
        endTime: today,
        isPrimary: false,
      });
      expect(before.assignments.every((row) => row.status === AssignmentStatus.Disable)).toBe(true);
      const error = await failure(() =>
        subject.availability.execute(
          { employmentId: id, command: "resume", expectedAncestorOrgCode: "ORG" },
          { authorization },
        ),
      );
      expect(error).toBeInstanceOf(EmploymentNotEditableError);
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  for (const protocol of ["REST", "tRPC"] as const) {
    test(`${protocol} ends, transfers and resigns using the same Beijing date and retains original dates in audit`, async () => {
      const fixture = await seed();
      const original = fixture.employment;
      const [secondPosition] = await harness.db
        .insert(positions)
        .values([
          { posCode: "SECOND", posName: "Second" },
          { posCode: "DEST", posName: "Destination" },
        ])
        .returning();
      if (!original || !secondPosition) throw new Error("Missing Employment fixture");
      const [second] = await harness.db
        .insert(employments)
        .values({ ...fixture.value, posId: secondPosition.id, isPrimary: true, startTime: today })
        .returning();
      if (!second) throw new Error("Missing second Employment fixture");
      await harness.db
        .update(employments)
        .set({ startTime: "2026-10-01", endTime: "2026-10-31" })
        .where(eq(employments.id, original.id));
      await seedAssignments(original.id, fixture.org.id);
      const subject = commands(undefined, undefined, undefined, fixture.user.subjectIdentifier);
      const app = employmentApp(subject, fixture.user.id);
      const detailPath =
        protocol === "REST"
          ? `/admin/employments/${original.id}`
          : `/rpc/detail?input=${encodeURIComponent(JSON.stringify({ id: original.id }))}`;
      async function expectPeriod(startTime: string | null, endTime: string | null, status: EmploymentStatus) {
        const response = await app.request(detailPath);
        const detail = await response.json();
        expect(response.status).toBe(200);
        const dates = { startTime, endTime, status };
        expect(detail).toMatchObject(protocol === "REST" ? { data: dates } : { result: { data: dates } });
      }
      await expectPeriod("2026-10-01", "2026-10-31", EmploymentStatus.Enable);
      const transferInput = { newOrgCode: "ORG", newPosCode: "DEST", isPrimary: true };
      const actions = [
        {
          rest: { path: `/admin/employments/${original.id}/end` },
          rpc: { path: "/rpc/end", input: { id: original.id } },
          result: null,
        },
        {
          rest: { path: `/admin/employments/${second.id}/transfer`, input: transferInput },
          rpc: { path: "/rpc/transfer", input: { id: second.id, data: transferInput } },
          result: { id: expect.any(Number) },
        },
        {
          rest: { path: "/admin/employments/users/holder/resign" },
          rpc: { path: "/rpc/resignUser", input: { username: "holder" } },
          result: null,
        },
      ];
      for (const action of actions) {
        const { path, input } = protocol === "REST" ? action.rest : action.rpc;
        const response = await app.request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const result = await response.json();
        expect(response.status).toBe(200);
        const mutation = { changed: true, result: action.result };
        expect(result).toMatchObject(protocol === "REST" ? { data: mutation } : { result: { data: mutation } });
        if (action !== actions[2]) {
          const [user] = await harness.db.select().from(users).where(eq(users.id, fixture.user.id));
          expect(user?.status).toBe(UserStatus.Enable);
          expect(subject.revokeUserSessions).not.toHaveBeenCalled();
        }
        if (action === actions[1]) {
          const [created] = await harness.db
            .select()
            .from(employments)
            .where(eq(employments.status, EmploymentStatus.Enable));
          expect(created).toMatchObject({ startTime: today, endTime: null, isPrimary: true });
        }
      }
      await expectPeriod(null, today, EmploymentStatus.Disable);
      const after = await facts();
      expect(after.users[0]?.status).toBe(UserStatus.Disable);
      expect(subject.revokeUserSessions).toHaveBeenCalledTimes(1);
      expect(
        after.employments.map(({ status, isPrimary, startTime, endTime }) => ({
          status,
          isPrimary,
          startTime,
          endTime,
        })),
      ).toEqual(
        Array.from({ length: 3 }, () => ({
          status: EmploymentStatus.Disable,
          isPrimary: false,
          startTime: null,
          endTime: today,
        })),
      );
      const finalPeriod = { startTime: null, endTime: today };
      expect(after.audits.map(({ action, eventTime }) => ({ action, eventTime }))).toEqual(
        [
          "admin.organization_responsibility_assignment.end",
          "admin.organization_responsibility_assignment.end",
          "admin.employment.end",
          "admin.employment.transfer",
          "admin.employment.resign_user",
        ].map((action) => ({ action, eventTime: now })),
      );
      expect(after.audits.find((entry) => entry.action === "admin.employment.end")?.details).toMatchObject({
        previousPeriod: { startTime: "2026-10-01", endTime: "2026-10-31" },
        finalPeriod,
      });
      expect(after.audits.find((entry) => entry.action === "admin.employment.transfer")?.details).toMatchObject({
        previousPeriod: { startTime: today, endTime: null },
        finalPeriod,
      });
      expect(after.audits.find((entry) => entry.action === "admin.employment.resign_user")?.details).toMatchObject({
        endedEmployments: [{ previousPeriod: { startTime: today, endTime: null }, finalPeriod }],
      });
      expect(after.assignments.map(({ status, endTime }) => ({ status, endTime }))).toEqual([
        { status: AssignmentStatus.Disable, endTime: now },
        { status: AssignmentStatus.Disable, endTime: now },
      ]);
      await expectCompletedUserDocumentSources(harness.db, fixture.user.id, [
        "employment",
        "organization-responsibility-assignment",
        "user",
      ]);
    });

    test(`${protocol} uses the current User status for stale create/transfer requests and returns a stable rejection`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      await harness.db.insert(positions).values({ posCode: "DEST", posName: "Destination" });
      const subject = commands();
      const app = employmentApp(subject, fixture.user.id);
      const visible = await app.request(`/admin/employments/${fixture.employment!.id}`);
      const visibleBody = await visible.json();
      expect(visibleBody).toMatchObject({ data: { allowedActions: { transfer: { allowed: true } } } });
      await harness.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.id, fixture.user.id));
      const before = await facts();
      for (const command of ["create", "transfer"] as const) {
        const body =
          command === "create"
            ? { username: "holder", orgCode: "ORG", posCode: "DEST", isPrimary: true }
            : { newOrgCode: "ORG", newPosCode: "DEST", isPrimary: true };
        const path =
          protocol === "REST"
            ? command === "create"
              ? "/admin/employments"
              : `/admin/employments/${fixture.employment!.id}/transfer`
            : `/rpc/${command}`;
        const response = await app.request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            protocol === "tRPC" && command === "transfer" ? { id: fixture.employment!.id, data: body } : body,
          ),
        });
        const result = await response.json();
        expect(response.status).toBe(409);
        expect(result).toMatchObject(
          protocol === "REST"
            ? { code: "EMPLOYMENT.USER_DISABLED" }
            : { error: { data: { code: "CONFLICT", serviceCode: "EMPLOYMENT.USER_DISABLED" } } },
        );
        const after = await facts();
        expect(after).toEqual(before);
      }
      const refreshed = await app.request(`/admin/employments/${fixture.employment!.id}`);
      const refreshedBody = await refreshed.json();
      expect(refreshedBody).toMatchObject({
        data: {
          allowedActions: {
            transfer: { allowed: false, reason: "USER_DISABLED" },
            pause: { allowed: true },
            end: { allowed: true },
            setPrimary: { allowed: true },
          },
        },
      });
    });
  }

  test("creates an enabled Employment with both dates unset when the Admin command clears the start date", async () => {
    const fixture = await seed(false);
    const app = employmentApp(commands(), fixture.user.id);
    const response = await app.request("/admin/employments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "holder", orgCode: "ORG", posCode: "POS", startTime: null }),
    });
    expect(response.status).toBe(200);
    const created = await facts();
    expect(created.employments).toMatchObject([{ status: EmploymentStatus.Enable, startTime: null, endTime: null }]);
  });

  test("Primary no-ops audit intent without rewriting Employment or registering dirty", async () => {
    const fixture = await seed();
    const subject = commands();
    const id = fixture.employment!.id;
    const before = await facts();
    const clear = await subject.primary.execute({ command: "clear", employmentId: id });
    expect(clear).toEqual({ changed: false, result: null });
    const cleared = await facts();
    expect(cleared.employments).toEqual(before.employments);
    expect(cleared.dirty).toEqual([]);
    expect(cleared.audits).toMatchObject([{ details: { changed: false } }]);
    const set = await subject.primary.execute({ command: "set", employmentId: id });
    expect(set).toEqual({ changed: true, result: null });
    const established = await facts();
    const repeated = await subject.primary.execute({ command: "set", employmentId: id });
    expect(repeated).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after.employments).toEqual(established.employments);
    expect(after.dirty).toEqual(established.dirty);
    expect(after.audits.at(-1)!.details).toMatchObject({ changed: false });
    expect(subject.enqueueRebuildJobs).toHaveBeenCalledTimes(1);
  });

  for (const command of ["primary", "transfer"] as const) {
    test(`${command} waits for the lower Primary before locking its higher URL target`, async () => {
      const fixture = await seed();
      const lowId = fixture.employment!.id;
      await harness.db.update(employments).set({ isPrimary: true }).where(eq(employments.id, lowId));
      const [otherPosition, destination] = await harness.db
        .insert(positions)
        .values([
          { posCode: "OTHER", posName: "Other" },
          { posCode: "DEST", posName: "Destination" },
        ])
        .returning();
      const [higher] = await harness.db
        .insert(employments)
        .values({ ...fixture.value, posId: otherPosition!.id })
        .returning();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const blocker = harness.sql.begin(async (tx) => {
        await tx`select id from employment where id = ${lowId} for update`;
        entered.resolve();
        await release.promise;
      });
      await Promise.race([entered.promise, blocker]);
      const subject = commands();
      const pending =
        command === "primary"
          ? subject.primary.execute({ command: "set", employmentId: higher!.id })
          : subject.transfer.execute({
              employmentId: higher!.id,
              newOrgCode: "ORG",
              newPosCode: "DEST",
              isPrimary: true,
            });
      let opposite: Promise<unknown> | undefined;
      try {
        await waitForLock("employment");
        // If the command locks its URL target first, this real NOWAIT fails.
        await harness.sql.begin(async (tx) => {
          await tx`select id from employment where id = ${higher!.id} for update nowait`;
          await tx`select id from "user" where id = ${fixture.user.id} for update nowait`;
          await tx`select id from organization where id = ${fixture.org.id} for update nowait`;
          await tx`select id from position where id in (${otherPosition!.id}, ${destination!.id}) for update nowait`;
        });
        opposite = commands().primary.execute({ command: "clear", employmentId: lowId });
        await waitForLock("employment", 2);
      } finally {
        release.resolve();
        await Promise.allSettled([blocker, pending, ...(opposite ? [opposite] : [])]);
      }
      const result = await pending;
      await opposite;
      expect(result.changed).toBe(true);
      const after = await facts();
      expect(after.employments.find((row) => row.id === lowId)!.isPrimary).toBe(false);
      expect(after.employments.filter((row) => row.isPrimary)).toHaveLength(1);
      expect(after.audits.filter((row) => row.targetType === "employment")).toHaveLength(2);
    });
  }

  test("Primary Create and Transfer share ascending locks for their existing multirow write sets", async () => {
    const fixture = await seed();
    const lowId = fixture.employment!.id;
    await harness.db.update(employments).set({ isPrimary: true }).where(eq(employments.id, lowId));
    const [higherPosition] = await harness.db
      .insert(positions)
      .values([
        { posCode: "HIGH", posName: "Higher existing Primary" },
        { posCode: "CREATE", posName: "Created position" },
        { posCode: "TRANSFER", posName: "Transferred position" },
      ])
      .returning();
    const [higher] = await harness.db
      .insert(employments)
      .values({
        ...fixture.value,
        posId: higherPosition!.id,
        isPrimary: true,
      })
      .returning();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocker = harness.sql.begin(async (tx) => {
      await tx`select id from employment where id = ${lowId} for update`;
      entered.resolve();
      await release.promise;
    });
    await Promise.race([entered.promise, blocker]);
    const subject = commands();
    const createPending = subject.create.execute({
      username: "holder",
      orgCode: "ORG",
      posCode: "CREATE",
      isPrimary: true,
    });
    let transferPending: ReturnType<typeof subject.transfer.execute> | undefined;
    try {
      await waitForLock("employment");
      transferPending = subject.transfer.execute({
        employmentId: higher!.id,
        newOrgCode: "ORG",
        newPosCode: "TRANSFER",
        isPrimary: true,
      });
      await waitForLock("employment", 2);
      // Both commands selected the same two existing rows. Neither may prelock the higher row.
      await harness.sql.begin(async (tx) => {
        await tx`select id from employment where id = ${higher!.id} for update nowait`;
        await tx`select id from "user" where id = ${fixture.user.id} for update nowait`;
        await tx`select id from organization where id = ${fixture.org.id} for update nowait`;
        await tx`select id from position where id = ${higherPosition!.id} for update nowait`;
      });
    } finally {
      release.resolve();
      await Promise.allSettled([blocker, createPending, ...(transferPending ? [transferPending] : [])]);
    }
    const created = await createPending;
    const transferred = await transferPending;
    expect(created).toEqual({ changed: true, result: { id: expect.any(Number) } });
    expect(transferred).toEqual({ changed: true, result: { id: expect.any(Number) } });
    const after = await facts();
    expect(after.employments.find((row) => row.id === lowId)).toMatchObject({
      isPrimary: false,
      status: EmploymentStatus.Enable,
      endTime: null,
    });
    expect(after.employments.find((row) => row.id === higher!.id)).toMatchObject({
      isPrimary: false,
      status: EmploymentStatus.Disable,
      endTime: today,
    });
    // Newly inserted rows were absent from both selected write sets; no phantom protection is claimed.
    for (const id of [created.result.id, transferred!.result.id]) {
      expect(after.employments.find((row) => row.id === id)).toMatchObject({
        isPrimary: true,
        status: EmploymentStatus.Enable,
        startTime: today,
        endTime: null,
      });
    }
    expect(after.employments).toHaveLength(4);
    expect(after.audits.map((row) => row.action).sort()).toEqual([
      "admin.employment.create",
      "admin.employment.transfer",
    ]);
    expect(after.audits.map((row) => row.details)).toMatchObject([{ changed: true }, { changed: true }]);
    await expectCompletedUserDocumentSources(harness.db, after.dirty[0]!.userId);
    expect(subject.enqueueRebuildJobs).toHaveBeenCalledTimes(2);
  });

  test.each([false, true])(
    "Primary Create uses the day after waiting for an existing Primary (expired: %s)",
    async (expired) => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      await harness.db.update(employments).set({ isPrimary: true }).where(eq(employments.id, id));
      await harness.db.insert(positions).values({ posCode: "NEW", posName: "New Position" });
      const before = await facts();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let instant = new Date("2026-09-07T15:59:59Z");
      const subject = commands(undefined, undefined, undefined, undefined, { nowDate: () => instant });
      const app = employmentApp(subject, fixture.user.id);
      const blocker = harness.sql.begin(async (tx) => {
        await tx`select id from employment where id = ${id} for update`;
        entered.resolve();
        await release.promise;
      });
      await Promise.race([entered.promise, blocker]);
      const pending = app.request("/admin/employments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "holder",
          orgCode: "ORG",
          posCode: "NEW",
          isPrimary: true,
          ...(expired ? { endTime: "2026-09-08" } : {}),
        }),
      });
      try {
        await waitForLock("employment");
        instant = new Date("2026-09-07T16:00:00Z");
      } finally {
        release.resolve();
        await Promise.allSettled([blocker, pending]);
      }
      await blocker;
      const response = await pending;
      const after = await facts();
      if (expired) {
        expect(response.status).toBe(400);
        expect(after).toEqual(before);
      } else {
        expect(response.status).toBe(200);
        expect(after.employments).toMatchObject([
          { id, isPrimary: false },
          { isPrimary: true, status: EmploymentStatus.Enable, startTime: "2026-09-08" },
        ]);
        expect(after.audits).toMatchObject([{ action: "admin.employment.create", eventTime: instant }]);
      }
    },
  );

  for (const command of ["set", "clear"] as const) {
    test(`Primary ${command} audit failure leaves no committed business, audit or dirty changes`, async () => {
      const fixture = await seed();
      const sentinel = new Error("primary audit failure");
      const subject = commands((tx) => ({
        ...tx,
        auditService: {
          ...tx.auditService,
          recordAuditLog: async (input) => {
            await tx.auditService.recordAuditLog(input);
            throw sentinel;
          },
        },
      }));
      const before = await facts();
      const error = await failure(() => subject.primary.execute({ command, employmentId: fixture.employment!.id }));
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  for (const stage of ["audit", "dirty", "unique"] as const) {
    test(`Transfer ${stage} failure rolls back old tenure, responsibilities, prior Primary, audit and dirty`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      const [primaryPosition, destination] = await harness.db
        .insert(positions)
        .values([
          { posCode: "PRIMARY", posName: "Primary" },
          { posCode: "DEST", posName: "Destination" },
        ])
        .returning();
      await harness.db.insert(employments).values({ ...fixture.value, posId: primaryPosition!.id, isPrimary: true });
      const sentinel = new Error(`transfer ${stage}`);
      let contenderId: number | undefined;
      const subject = commands((tx) => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: {
                ...tx.auditService,
                recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  if (input.action === "admin.employment.transfer") throw sentinel;
                },
              },
            }
          : {}),
        ...(stage === "dirty"
          ? {
              userDocumentInvalidation: {
                recordChanges: async (changes) => {
                  await tx.userDocumentInvalidation.recordChanges(changes);
                  throw sentinel;
                },
              },
            }
          : {}),
        ...(stage === "unique"
          ? {
              repositories: {
                ...tx.repositories,
                employment: {
                  ...tx.repositories.employment,
                  createEmploymentRecord: async (input) => {
                    // The competing committed insert happens after the production duplicate precheck.
                    const [contender] = await harness.db
                      .insert(employments)
                      .values({ ...fixture.value, posId: destination!.id })
                      .returning();
                    contenderId = contender!.id;
                    return await tx.repositories.employment.createEmploymentRecord(input);
                  },
                },
              },
            }
          : {}),
      }));
      const before = await facts();
      const error = await failure(() =>
        subject.transfer.execute({
          employmentId: fixture.employment!.id,
          newOrgCode: "ORG",
          newPosCode: "DEST",
          isPrimary: true,
        }),
      );
      if (stage === "unique") expect(error).toBeInstanceOf(EmploymentAlreadyExistsError);
      else expect(error).toBe(sentinel);
      const after = await facts();
      expect({ ...after, employments: after.employments.filter((row) => row.id !== contenderId) }).toEqual(before);
      expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  test("Transfer retains already ended responsibility time and cannot rewrite the old tenure on retry", async () => {
    const fixture = await seed();
    const children = await seedAssignments(fixture.employment!.id, fixture.org.id);
    const historicalEnd = new Date("2026-07-01T00:00:00Z");
    await harness.db
      .update(assignments)
      .set({ status: AssignmentStatus.Disable, endTime: historicalEnd })
      .where(eq(assignments.id, children[0]!.id));
    await harness.db.insert(positions).values({ posCode: "DEST", posName: "Destination" });
    const subject = commands();
    const input = {
      employmentId: fixture.employment!.id,
      newOrgCode: "ORG",
      newPosCode: "DEST",
      isPrimary: true,
    };
    const result = await subject.transfer.execute(input);
    expect(result).toEqual({ changed: true, result: { id: expect.any(Number) } });
    const after = await facts();
    expect(after.employments.find((row) => row.id === input.employmentId)).toMatchObject({
      status: EmploymentStatus.Disable,
      isPrimary: false,
      endTime: today,
    });
    expect(after.employments.find((row) => row.id === result.result.id)).toMatchObject({
      status: EmploymentStatus.Enable,
      isPrimary: true,
      startTime: today,
      endTime: null,
    });
    expect(after.assignments.map((row) => row.endTime)).toEqual([historicalEnd, now]);
    expect(after.audits).toHaveLength(2);
    await expectCompletedUserDocumentSources(harness.db, after.dirty[0]!.userId);
    const retry = await failure(() => subject.transfer.execute(input));
    expect(retry).toBeInstanceOf(EmploymentNotEditableError);
    const afterRetry = await facts();
    expect(afterRetry).toEqual(after);
  });

  for (const secondCommand of ["pause", "profile", "end"] as const) {
    test(`a competing ${secondCommand} observes the committed Employment state`, async () => {
      const fixture = await seed();
      const id = fixture.employment!.id;
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = commands((tx) => ({
        ...tx,
        auditService: {
          ...tx.auditService,
          recordAuditLog: async (input) => {
            entered.resolve();
            await release.promise;
            await tx.auditService.recordAuditLog(input);
          },
        },
      }));
      const firstPending = first.availability.execute({ employmentId: id, command: "pause" });
      await Promise.race([entered.promise, firstPending]);
      const second = commands();
      const secondPending =
        secondCommand === "profile"
          ? second.update.execute({ employmentId: id, description: "Saved" })
          : secondCommand === "end"
            ? second.end.execute({ employmentId: id })
            : second.availability.execute({ employmentId: id, command: "pause" });
      try {
        await waitForLock("employment");
        await harness.sql.begin(async (tx) => {
          await tx`select id from "user" where id = ${fixture.user.id} for update nowait`;
          await tx`select id from organization where id = ${fixture.org.id} for update nowait`;
          await tx`select id from position where id = ${fixture.position.id} for update nowait`;
        });
      } finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const firstResult = await firstPending;
      expect(firstResult).toEqual({ changed: true, result: null });
      const secondResult = await secondPending;
      expect(secondResult).toEqual({ changed: secondCommand !== "pause", result: null });
      const after = await facts();
      expect(after.employments[0]).toMatchObject({
        status: secondCommand === "end" ? EmploymentStatus.Disable : EmploymentStatus.Pause,
        description: secondCommand === "profile" ? "Saved" : null,
      });
      expect(after.audits).toHaveLength(2);
      expect(after.audits[1]!.details).toMatchObject({ changed: secondCommand !== "pause" });
      await expectCompletedUserDocumentSources(harness.db, after.dirty[0]!.userId);
    });
  }

  test("description no-op is silent; lifecycle no-ops audit intent without rewriting time or dirty", async () => {
    const fixture = await seed();
    const id = fixture.employment!.id;
    const subject = commands();
    const initial = await facts();
    const empty = await failure(() => subject.update.execute({ employmentId: id }));
    expect(empty).toBeInstanceOf(BadRequestError);
    const edit = await subject.update.execute({ employmentId: id, description: null });
    expect(edit).toEqual({ changed: false, result: null });
    const afterEdit = await facts();
    expect(afterEdit).toEqual(initial);
    const resume = await subject.availability.execute({
      employmentId: id,
      command: "resume",
      expectedAncestorOrgCode: "ORG",
    });
    expect(resume).toEqual({ changed: false, result: null });
    const resumed = await facts();
    expect(resumed.dirty).toEqual([]);
    expect(resumed.audits).toMatchObject([{ details: { changed: false } }]);
    await subject.end.execute({ employmentId: id });
    const ended = await facts();
    const repeated = await subject.end.execute({ employmentId: id });
    expect(repeated).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after.employments).toEqual(ended.employments);
    expect(after.employments[0]!.endTime).toEqual(today);
    expect(after.dirty).toEqual(ended.dirty);
    expect(after.audits.at(-1)!.details).toMatchObject({ changed: false });
    for (const command of ["resume", "pause"] as const) {
      const error = await failure(() =>
        subject.availability.execute({ employmentId: id, command, expectedAncestorOrgCode: "ORG" }),
      );
      expect(error).toBeInstanceOf(EmploymentNotEditableError);
    }
    const afterInvalid = await facts();
    expect(afterInvalid).toEqual(after);
  });

  for (const stage of ["cascade", "audit", "dirty"] as const) {
    test(`${stage} failure rolls back Employment, selected children, audit and dirty`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      const sentinel = new Error(`injected ${stage}`);
      const subject = commands((tx) => {
        if (stage === "cascade") {
          return {
            ...tx,
            responsibilityParentLifecycle: {
              ...tx.responsibilityParentLifecycle,
              endOpenAssignmentsForEmployment: async (input) => {
                await tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment(input);
                throw sentinel;
              },
            },
          };
        }
        if (stage === "audit") {
          return {
            ...tx,
            auditService: {
              ...tx.auditService,
              recordAuditLog: async (input) => {
                await tx.auditService.recordAuditLog(input);
                throw sentinel;
              },
            },
          };
        }
        return {
          ...tx,
          userDocumentInvalidation: {
            recordChanges: async (changes) => {
              await tx.userDocumentInvalidation.recordChanges(changes);
              throw sentinel;
            },
          },
        };
      });
      const before = await facts();
      const error = await failure(() => subject.end.execute({ employmentId: fixture.employment!.id }));
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  for (const parentCommand of ["end", "transfer", "resign"] as const) {
    test(`${parentCommand} locks Employment then children in ID order before any parent write and rechecks a direct End winner`, async () => {
      const fixture = await seed();
      const children = await seedAssignments(fixture.employment!.id, fixture.org.id);
      let secondEmploymentId: number | undefined;
      if (parentCommand === "resign") {
        const [position] = await harness.db
          .insert(positions)
          .values({ posCode: "SECOND", posName: "Second" })
          .returning();
        const [second] = await harness.db
          .insert(employments)
          .values({ ...fixture.value, posId: position!.id })
          .returning();
        secondEmploymentId = second!.id;
        await harness.db
          .update(assignments)
          .set({ employmentId: secondEmploymentId })
          .where(eq(assignments.id, children[1]!.id));
      }
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const direct = commands((tx) => ({
        ...tx,
        auditService: {
          ...tx.auditService,
          recordAuditLog: async (input) => {
            entered.resolve();
            await release.promise;
            await tx.auditService.recordAuditLog(input);
          },
        },
      }));
      const directPending = direct.assignment.execute({ command: "end", id: children[1]!.id });
      await Promise.race([entered.promise, directPending]);
      let parentWriteEntered = false;
      const parent = commands((tx) => ({
        ...tx,
        repositories: {
          ...tx.repositories,
          employment: {
            ...tx.repositories.employment,
            updateEmploymentRecord: async (...args) => {
              parentWriteEntered = true;
              return await tx.repositories.employment.updateEmploymentRecord(...args);
            },
          },
        },
      }));
      await harness.db.insert(positions).values({ posCode: "DEST", posName: "Destination" });
      const parentPending =
        parentCommand === "resign"
          ? parent.resign.execute({ username: "holder" })
          : parentCommand === "end"
            ? parent.end.execute({ employmentId: fixture.employment!.id })
            : parent.transfer.execute({
                employmentId: fixture.employment!.id,
                newOrgCode: "ORG",
                newPosCode: "DEST",
                isPrimary: false,
              });
      try {
        await waitForLock("organization_responsibility_assignment");
        for (const query of [
          () =>
            harness.sql.begin(async (tx) => {
              await tx`select id from employment where id = ${fixture.employment!.id} for update nowait`;
            }),
          () =>
            harness.sql.begin(async (tx) => {
              await tx`select id from organization_responsibility_assignment where id = ${children[0]!.id} for update nowait`;
            }),
        ]) {
          const blocked = await failure(query);
          expect(extractPostgresError(blocked)?.code).toBe("55P03");
        }
        if (secondEmploymentId !== undefined) {
          const blocked = await failure(() =>
            harness.sql.begin(async (tx) => {
              await tx`select id from employment where id = ${secondEmploymentId} for update nowait`;
            }),
          );
          expect(extractPostgresError(blocked)?.code).toBe("55P03");
        }
        expect(parentWriteEntered).toBe(false);
        const visible = await facts();
        expect(visible.employments[0]!.status).toBe(EmploymentStatus.Enable);
        expect(visible.assignments.map((row) => row.status)).toEqual([
          AssignmentStatus.Enable,
          AssignmentStatus.Enable,
        ]);
      } finally {
        release.resolve();
        await Promise.allSettled([directPending, parentPending]);
      }
      await directPending;
      const result = await parentPending;
      expect(result).toEqual({
        changed: true,
        result: parentCommand === "transfer" ? { id: expect.any(Number) } : null,
      });
      const after = await facts();
      expect(after.assignments.map((row) => ({ status: row.status, endTime: row.endTime }))).toEqual([
        { status: AssignmentStatus.Disable, endTime: now },
        { status: AssignmentStatus.Disable, endTime: now },
      ]);
      expect(
        after.audits
          .filter((row) => row.targetType === "organization_responsibility_assignment")
          .map((row) => row.targetId)
          .sort(),
      ).toEqual(children.map((row) => row.id));
      expect(after.audits).toHaveLength(3);
      const parentAction =
        parentCommand === "resign" ? "admin.employment.resign_user" : `admin.employment.${parentCommand}`;
      expect(after.audits.find(({ action }) => action === parentAction)?.eventTime).toEqual(now);
      expect(
        after.audits.find(
          ({ targetType, targetId }) =>
            targetType === "organization_responsibility_assignment" && targetId === children[0]!.id,
        )?.eventTime,
      ).toEqual(now);
      await expectCompletedUserDocumentSources(harness.db, after.dirty[0]!.userId);
    });
  }

  for (const scoped of [false, true]) {
    test(`Resignation ${scoped ? "HR" : "Full"} retry audits no-op and retries best-effort Sessions without rewriting facts`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      const authorization = scoped
        ? await createAdminAuthorizationPolicy({
            logger: { warn: mock() },
            hrAdministrationScopeResolver: {
              resolveForActor: async () => ({
                rootOrganizationIds: [fixture.org.id],
                organizationIds: [fixture.org.id],
              }),
            },
          }).getUserAuthorization({ userId: 99, username: "hr", roles: ["iam:hr-admin"] })
        : undefined;
      const subject = commands(undefined, undefined, new Error("session failure"), fixture.user.subjectIdentifier);
      const first = await subject.resign.execute({ username: "holder" }, { authorization });
      expect(first).toEqual({ changed: true, result: null });
      const committed = await facts();
      expect(committed.users[0]!.status).toBe(UserStatus.Disable);
      expect(committed.employments[0]).toMatchObject({
        status: EmploymentStatus.Disable,
        endTime: today,
        isPrimary: false,
      });
      const enqueuedBeforeRetry = subject.enqueueRebuildJobs.mock.calls.length;
      const retry = await subject.resign.execute({ username: "holder" }, { authorization });
      expect(retry).toEqual({ changed: false, result: null });
      const repeated = await facts();
      expect({ ...repeated, audits: committed.audits }).toEqual(committed);
      expect(repeated.audits.at(-1)).toMatchObject({
        action: "admin.employment.resign_user",
        details: { changed: false },
      });
      expect(subject.revokeUserSessions).toHaveBeenCalledTimes(2);
      expect(subject.enqueueRebuildJobs).toHaveBeenCalledTimes(enqueuedBeforeRetry);
    });
  }

  for (const stage of ["audit", "dirty"] as const) {
    test(`Resignation ${stage} failure rolls back User, every tenure, responsibilities, audit and dirty`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      const sentinel = new Error(stage);
      const subject = commands((tx) => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: {
                ...tx.auditService,
                recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  if (input.action === "admin.employment.resign_user") throw sentinel;
                },
              },
            }
          : {
              userDocumentInvalidation: {
                recordChanges: async (changes) => {
                  await tx.userDocumentInvalidation.recordChanges(changes);
                  throw sentinel;
                },
              },
            }),
      }));
      const before = await facts();
      const error = await failure(() => subject.resign.execute({ username: "holder" }));
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(subject.revokeUserSessions).not.toHaveBeenCalled();
      expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  test("Resignation reports a required afterCommit failure as committed while retaining the business result", async () => {
    await seed();
    const subject = commands((tx) => {
      tx.afterCommit.required("resignation-required", () => {
        throw new Error("required failure");
      });
      return tx;
    });
    const error = await failure(() => subject.resign.execute({ username: "holder" }));
    expect(error).toBeInstanceOf(AdminMutationCommittedError);
    const after = await facts();
    expect(after.users[0]!.status).toBe(UserStatus.Disable);
    expect(after.employments[0]!.endTime).toEqual(today);
    expect(after.audits).toMatchObject([{ action: "admin.employment.resign_user", details: { changed: true } }]);
    await expectCompletedUserDocumentSources(harness.db, after.dirty[0]!.userId);
  });

  test("Resignation reports confirmed lifecycle failure after committing", async () => {
    await seed();
    const subject = commands(undefined, new Error("prepare repair failed"));
    const error = await failure(() => subject.resign.execute({ username: "holder" }));
    expect(error).toBeInstanceOf(AdminMutationCommittedError);
    const after = await facts();
    expect(after.users[0]!.status).toBe(UserStatus.Disable);
    expect(after.audits).toMatchObject([{ action: "admin.employment.resign_user", details: { changed: true } }]);
    await expectCompletedUserDocumentSources(harness.db, after.dirty[0]!.userId);
  });

  test("Resignation waits for User lock before locking its durable transition intent or Employments", async () => {
    const fixture = await seed();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocker = harness.sql.begin(async (tx) => {
      await tx`select id from "user" where id = ${fixture.user.id} for update`;
      entered.resolve();
      await release.promise;
    });
    await Promise.race([entered.promise, blocker]);
    const subject = commands();
    const pending = subject.resign.execute({ username: "holder" });
    try {
      await waitForLock('"user"');
      await harness.sql.begin(async (tx) => {
        await tx`select id from employment where id = ${fixture.employment!.id} for update nowait`;
      });
      const intents = await harness.db.select().from(subjectAccessTransitions);
      expect(intents).toMatchObject([{ status: "pending" }]);
      await harness.sql.begin(async (tx) => {
        await tx`select id from subject_access_transition where id = ${intents[0]!.id} for update nowait`;
      });
    } finally {
      release.resolve();
      await Promise.allSettled([blocker, pending]);
    }
    const result = await pending;
    expect(result).toEqual({ changed: true, result: null });
  });

  test("Resignation locks User then all Employments in ascending order before writing", async () => {
    const fixture = await seed();
    const [position] = await harness.db.insert(positions).values({ posCode: "SECOND", posName: "Second" }).returning();
    const [higher] = await harness.db
      .insert(employments)
      .values({ ...fixture.value, posId: position!.id, status: EmploymentStatus.Pause })
      .returning();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocker = harness.sql.begin(async (tx) => {
      await tx`select id from employment where id = ${fixture.employment!.id} for update`;
      entered.resolve();
      await release.promise;
    });
    await Promise.race([entered.promise, blocker]);
    const subject = commands();
    const pending = subject.resign.execute({ username: "holder" });
    try {
      await waitForLock("employment");
      const userBlocked = await failure(() =>
        harness.sql.begin(async (tx) => {
          await tx`select id from "user" where id = ${fixture.user.id} for update nowait`;
        }),
      );
      expect(extractPostgresError(userBlocked)?.code).toBe("55P03");
      await harness.sql.begin(async (tx) => {
        await tx`select id from employment where id = ${higher!.id} for update nowait`;
      });
      const visible = await facts();
      expect(visible.users[0]!.status).toBe(UserStatus.Enable);
      expect(visible.employments.map((row) => row.endTime)).toEqual([null, null]);
    } finally {
      release.resolve();
      await Promise.allSettled([blocker, pending]);
    }
    const result = await pending;
    expect(result).toEqual({ changed: true, result: null });
    const after = await facts();
    expect(after.employments.map((row) => ({ status: row.status, endTime: row.endTime }))).toEqual([
      { status: EmploymentStatus.Disable, endTime: today },
      { status: EmploymentStatus.Disable, endTime: today },
    ]);
  });

  test("real concurrent create conflict passes both prechecks and maps wrapped unique violation", async () => {
    const fixture = await seed(false);
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const subject = commands((tx) => ({
      ...tx,
      repositories: {
        ...tx.repositories,
        employment: {
          ...tx.repositories.employment,
          getOpenEmploymentByUserOrgPosId: async (...args) => {
            const found = await tx.repositories.employment.getOpenEmploymentByUserOrgPosId(...args);
            if (++arrived === 2) gate.resolve();
            await gate.promise;
            return found;
          },
        },
      },
    }));
    const input = { username: "holder", orgCode: "ORG", posCode: "POS", startTime: "2026-09-08" };
    const results = await Promise.allSettled([subject.create.execute(input), subject.create.execute(input)]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((row) => row.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(EmploymentAlreadyExistsError);
    const after = await facts();
    expect(after.employments).toMatchObject([{ status: EmploymentStatus.Pending }]);
    expect(after.audits).toMatchObject([{ details: { changed: true } }]);
    await expectCompletedUserDocumentSources(harness.db, after.dirty[0]!.userId);
    const raw = await failure(() => harness.db.insert(employments).values(fixture.value));
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)).toEqual({
      code: "23505",
      constraint: "employment_active_relationship_unique_idx",
    });
  });
});
