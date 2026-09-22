import type { AdminApiTxPorts } from "@admin-api/composition/tx";
import type { TransactionContext } from "@iam/api-core/uow";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { randomUUID } from "node:crypto";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createEmploymentAdapter } from "@admin-api/routes/admin/employment/employment.adapter";
import { createEmploymentRoute } from "@admin-api/routes/admin/employment/employment.index";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createManagePrimaryEmploymentUseCase } from "@admin-api/use-cases/employment/manage-primary-employment/manage-primary-employment.use-case";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { createTransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import { createManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import { BadRequestError } from "@iam/api-core/errors";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createSubjectAccessBarrier, createSubjectAccessLifecycle } from "@iam/api-core/subject-access";
import { createInMemorySubjectAccessStore } from "@iam/api-core/subject-access/testing";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  OrganizationResponsibilityAssignmentStatus as AssignmentStatus,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
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
  userProfileDirty,
  users,
} from "@iam/db/schema";
import { EmploymentAlreadyExistsError, EmploymentNotEditableError } from "@iam/domain/employment";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { withTestFullOrganizationResponsibilityAuthorization } from "../helpers/admin-authorization";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: AdminApiPostgresTestHarness;
const now = new Date("2026-09-07T00:00:00Z");
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
  decorate: (tx: TransactionContext<AdminApiTxPorts>) => AdminApiTxPorts = tx => tx,
  prepareRepairError?: Error,
  revocationError?: Error,
  initialSubjectIdentifier?: string,
) {
  const enqueueRebuildJobs = mock(async () => ({ enqueued: 1, jobIds: ["employment-job"] }));
  const clock = { nowDate: () => now };
  const uow = mapUnitOfWork(
    createAdminApiUnitOfWork({
      db: harness.db,
      clock,
      logger: { error: mock(() => undefined), warn: mock(() => undefined) },
      userProfileJobProducer: { enqueueRebuildJobs },
    }),
    decorate,
  );
  const lifecycle = mapUnitOfWork(uow, tx => ({
    employmentStore: tx.repositories.employment,
    organizationReader: tx.repositories.organization,
    auditLogWriter: tx.auditService,
    responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
    userProfileInvalidation: tx.userProfileInvalidation,
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
    if (revocationError)
      throw revocationError;
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
      uow: mapUnitOfWork(uow, tx => ({
        employmentStore: tx.repositories.employment,
        userStore: tx.repositories.user,
        subjectAccessMutation: tx.subjectAccessMutation,
        auditLogWriter: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
    enqueueRebuildJobs,
    primary: createManagePrimaryEmploymentUseCase({
      uow: mapUnitOfWork(uow, tx => ({
        employmentStore: tx.repositories.employment,
        auditLogWriter: tx.auditService,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
    transfer: createTransferEmploymentUseCase({
      clock,
      uow: mapUnitOfWork(uow, tx => ({
        employmentStore: tx.repositories.employment,
        organizationReader: tx.repositories.organization,
        positionReader: tx.repositories.position,
        userReader: tx.repositories.user,
        auditLogWriter: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
    availability: createChangeEmploymentAvailabilityUseCase({ uow: lifecycle }),
    end: createEndEmploymentUseCase({ clock, uow: lifecycle }),
    create: createCreateEmploymentUseCase({
      clock,
      uow: mapUnitOfWork(uow, tx => ({
        employmentStore: tx.repositories.employment,
        organizationReader: tx.repositories.organization,
        positionReader: tx.repositories.position,
        userReader: tx.repositories.user,
        auditLogWriter: tx.auditService,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
    profile: createEmploymentService({
      employmentRepository: repositories.employment,
      roleRepository: repositories.role,
      privilegeRepository: repositories.privilege,
      roleAssignmentResolver: { resolveEffectiveRoles: async () => new Map() },
      uow: mapUnitOfWork(uow, tx => ({
        employmentRepository: tx.repositories.employment,
        auditService: tx.auditService,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
    assignment: withTestFullOrganizationResponsibilityAuthorization(
      createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
        clock,
        uow: mapUnitOfWork(uow, tx => ({
          assignmentStore: tx.repositories.organizationResponsibility,
          auditLogWriter: tx.auditService,
          userProfileInvalidation: tx.userProfileInvalidation,
        })),
      }),
    ),
  };
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
  await harness.db
    .insert(organizationClosures)
    .values({ ancestorId: org!.id, descendantId: org!.id, depth: 0 });
  const [position] = await harness.db
    .insert(positions)
    .values({ posCode: "POS", posName: "Position" })
    .returning();
  const value = {
    userId: user!.id,
    orgId: org!.id,
    posId: position!.id,
    startTime: new Date("2026-01-01T00:00:00Z"),
    status: EmploymentStatus.Enable,
  };
  const employment = withEmployment
    ? (await harness.db.insert(employments).values(value).returning())[0]!
    : undefined;
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
    dirty: await harness.db.select().from(userProfileDirty),
  };
}
async function failure(operation: () => Promise<unknown>) {
  try {
    await operation();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected command failure");
}
async function waitForLock(table: string, minimum = 1) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const rows = await harness.sql<{ blocked: boolean }[]>`select count(*) >= ${minimum} as blocked
      from pg_stat_activity where wait_event_type = 'Lock'
      and application_name = current_setting('application_name') and pid <> pg_backend_pid()
      and query like ${`%${table}%`}`;
    if (rows[0]!.blocked)
      return;
  }
  throw new Error(`No blocked PostgreSQL query for ${table}`);
}

describe("Employment mutations through production PostgreSQL UnitOfWork", () => {
  for (const scoped of [false, true]) {
    for (const status of [UserStatus.Enable, UserStatus.Pause, UserStatus.Disable]) {
      test(`New tenures by ${scoped ? "HR" : "Full"} respect User status ${status}`, async () => {
        const fixture = await seed(false);
        await harness.db.update(users).set({ status }).where(eq(users.id, fixture.user.id));
        const authorization = await employmentAuthorization(fixture.org.id, scoped);
        const subject = commands();
        const before = await facts();
        const operation = () => subject.create.execute(
          { username: "holder", orgCode: "ORG", posCode: "POS", isPrimary: true },
          { authorization },
        );
        if (status === UserStatus.Disable) {
          const error = await failure(operation);
          expect(error).toMatchObject({ httpStatus: 409, message: "用户已停用，不能新增任职或转岗" });
          const after = await facts();
          expect(after).toEqual(before);
          expect(subject.enqueueRebuildJobs).not.toHaveBeenCalled();
        }
        else {
          const result = await operation();
          expect(result).toEqual({ changed: true, result: { id: expect.any(Number) } });
          const after = await facts();
          expect(after.employments).toMatchObject([{
            id: result.result.id,
            status: EmploymentStatus.Enable,
            isPrimary: true,
            endTime: null,
          }]);
          expect(after.users).toEqual(before.users);
          expect(after.audits).toMatchObject([{ action: "admin.employment.create" }]);
          expect(after.dirty).toHaveLength(1);
          await harness.db.insert(positions).values({ posCode: "DEST", posName: "Destination" });
          const transferred = await subject.transfer.execute({
            employmentId: result.result.id,
            newOrgCode: "ORG",
            newPosCode: "DEST",
            isPrimary: true,
          }, { authorization });
          const afterTransfer = await facts();
          expect(afterTransfer.users).toEqual(before.users);
          expect(afterTransfer.employments).toMatchObject([
            { id: result.result.id, status: EmploymentStatus.Disable, endTime: now, isPrimary: false },
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
      const [otherPosition] = await harness.db.insert(positions).values([
        { posCode: "OTHER", posName: "Other primary" },
        { posCode: "DEST", posName: "Destination" },
      ]).returning();
      await harness.db.insert(employments).values({ ...fixture.value, posId: otherPosition!.id, isPrimary: true });
      const authorization = await employmentAuthorization(fixture.org.id, scoped);
      const subject = commands();
      const before = await facts();
      const error = await failure(() => subject.transfer.execute({ employmentId: id, newOrgCode: "ORG", newPosCode: "DEST", isPrimary: true }, { authorization }));
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
      const edit = await subject.profile.updateEmployment(id, { description: "Maintained while disabled" }, undefined, authorization);
      expect(edit.changed).toBe(true);
      const pause = await subject.availability.execute({ employmentId: id, command: "pause" }, { authorization });
      expect(pause.changed).toBe(true);
      const set = await subject.primary.execute({ employmentId: id, command: "set" }, { authorization });
      expect(set.changed).toBe(true);
      const clear = await subject.primary.execute({ employmentId: id, command: "clear" }, { authorization });
      expect(clear.changed).toBe(true);
      const resume = await subject.availability.execute({ employmentId: id, command: "resume", expectedAncestorOrgCode: "ORG" }, { authorization });
      expect(resume.changed).toBe(true);
      const ended = await subject.end.execute({ employmentId: id }, { authorization });
      expect(ended.changed).toBe(true);
      const before = await facts();
      expect(before.users[0]!.status).toBe(UserStatus.Disable);
      expect(before.employments[0]).toMatchObject({ description: "Maintained while disabled", status: EmploymentStatus.Disable, endTime: now, isPrimary: false });
      expect(before.assignments.every(row => row.status === AssignmentStatus.Disable)).toBe(true);
      const error = await failure(() => subject.availability.execute({ employmentId: id, command: "resume", expectedAncestorOrgCode: "ORG" }, { authorization }));
      expect(error).toBeInstanceOf(EmploymentNotEditableError);
      const after = await facts();
      expect(after).toEqual(before);
    });
  }

  for (const protocol of ["REST", "tRPC"] as const) {
    test(`${protocol} uses the current User status for stale create/transfer requests and returns a stable rejection`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      await harness.db.insert(positions).values({ posCode: "DEST", posName: "Destination" });
      const subject = commands();
      const adapter = createEmploymentAdapter({
        employmentService: subject.profile,
        createEmployment: subject.create,
        transferEmployment: subject.transfer,
        changeEmploymentAvailability: subject.availability,
        endEmployment: subject.end,
        managePrimaryEmployment: subject.primary,
        resignUser: subject.resign,
      });
      const app = new Hono<{ Variables: {
        adminAuthorizationPolicy: ReturnType<typeof createAdminAuthorizationPolicy>;
        userId: number;
        username: string;
        userDetailDto: { roles: string[] };
      }; }>();
      app.use("*", async (context, next) => {
        context.set("userId", fixture.user.id);
        context.set("username", "actor");
        context.set("userDetailDto", { roles: ["iam:admin"] });
        context.set("adminAuthorizationPolicy", createAdminAuthorizationPolicy({
          logger: { warn: mock() },
          hrAdministrationScopeResolver: { resolveForActor: async () => null },
        }));
        await next();
      });
      app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
      app.route("/admin", createEmploymentRoute(adapter));
      app.all("/rpc/*", context => fetchRequestHandler({ endpoint: "/rpc", req: context.req.raw, router: adapter.employmentAdminRouter, createContext: () => ({ hono: context }) }));
      const visible = await app.request(`/admin/employments/${fixture.employment!.id}`);
      const visibleBody = await visible.json();
      expect(visibleBody).toMatchObject({ data: { allowedActions: { transfer: { allowed: true } } } });
      await harness.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.id, fixture.user.id));
      const before = await facts();
      for (const command of ["create", "transfer"] as const) {
        const body = command === "create"
          ? { username: "holder", orgCode: "ORG", posCode: "DEST", isPrimary: true }
          : { newOrgCode: "ORG", newPosCode: "DEST", isPrimary: true };
        const path = protocol === "REST"
          ? command === "create" ? "/admin/employments" : `/admin/employments/${fixture.employment!.id}/transfer`
          : `/rpc/${command}`;
        const response = await app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(protocol === "tRPC" && command === "transfer" ? { id: fixture.employment!.id, data: body } : body) });
        const result = await response.json();
        expect(response.status).toBe(409);
        expect(result).toMatchObject(protocol === "REST"
          ? { code: "EMPLOYMENT.USER_DISABLED" }
          : { error: { data: { code: "CONFLICT", serviceCode: "EMPLOYMENT.USER_DISABLED" } } });
        const after = await facts();
        expect(after).toEqual(before);
      }
      const refreshed = await app.request(`/admin/employments/${fixture.employment!.id}`);
      const refreshedBody = await refreshed.json();
      expect(refreshedBody).toMatchObject({ data: { allowedActions: {
        transfer: { allowed: false, reason: "USER_DISABLED" },
        pause: { allowed: true },
        end: { allowed: true },
        setPrimary: { allowed: true },
      } } });
    });
  }

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
      const pending
        = command === "primary"
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
      }
      finally {
        release.resolve();
        await Promise.allSettled([blocker, pending, ...(opposite ? [opposite] : [])]);
      }
      const result = await pending;
      await opposite;
      expect(result.changed).toBe(true);
      const after = await facts();
      expect(after.employments.find(row => row.id === lowId)!.isPrimary).toBe(false);
      expect(after.employments.filter(row => row.isPrimary)).toHaveLength(1);
      expect(after.audits.filter(row => row.targetType === "employment")).toHaveLength(2);
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
    }
    finally {
      release.resolve();
      await Promise.allSettled([blocker, createPending, ...(transferPending ? [transferPending] : [])]);
    }
    const created = await createPending;
    const transferred = await transferPending;
    expect(created).toEqual({ changed: true, result: { id: expect.any(Number) } });
    expect(transferred).toEqual({ changed: true, result: { id: expect.any(Number) } });
    const after = await facts();
    expect(after.employments.find(row => row.id === lowId)).toMatchObject({
      isPrimary: false,
      status: EmploymentStatus.Enable,
      endTime: null,
    });
    expect(after.employments.find(row => row.id === higher!.id)).toMatchObject({
      isPrimary: false,
      status: EmploymentStatus.Disable,
      endTime: now,
    });
    // Newly inserted rows were absent from both selected write sets; no phantom protection is claimed.
    for (const id of [created.result.id, transferred!.result.id]) {
      expect(after.employments.find(row => row.id === id)).toMatchObject({
        isPrimary: true,
        status: EmploymentStatus.Enable,
        startTime: now,
        endTime: null,
      });
    }
    expect(after.employments).toHaveLength(4);
    expect(after.audits.map(row => row.action).sort()).toEqual([
      "admin.employment.create",
      "admin.employment.transfer",
    ]);
    expect(after.audits.map(row => row.details)).toMatchObject([{ changed: true }, { changed: true }]);
    expect(after.dirty[0]!.dirtyVersion).toBe("2");
    expect(subject.enqueueRebuildJobs).toHaveBeenCalledTimes(2);
  });

  for (const command of ["set", "clear"] as const) {
    test(`Primary ${command} audit failure leaves no committed business, audit or dirty changes`, async () => {
      const fixture = await seed();
      const sentinel = new Error("primary audit failure");
      const subject = commands(tx => ({
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
      const error = await failure(() =>
        subject.primary.execute({ command, employmentId: fixture.employment!.id }),
      );
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
      await harness.db
        .insert(employments)
        .values({ ...fixture.value, posId: primaryPosition!.id, isPrimary: true });
      const sentinel = new Error(`transfer ${stage}`);
      let contenderId: number | undefined;
      const subject = commands(tx => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: {
                ...tx.auditService,
                recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  if (input.action === "admin.employment.transfer")
                    throw sentinel;
                },
              },
            }
          : {}),
        ...(stage === "dirty"
          ? {
              userProfileInvalidation: {
                recordChanges: async (changes) => {
                  await tx.userProfileInvalidation.recordChanges(changes);
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
      if (stage === "unique")
        expect(error).toBeInstanceOf(EmploymentAlreadyExistsError);
      else expect(error).toBe(sentinel);
      const after = await facts();
      expect({ ...after, employments: after.employments.filter(row => row.id !== contenderId) }).toEqual(
        before,
      );
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
    expect(after.employments.find(row => row.id === input.employmentId)).toMatchObject({
      status: EmploymentStatus.Disable,
      isPrimary: false,
      endTime: now,
    });
    expect(after.employments.find(row => row.id === result.result.id)).toMatchObject({
      status: EmploymentStatus.Enable,
      isPrimary: true,
      startTime: now,
      endTime: null,
    });
    expect(after.assignments.map(row => row.endTime)).toEqual([historicalEnd, now]);
    expect(after.audits).toHaveLength(2);
    expect(after.dirty[0]!.dirtyVersion).toBe("1");
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
      const first = commands(tx => ({
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
      const secondPending
        = secondCommand === "profile"
          ? second.profile.updateEmployment(id, { description: "Saved" })
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
      }
      finally {
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
      expect(after.dirty[0]!.dirtyVersion).toBe(secondCommand === "pause" ? "1" : "2");
    });
  }

  test("description no-op is silent; lifecycle no-ops audit intent without rewriting time or dirty", async () => {
    const fixture = await seed();
    const id = fixture.employment!.id;
    const subject = commands();
    const initial = await facts();
    const empty = await failure(() => subject.profile.updateEmployment(id, {}));
    expect(empty).toBeInstanceOf(BadRequestError);
    const edit = await subject.profile.updateEmployment(id, { description: null });
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
    expect(after.employments[0]!.endTime).toEqual(now);
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

  for (const stage of ["audit", "dirty"] as const) {
    test(`${stage} failure rolls back Employment, selected children, audit and dirty`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      const sentinel = new Error(`injected ${stage}`);
      const subject = commands(tx => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: {
                ...tx.auditService,
                recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  throw sentinel;
                },
              },
            }
          : {
              userProfileInvalidation: {
                recordChanges: async (changes) => {
                  await tx.userProfileInvalidation.recordChanges(changes);
                  throw sentinel;
                },
              },
            }),
      }));
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
      const direct = commands(tx => ({
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
      const parent = commands(tx => ({
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
      const parentPending
        = parentCommand === "resign"
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
        expect(visible.assignments.map(row => row.status)).toEqual([
          AssignmentStatus.Enable,
          AssignmentStatus.Enable,
        ]);
      }
      finally {
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
      expect(after.assignments.map(row => ({ status: row.status, endTime: row.endTime }))).toEqual([
        { status: AssignmentStatus.Disable, endTime: now },
        { status: AssignmentStatus.Disable, endTime: now },
      ]);
      expect(
        after.audits
          .filter(row => row.targetType === "organization_responsibility_assignment")
          .map(row => row.targetId)
          .sort(),
      ).toEqual(children.map(row => row.id));
      expect(after.audits).toHaveLength(3);
      expect(after.dirty[0]!.dirtyVersion).toBe("2");
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
      const subject = commands(
        undefined,
        undefined,
        new Error("session failure"),
        fixture.user.subjectIdentifier,
      );
      const first = await subject.resign.execute({ username: "holder" }, { authorization });
      expect(first).toEqual({ changed: true, result: null });
      const committed = await facts();
      expect(committed.users[0]!.status).toBe(UserStatus.Disable);
      expect(committed.employments[0]).toMatchObject({
        status: EmploymentStatus.Disable,
        endTime: now,
        isPrimary: false,
      });
      const retry = await subject.resign.execute({ username: "holder" }, { authorization });
      expect(retry).toEqual({ changed: false, result: null });
      const repeated = await facts();
      expect({ ...repeated, audits: committed.audits }).toEqual(committed);
      expect(repeated.audits.at(-1)).toMatchObject({
        action: "admin.employment.resign_user",
        details: { changed: false },
      });
      expect(subject.revokeUserSessions).toHaveBeenCalledTimes(2);
      expect(subject.enqueueRebuildJobs).toHaveBeenCalledTimes(1);
    });
  }

  for (const stage of ["audit", "dirty"] as const) {
    test(`Resignation ${stage} failure rolls back User, every tenure, responsibilities, audit and dirty`, async () => {
      const fixture = await seed();
      await seedAssignments(fixture.employment!.id, fixture.org.id);
      const sentinel = new Error(stage);
      const subject = commands(tx => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: {
                ...tx.auditService,
                recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  if (input.action === "admin.employment.resign_user")
                    throw sentinel;
                },
              },
            }
          : {
              userProfileInvalidation: {
                recordChanges: async (changes) => {
                  await tx.userProfileInvalidation.recordChanges(changes);
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
    expect(after.employments[0]!.endTime).toEqual(now);
    expect(after.audits).toMatchObject([
      { action: "admin.employment.resign_user", details: { changed: true } },
    ]);
    expect(after.dirty[0]!.dirtyVersion).toBe("1");
  });

  test("Resignation reports confirmed lifecycle failure after committing", async () => {
    await seed();
    const subject = commands(undefined, new Error("prepare repair failed"));
    const error = await failure(() => subject.resign.execute({ username: "holder" }));
    expect(error).toBeInstanceOf(AdminMutationCommittedError);
    const after = await facts();
    expect(after.users[0]!.status).toBe(UserStatus.Disable);
    expect(after.audits).toMatchObject([
      { action: "admin.employment.resign_user", details: { changed: true } },
    ]);
    expect(after.dirty[0]!.dirtyVersion).toBe("1");
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
      await waitForLock("\"user\"");
      await harness.sql.begin(async (tx) => {
        await tx`select id from employment where id = ${fixture.employment!.id} for update nowait`;
      });
      const intents = await harness.db.select().from(subjectAccessTransitions);
      expect(intents).toMatchObject([{ status: "pending" }]);
      await harness.sql.begin(async (tx) => {
        await tx`select id from subject_access_transition where id = ${intents[0]!.id} for update nowait`;
      });
    }
    finally {
      release.resolve();
      await Promise.allSettled([blocker, pending]);
    }
    const result = await pending;
    expect(result).toEqual({ changed: true, result: null });
  });

  test("Resignation locks User then all Employments in ascending order before writing", async () => {
    const fixture = await seed();
    const [position] = await harness.db
      .insert(positions)
      .values({ posCode: "SECOND", posName: "Second" })
      .returning();
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
      expect(visible.employments.map(row => row.endTime)).toEqual([null, null]);
    }
    finally {
      release.resolve();
      await Promise.allSettled([blocker, pending]);
    }
    const result = await pending;
    expect(result).toEqual({ changed: true, result: null });
    const after = await facts();
    expect(after.employments.map(row => ({ status: row.status, endTime: row.endTime }))).toEqual([
      { status: EmploymentStatus.Disable, endTime: now },
      { status: EmploymentStatus.Disable, endTime: now },
    ]);
  });

  test("real concurrent create conflict passes both prechecks and maps wrapped unique violation", async () => {
    const fixture = await seed(false);
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const subject = commands(tx => ({
      ...tx,
      repositories: {
        ...tx.repositories,
        employment: {
          ...tx.repositories.employment,
          getOpenEmploymentByUserOrgPosId: async (...args) => {
            const found = await tx.repositories.employment.getOpenEmploymentByUserOrgPosId(...args);
            if (++arrived === 2)
              gate.resolve();
            await gate.promise;
            return found;
          },
        },
      },
    }));
    const input = { username: "holder", orgCode: "ORG", posCode: "POS" };
    const results = await Promise.allSettled([subject.create.execute(input), subject.create.execute(input)]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(row => row.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(EmploymentAlreadyExistsError);
    const after = await facts();
    expect(after.employments).toHaveLength(1);
    expect(after.audits).toMatchObject([{ details: { changed: true } }]);
    expect(after.dirty[0]!.dirtyVersion).toBe("1");
    const raw = await failure(() => harness.db.insert(employments).values(fixture.value));
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)).toEqual({
      code: "23505",
      constraint: "employment_active_relationship_unique_idx",
    });
  });
});
