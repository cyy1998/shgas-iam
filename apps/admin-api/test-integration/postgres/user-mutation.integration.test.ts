import type { AdminUserTransactionPorts } from "@admin-api/services/user/user.port";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { createUserRoute } from "@admin-api/routes/admin/user/user.index";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createUserService } from "@admin-api/services/user/user.service";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { BadRequestError } from "@iam/api-core/errors";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import { createSubjectAccessBarrier, createSubjectAccessLifecycle, createSubjectAccessOperations } from "@iam/api-core/subject-access";
import { createInMemorySubjectAccessStore } from "@iam/api-core/subject-access/testing";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { createTRPCContext } from "@iam/api-core/trpc";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { ApiErrorCode, EmploymentStatus, OrganizationLevel, OrganizationType, PrivilegeDelegationStatus, UserStatus, UserType } from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import { auditLogs, delegationDetails, employments, organizations, positions, privilegeDelegations, privileges, subjectAccessTransitions, userProfileDirty, users } from "@iam/db/schema";
import { UserHasOpenEmploymentError, UsernameAlreadyExistsError, UserNotFoundError } from "@iam/domain/user";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware } from "../helpers/admin-authorization";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.db.delete(delegationDetails);
  await harness.db.delete(privilegeDelegations);
  await harness.db.delete(privileges);
});
afterAll(async () => {
  await harness?.close();
});

function createCommand(
  decorate: (tx: AdminUserTransactionPorts) => AdminUserTransactionPorts = tx => tx,
  prepareRepairError?: Error,
  store = createInMemorySubjectAccessStore(),
) {
  const repositories = createAdminApiRepositories(harness.db);
  const warn = mock(() => undefined);
  const enqueueRebuildJobs = mock(async () => ({ enqueued: 1, jobIds: ["user-job"] }));
  const revokeUserSessions = mock(async () => {
    return { userSessionsTerminated: 0, clientSessionsTerminated: 0, results: [], unfinished: [] };
  });
  const clock = { nowDate: () => new Date("2026-09-07T00:00:00Z") };
  const random = { uuid: randomUUID, password: mock(() => "Random123!") };
  const barrier = createSubjectAccessBarrier({ clock, random, store });
  const uow = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn },
    clock,
    userProfileJobProducer: { enqueueRebuildJobs },
  });
  return {
    employment: createCreateEmploymentUseCase({ clock, uow: mapUnitOfWork(uow, tx => ({
      employmentStore: tx.repositories.employment,
      userReader: tx.repositories.user,
      organizationReader: tx.repositories.organization,
      positionReader: tx.repositories.position,
      auditLogWriter: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })) }),
    endEmployment: createEndEmploymentUseCase({ clock, uow: mapUnitOfWork(uow, tx => ({
      employmentStore: tx.repositories.employment,
      organizationReader: tx.repositories.organization,
      auditLogWriter: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
    })) }),
    barrier,
    store,
    enqueueRebuildJobs,
    revokeUserSessions,
    warn,
    random,
    service: createUserService({
      userRepository: repositories.user,
      employmentRepository: repositories.employment,
      roleAssignmentResolver: { resolveEffectiveRoles: async () => new Map() },
      roleRepository: repositories.role,
      privilegeRepository: { getPrivilegesByRoleIds: async () => [] },
      passwordHasher: { hashPassword: async password => `hash:${password}` },
      random,
      sessionRevocation: { revokeUserSessions },
      subjectAccessLifecycle: createSubjectAccessLifecycle({
        barrier: prepareRepairError
          ? { ...barrier, prepareRepair: async () => {
              throw prepareRepairError;
            } }
          : barrier,
        logger: { warn },
        random,
        transitionIntent: createSubjectAccessTransitionRepository(harness.db),
      }),
      uow: mapUnitOfWork(uow, tx => decorate({
        userRepository: tx.repositories.user,
        auditService: tx.auditService,
        subjectAccessMutation: tx.subjectAccessMutation,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
  };
}

type UserWriteProtocol = "REST" | "tRPC";
const userWriteProtocols: UserWriteProtocol[] = ["REST", "tRPC"];

function createUserWriteApp(command = createCommand()) {
  const adapter = createUserAdapter({ userService: command.service, random: command.random });
  const app = new Hono();
  app.onError(createErrorHandler({ info() {}, warn() {}, error() {} }));
  addTestAdminAuthorizationMiddleware(app);
  app.route("/admin", createUserRoute(adapter));
  app.all("/rpc/*", c => fetchRequestHandler({
    endpoint: "/rpc",
    req: c.req.raw,
    router: adapter.userAdminRouter,
    createContext: () => createTRPCContext({ honoCtx: c }),
  }));
  return { app, command };
}

async function requestUserCreate(
  app: Hono,
  protocol: UserWriteProtocol,
  input: Record<string, unknown>,
) {
  return await app.request(protocol === "REST" ? "/admin/users" : "/rpc/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

async function seedUser(status = UserStatus.Enable, isDelete = false) {
  const [user] = await harness.db.insert(users).values({
    username: "user",
    name: "Original",
    userType: UserType.Formal,
    status,
    isDelete,
    password: "old-hash",
    mobile: "13800000000",
  }).returning();
  return user!;
}

async function seedDelegation(
  userId: number,
  side: "delegator" | "delegatee",
  status: PrivilegeDelegationStatus,
  period: "current" | "future" | "past",
  isDelete = false,
) {
  const [other] = await harness.db.insert(users).values({ username: "other", name: "Other" }).returning();
  const [organization] = await harness.db.insert(organizations).values({
    orgCode: "ORG",
    orgName: "Organization",
    path: "/ORG",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Company,
  }).returning();
  const [privilege] = await harness.db.insert(privileges).values({ privilegeCode: "read", privilegeName: "Read" }).returning();
  const periods = {
    current: ["2000-01-01", "2099-01-01"],
    future: ["2099-01-01", "2100-01-01"],
    past: ["2000-01-01", "2001-01-01"],
  } as const;
  const [delegation] = await harness.db.insert(privilegeDelegations).values({
    delegatorUserId: side === "delegator" ? userId : other!.id,
    delegateeUserId: side === "delegatee" ? userId : other!.id,
    organizationScopeId: organization!.id,
    status,
    isDelete,
    startTime: new Date(periods[period][0]),
    endTime: new Date(periods[period][1]),
  }).returning();
  await harness.db.insert(delegationDetails).values({ delegationId: delegation!.id, privilegeId: privilege!.id });
  return delegation!;
}

async function facts() {
  return {
    users: await harness.db.select().from(users).orderBy(users.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    dirty: await harness.db.select().from(userProfileDirty).orderBy(userProfileDirty.userId),
  };
}

async function deletionFacts() {
  return {
    ...await facts(),
    delegations: await harness.db.select().from(privilegeDelegations).orderBy(privilegeDelegations.id),
    delegationDetails: await harness.db.select().from(delegationDetails).orderBy(delegationDetails.delegationId),
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

function stableStore(subjectIdentifier: string, state: "enabled" | "disabled" = "enabled") {
  return createInMemorySubjectAccessStore([{
    version: 1,
    subjectIdentifier,
    state,
    transitionId: randomUUID(),
    updatedAt: "2026-09-07T00:00:00Z",
  }]);
}

async function transitions() {
  return await harness.db.select().from(subjectAccessTransitions).orderBy(subjectAccessTransitions.createTime);
}

async function waitForUserLock() {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const rows = await harness.sql<{ blocked: boolean }[]>`select exists (
      select 1 from pg_stat_activity where wait_event_type = 'Lock'
      and query like '%"user"%' and application_name = current_setting('application_name')
      and pid <> pg_backend_pid()
    ) as blocked`;
    if (rows[0]!.blocked)
      return;
  }
  throw new Error("Expected an independent transaction waiting for the User row lock");
}

describe("User lifecycle mutations through production PostgreSQL UnitOfWork", () => {
  test("Full Admin restores Pause before HR rehires and enables an ended-only User", async () => {
    const user = await seedUser();
    const [organization] = await harness.db.insert(organizations).values({
      orgCode: "IN",
      orgName: "In scope",
      path: "/IN",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    }).returning();
    const [position] = await harness.db.insert(positions).values({ posCode: "POS", posName: "Position" }).returning();
    const [tenure] = await harness.db.insert(employments).values({
      userId: user.id,
      orgId: organization!.id,
      posId: position!.id,
      startTime: new Date("2026-01-01T00:00:00Z"),
    }).returning();
    const subject = createCommand(undefined, undefined, stableStore(user.subjectIdentifier));
    const policy = createAdminAuthorizationPolicy({
      logger: { warn: mock() },
      hrAdministrationScopeResolver: {
        resolveForActor: async () => ({ rootOrganizationIds: [organization!.id], organizationIds: [organization!.id] }),
      },
    });
    const hrActor = { userId: 99, username: "hr", roles: ["iam:hr-admin"] };
    const hrUser = await policy.getUserAuthorization(hrActor);
    const hrEmployment = await policy.getEmploymentAuthorization(hrActor);
    const full = await policy.getUserAuthorization({ userId: 100, username: "full", roles: ["iam:admin"] });
    await subject.service.updateUserStatus("user", UserStatus.Disable, undefined, full);
    const afterDisable = await harness.db.select().from(employments);
    expect(afterDisable).toEqual([tenure!]);
    await subject.endEmployment.execute({ employmentId: tenure!.id });
    const historical = await harness.db.select().from(employments);
    const before = await facts();
    const intentsBefore = await transitions();
    for (const status of [UserStatus.Pause, UserStatus.Enable]) {
      const error = await failure(() => subject.service.updateUserStatus("user", status, undefined, hrUser));
      expect(error).toMatchObject({ httpStatus: 403 });
    }
    const createInput = { username: "user", orgCode: "IN", posCode: "POS" };
    const deniedCreate = await failure(() => subject.employment.execute(createInput, { authorization: hrEmployment }));
    expect(deniedCreate).toMatchObject({ code: "EMPLOYMENT.USER_DISABLED", httpStatus: 409 });
    const afterDenial = await facts();
    const intentsAfter = await transitions();
    expect(afterDenial).toEqual(before);
    expect(intentsAfter).toEqual(intentsBefore);

    const restored = await subject.service.updateUserStatus("user", UserStatus.Pause, undefined, full);
    expect(restored).toEqual({ changed: true, result: null });
    const afterRestore = await harness.db.select().from(employments);
    expect(afterRestore).toEqual(historical);
    const created = await subject.employment.execute(createInput, { authorization: hrEmployment });
    expect(created.changed).toBe(true);
    expect(created.result.id).not.toBe(tenure!.id);
    const pending = await facts();
    expect(pending.users[0]!.status).toBe(UserStatus.Pause);
    const enabled = await subject.service.updateUserStatus("user", UserStatus.Enable, undefined, hrUser);
    expect(enabled).toEqual({ changed: true, result: null });
    const after = await facts();
    expect(after.users[0]!.status).toBe(UserStatus.Enable);
    const currentTenures = await harness.db.select().from(employments).orderBy(employments.id);
    expect(currentTenures).toMatchObject([
      historical[0]!,
      { id: created.result.id, status: EmploymentStatus.Enable, endTime: null, orgId: organization!.id },
    ]);
    const access = await subject.barrier.read(user.subjectIdentifier);
    expect(access).toMatchObject({ state: "blocking" });
  });

  test("missing status/delete and repeated delete return not found without additional effects", async () => {
    const { service } = createCommand();
    for (const operation of [() => service.updateUserStatus("missing", UserStatus.Disable), () => service.deleteUser("missing")]) {
      const error = await failure(operation);
      expect(error).toBeInstanceOf(UserNotFoundError);
    }
    const missingIntents = await transitions();
    expect(missingIntents).toEqual([]);
    await seedUser();
    const result = await service.deleteUser("user");
    expect(result).toEqual({ changed: true, result: null });
    const before = await facts();
    const intentsBefore = await transitions();
    const error = await failure(() => service.deleteUser("user"));
    expect(error).toBeInstanceOf(UserNotFoundError);
    const after = await facts();
    const intentsAfter = await transitions();
    expect(after).toEqual(before);
    expect(intentsAfter).toEqual(intentsBefore);
  });

  for (const status of [EmploymentStatus.Enable, EmploymentStatus.Pause]) {
    test(`Open Employment ${status} blocks deletion and restores the barrier`, async () => {
      const user = await seedUser();
      const [organization] = await harness.db.insert(organizations).values({
        orgCode: "ORG",
        orgName: "Organization",
        path: "/ORG",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
      }).returning();
      const [position] = await harness.db.insert(positions).values({ posCode: "POS", posName: "Position" }).returning();
      await harness.db.insert(employments).values({
        userId: user.id,
        orgId: organization!.id,
        posId: position!.id,
        status,
      });
      const { service, store, revokeUserSessions } = createCommand(
        undefined,
        undefined,
        stableStore(user.subjectIdentifier),
      );
      const barrierBefore = await store.read(user.subjectIdentifier);
      const before = await facts();
      const error = await failure(() => service.deleteUser("user"));
      expect(error).toBeInstanceOf(UserHasOpenEmploymentError);
      const after = await facts();
      const barrierAfter = await store.read(user.subjectIdentifier);
      const intents = await transitions();
      expect(after).toEqual(before);
      expect(barrierAfter).toEqual(barrierBefore);
      expect(intents).toMatchObject([{ status: "rolled_back", targetState: "rollback" }]);
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  test("an open delegation between other Users does not block deletion", async () => {
    const user = await seedUser();
    const [unrelated] = await harness.db.insert(users).values({ username: "unrelated", name: "Unrelated" }).returning();
    await seedDelegation(unrelated!.id, "delegator", PrivilegeDelegationStatus.Enable, "current");
    const { service } = createCommand(undefined, undefined, stableStore(user.subjectIdentifier));
    const before = await deletionFacts();
    const result = await service.deleteUser("user");
    const after = await deletionFacts();
    expect(result).toEqual({ changed: true, result: null });
    expect(after.delegations).toEqual(before.delegations);
    expect(after.delegationDetails).toEqual(before.delegationDetails);
  });

  test.each(["REST", "tRPC"])("%s deletion returns the stable delegation conflict without effects", async (protocol) => {
    const user = await seedUser();
    await seedDelegation(user.id, "delegatee", PrivilegeDelegationStatus.Enable, "past");
    const command = createCommand(undefined, undefined, stableStore(user.subjectIdentifier));
    const adapter = createUserAdapter({ userService: command.service, random: command.random });
    const app = new Hono();
    app.onError(createErrorHandler({ info() {}, warn() {}, error() {} }));
    addTestAdminAuthorizationMiddleware(app);
    app.route("/admin", createUserRoute(adapter));
    app.all("/rpc/*", c => fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: adapter.userAdminRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
    }));
    const before = await deletionFacts();
    const response = protocol === "REST"
      ? await app.request("/admin/users/user", { method: "DELETE" })
      : await app.request("/rpc/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "user" }),
        });
    const body = await response.json();
    expect(response.status).toBe(409);
    const message = "该用户存在未结束的权限委托，无法删除；请先通过 Internal 接口结束相关委托";
    expect(body).toMatchObject(protocol === "REST"
      ? { code: "USER.HAS_OPEN_PRIVILEGE_DELEGATION", message }
      : { error: { message, data: { code: "CONFLICT", serviceCode: "USER.HAS_OPEN_PRIVILEGE_DELEGATION" } } });
    const after = await deletionFacts();
    expect(after).toEqual(before);
    expect(command.enqueueRebuildJobs).not.toHaveBeenCalled();
    expect(command.revokeUserSessions).not.toHaveBeenCalled();
  });

  describe.each(["delegator", "delegatee"] as const)("Open Delegation deletion gate for %s", (side) => {
    test.each([
      [PrivilegeDelegationStatus.Enable, "current"],
      [PrivilegeDelegationStatus.Pause, "current"],
      [PrivilegeDelegationStatus.Enable, "future"],
      [PrivilegeDelegationStatus.Pause, "future"],
      [PrivilegeDelegationStatus.Enable, "past"],
      [PrivilegeDelegationStatus.Pause, "past"],
    ] as const)("status %s in %s period rejects without deletion effects", async (status, period) => {
      const user = await seedUser();
      await seedDelegation(user.id, side, status, period);
      const { service, store, enqueueRebuildJobs, revokeUserSessions } = createCommand(
        undefined,
        undefined,
        stableStore(user.subjectIdentifier),
      );
      const before = await deletionFacts();
      const barrierBefore = await store.read(user.subjectIdentifier);
      const error = await failure(() => service.deleteUser("user"));
      expect(error).toMatchObject({ code: "USER.HAS_OPEN_PRIVILEGE_DELEGATION", httpStatus: 409 });
      const after = await deletionFacts();
      const barrierAfter = await store.read(user.subjectIdentifier);
      const intents = await transitions();
      expect(after).toEqual(before);
      expect(barrierAfter).toEqual(barrierBefore);
      expect(intents).toMatchObject([{ status: "rolled_back", targetState: "rollback" }]);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });

    test.each([
      [PrivilegeDelegationStatus.Disable, false],
      [PrivilegeDelegationStatus.Enable, true],
      [PrivilegeDelegationStatus.Pause, true],
    ] as const)("status %s with isDelete=%s permits deletion and preserves delegation history", async (status, isDelete) => {
      const user = await seedUser();
      await seedDelegation(user.id, side, status, "current", isDelete);
      const { service, barrier, revokeUserSessions } = createCommand(
        undefined,
        undefined,
        stableStore(user.subjectIdentifier),
      );
      const before = await deletionFacts();
      const result = await service.deleteUser("user");
      const after = await deletionFacts();
      const access = await barrier.read(user.subjectIdentifier);
      expect(result).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({ id: user.id, isDelete: true });
      expect(after.delegations).toEqual(before.delegations);
      expect(after.delegationDetails).toEqual(before.delegationDetails);
      expect(after.audits).toMatchObject([{ action: "admin.user.delete", details: { changed: true } }]);
      expect(after.dirty).toMatchObject([{ userId: user.id, dirtyVersion: "1" }]);
      expect(access.state).toBe("disabled");
      expect(revokeUserSessions).toHaveBeenCalledTimes(1);
    });

    test("ending the delegation through the Internal command releases the deletion gate", async () => {
      const user = await seedUser();
      const delegation = await seedDelegation(user.id, side, PrivilegeDelegationStatus.Pause, "future");
      const { service } = createCommand(undefined, undefined, stableStore(user.subjectIdentifier));
      const error = await failure(() => service.deleteUser("user"));
      expect(error).toMatchObject({ code: "USER.HAS_OPEN_PRIVILEGE_DELEGATION" });
      await runProcessCommandSmoke({
        label: "Internal delegation end before Admin user deletion",
        start: () => spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "test-integration/postgres/end-delegation.fixture.ts", String(delegation.id)],
          cwd: fileURLToPath(new URL("../../../api/", import.meta.url)),
          env: { ...process.env, IAM_API_TEST_DATABASE_URL: harness.commandDatabaseUrl },
        }),
        completionTimeoutMs: 15_000,
        cleanupTimeoutMs: 5_000,
        maxOutputBytes: 64 * 1024,
        expectedExitCode: 0,
      });
      const ended = await deletionFacts();
      expect(ended.delegations).toMatchObject([{ id: delegation.id, status: PrivilegeDelegationStatus.Disable }]);
      const result = await service.deleteUser("user");
      const after = await deletionFacts();
      expect(result).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({ id: user.id, isDelete: true });
      expect(after.delegations).toEqual(ended.delegations);
      expect(after.delegationDetails).toEqual(ended.delegationDetails);
      expect(after.audits.map(audit => audit.action)).toEqual(["internal.delegation.update", "admin.user.delete"]);
    }, 25_000);
  });

  for (const status of [UserStatus.Enable, UserStatus.Pause, UserStatus.Disable]) {
    test(`same status ${status} records intent audit without dirty or awaiting publication`, async () => {
      const user = await seedUser(status);
      const initialStore = stableStore(user.subjectIdentifier, status === UserStatus.Enable ? "enabled" : "disabled");
      const { service, store, enqueueRebuildJobs, revokeUserSessions } = createCommand(
        undefined,
        undefined,
        initialStore,
      );
      const barrierBefore = await store.read(user.subjectIdentifier);
      const result = await service.updateUserStatus("user", status);
      const after = await facts();
      const barrierAfter = await store.read(user.subjectIdentifier);
      const backlog = await store.inspectRepairBacklog();
      const intents = await transitions();
      expect(result).toEqual({ changed: false, result: null });
      expect(after.users).toEqual([user]);
      expect(after.audits).toMatchObject([{ action: "admin.user.status_update", details: { changed: false } }]);
      expect(after.dirty).toEqual([]);
      expect(barrierAfter).toEqual(barrierBefore);
      expect(backlog.count).toBe(0);
      expect(intents).toMatchObject([{ status: "committed", targetState: "rollback" }]);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  test("enabling commits facts and leaves access blocking until publication", async () => {
    const user = await seedUser(UserStatus.Disable);
    const { service, store, barrier, revokeUserSessions } = createCommand(
      undefined,
      undefined,
      stableStore(user.subjectIdentifier, "disabled"),
    );
    const result = await service.updateUserStatus("user", UserStatus.Enable);
    const after = await facts();
    const record = await barrier.read(user.subjectIdentifier);
    const backlog = await store.inspectRepairBacklog();
    const intents = await transitions();
    expect(result).toEqual({ changed: true, result: null });
    expect(after.users[0]).toMatchObject({ status: UserStatus.Enable });
    expect(after.audits).toMatchObject([{ action: "admin.user.status_update", details: { changed: true } }]);
    expect(after.dirty).toMatchObject([{ dirtyVersion: "1" }]);
    expect(intents).toMatchObject([{ status: "committed", targetState: "enabled" }]);
    expect(record.state).toBe("blocking");
    expect(backlog.count).toBe(1);
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  for (const operation of ["status", "delete"] as const) {
    const action = operation === "status" ? "admin.user.status_update" : "admin.user.delete";
    for (const stage of ["audit", "dirty", "zero-row"] as const) {
      test(`${operation} rolls back business facts, audit, dirty and intent when ${stage} fails`, async () => {
        const user = await seedUser();
        const sentinel = new Error(`injected ${stage}`);
        const { service, store, enqueueRebuildJobs, revokeUserSessions } = createCommand(tx => ({
          ...tx,
          ...(stage === "audit"
            ? {
                auditService: { ...tx.auditService, recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  throw sentinel;
                } },
              }
            : stage === "dirty"
              ? {
                  userProfileInvalidation: { recordChanges: async (changes) => {
                    await tx.userProfileInvalidation.recordChanges(changes);
                    throw sentinel;
                  } },
                }
              : {
                  userRepository: { ...tx.userRepository, [operation === "status" ? "updateUserByUsername" : "softDeleteUserByUsername"]: async () => null },
                }),
        }), undefined, stableStore(user.subjectIdentifier));
        const before = await facts();
        const barrierBefore = await store.read(user.subjectIdentifier);
        const error = await failure(() => operation === "status"
          ? service.updateUserStatus("user", UserStatus.Disable)
          : service.deleteUser("user"));
        if (stage === "zero-row")
          expect(error).toBeInstanceOf(Error);
        else
          expect(error).toBe(sentinel);
        const after = await facts();
        const barrierAfter = await store.read(user.subjectIdentifier);
        const intents = await transitions();
        expect(after).toEqual(before);
        expect(barrierAfter).toEqual(barrierBefore);
        expect(intents).toMatchObject([{ status: "rolled_back", targetState: "rollback" }]);
        expect(enqueueRebuildJobs).not.toHaveBeenCalled();
        expect(revokeUserSessions).not.toHaveBeenCalled();
      });
    }

    test(`${operation} committed lifecycle failure uses the dedicated error`, async () => {
      const user = await seedUser();
      const { service, barrier } = createCommand(undefined, new Error("repair unavailable"), stableStore(user.subjectIdentifier));
      const error = await failure(() => operation === "status"
        ? service.updateUserStatus("user", UserStatus.Disable)
        : service.deleteUser("user"));
      expect(error).toBeInstanceOf(AdminMutationCommittedError);
      const after = await facts();
      const intents = await transitions();
      const record = await barrier.read(user.subjectIdentifier);
      expect(after.users[0]).toMatchObject(operation === "status" ? { status: UserStatus.Disable } : { isDelete: true });
      expect(after.audits).toMatchObject([{ action, details: { changed: true } }]);
      expect(after.dirty).toMatchObject([{ userId: user.id, dirtyVersion: "1" }]);
      expect(intents).toMatchObject([{ status: "committed", targetState: "disabled" }]);
      expect(record.state).toBe("blocking");
    });

    test(`${operation} bestEffort session failure preserves committed success`, async () => {
      const user = await seedUser();
      const { service, barrier, revokeUserSessions, warn } = createCommand(
        undefined,
        undefined,
        stableStore(user.subjectIdentifier),
      );
      revokeUserSessions.mockImplementation(async () => {
        throw new Error("session unavailable");
      });
      const result = await (operation === "status"
        ? service.updateUserStatus("user", UserStatus.Disable)
        : service.deleteUser("user"));
      const after = await facts();
      const record = await barrier.read(user.subjectIdentifier);
      expect(result).toEqual({ changed: true, result: null });
      expect(after.audits).toMatchObject([{ action, details: { changed: true } }]);
      expect(after.dirty).toMatchObject([{ userId: user.id, dirtyVersion: "1" }]);
      expect(record.state).toBe("disabled");
      expect(revokeUserSessions).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
    });

    test(`${operation} waits for an independent profile transaction and keeps its committed fields`, async () => {
      const user = await seedUser();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({ ...tx, userRepository: {
        ...tx.userRepository,
        updateUserByUsername: async (username, patch) => {
          const row = await tx.userRepository.updateUserByUsername(username, patch);
          written.resolve();
          await release.promise;
          return row;
        },
      } })).service;
      const firstPending = first.updateUser("user", { name: "Concurrent profile" });
      await Promise.race([written.promise, firstPending]);
      const second = createCommand(undefined, undefined, stableStore(user.subjectIdentifier)).service;
      const secondPending = operation === "status"
        ? second.updateUserStatus("user", UserStatus.Disable)
        : second.deleteUser("user");
      try {
        await waitForUserLock();
      }
      finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const firstResult = await firstPending;
      const secondResult = await secondPending;
      const after = await facts();
      expect(firstResult).toEqual({ changed: true, result: null });
      expect(secondResult).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({ name: "Concurrent profile", password: "old-hash", ...(operation === "status" ? { status: UserStatus.Disable } : { isDelete: true }) });
      expect(after.audits.map(audit => audit.action)).toEqual(["admin.user.update", action]);
      expect(after.dirty).toMatchObject([{ dirtyVersion: "2" }]);
    });

    test(`pending ${operation} lifecycle rejects the competing lifecycle through the durable intent fence`, async () => {
      const user = await seedUser();
      const locked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const profile = createCommand(tx => ({ ...tx, userRepository: {
        ...tx.userRepository,
        lockUserByUsername: async (...args) => {
          const row = await tx.userRepository.lockUserByUsername(...args);
          locked.resolve();
          await release.promise;
          return row;
        },
      } })).service;
      const profilePending = profile.updateUser("user", { name: "Concurrent profile" });
      await Promise.race([locked.promise, profilePending]);
      const store = stableStore(user.subjectIdentifier);
      const first = createCommand(undefined, undefined, store).service;
      const second = createCommand(undefined, undefined, store).service;
      const firstPending = operation === "status"
        ? first.updateUserStatus("user", UserStatus.Disable)
        : first.deleteUser("user");
      try {
        await waitForUserLock();
        const error = await failure(() => operation === "status"
          ? second.deleteUser("user")
          : second.updateUserStatus("user", UserStatus.Disable));
        expect(extractPostgresError(error)).toEqual({
          code: "23505",
          constraint: "subject_access_transition_pending_subject_idx",
        });
      }
      finally {
        release.resolve();
        await Promise.allSettled([profilePending, firstPending]);
      }
      const result = await firstPending;
      const after = await facts();
      const intents = await transitions();
      expect(result).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({ name: "Concurrent profile", status: operation === "status" ? UserStatus.Disable : UserStatus.Enable, isDelete: operation === "delete" });
      expect(after.audits.map(audit => audit.action)).toEqual(["admin.user.update", action]);
      expect(after.dirty).toMatchObject([{ dirtyVersion: "2" }]);
      expect(intents).toMatchObject([{ status: "committed", targetState: "disabled" }]);
    });
  }
});

describe("User mutations through production PostgreSQL UnitOfWork", () => {
  test.each(userWriteProtocols)("%s normalizes User identity writes before PostgreSQL and preserves no-op semantics", async (protocol) => {
    const { app } = createUserWriteApp();
    const suffix = protocol === "REST" ? "Rest" : "TrPc";
    const username = `Mixed-${suffix}`;
    const createInput = {
      username: `  ${username}  `,
      name: `  ${suffix} Name  `,
      userType: UserType.Formal,
    };
    const created = await requestUserCreate(app, protocol, createInput);
    expect(created.status).toBe(200);

    const updated = protocol === "REST"
      ? await app.request(`/admin/users/${username}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `  ${suffix} Name  ` }),
        })
      : await app.request("/rpc/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, data: { name: `  ${suffix} Name  ` } }),
        });
    expect(updated.status).toBe(200);

    const after = await facts();
    expect(after.users).toMatchObject([{ username, name: `${suffix} Name` }]);
    expect(after.audits).toMatchObject([{ action: "admin.user.create" }]);
    expect(after.dirty).toMatchObject([{ dirtyVersion: "1" }]);
  });

  test.each([
    ["REST", "active", false],
    ["REST", "soft-deleted", true],
    ["tRPC", "active", false],
    ["tRPC", "soft-deleted", true],
  ] as const)("%s maps a normalized %s username conflict without new facts", async (protocol, _, isDelete) => {
    await seedUser(UserStatus.Enable, isDelete);
    const { app, command } = createUserWriteApp();
    const before = await facts();
    const response = await requestUserCreate(app, protocol, {
      username: "  user  ",
      name: "Duplicate",
      userType: UserType.Formal,
    });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body).toMatchObject(protocol === "REST"
      ? { code: ApiErrorCode.UsernameAlreadyExists, message: "用户名已存在" }
      : {
          error: {
            message: "用户名已存在",
            data: { code: "CONFLICT", serviceCode: ApiErrorCode.UsernameAlreadyExists },
          },
        });
    const after = await facts();
    expect(after).toEqual(before);
    expect(command.random.password).not.toHaveBeenCalled();
  });

  test("concurrent username creates reach the real unique constraint and only one commits", async () => {
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const { service } = createCommand(tx => ({ ...tx, userRepository: {
      ...tx.userRepository,
      getAnyUserByUsername: async (username) => {
        const row = await tx.userRepository.getAnyUserByUsername(username);
        if (++arrived === 2)
          gate.resolve();
        await gate.promise;
        return row;
      },
    } }));
    const results = await Promise.allSettled(["First", "Second"].map(name => service.setUserForAdmin({ username: "user", name, userType: UserType.Formal })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")?.reason).toBeInstanceOf(UsernameAlreadyExistsError);
    const after = await facts();
    expect(after.users).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toMatchObject([{ dirtyVersion: "1" }]);
  });

  test("transaction precheck catches a tombstone appearing after the root precheck", async () => {
    const { service } = createCommand(tx => ({ ...tx, userRepository: {
      ...tx.userRepository,
      getAnyUserByUsername: async (username) => {
        await seedUser(UserStatus.Enable, true);
        return await tx.userRepository.getAnyUserByUsername(username);
      },
    } }));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "Duplicate", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(UsernameAlreadyExistsError);
    const after = await facts();
    expect(after.users).toMatchObject([{ isDelete: true, password: "old-hash" }]);
    expect(after.audits).toEqual([]);
    expect(after.dirty).toEqual([]);
  });

  test("create reports committed failure when Subject Access repair preparation fails", async () => {
    const { service } = createCommand(undefined, new Error("repair unavailable"));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(AdminMutationCommittedError);
    const after = await facts();
    expect(after.users).toHaveLength(1);
    expect(after.audits).toMatchObject([{ details: { changed: true } }]);
    expect(after.dirty).toMatchObject([{ dirtyVersion: "1" }]);
    expect(JSON.stringify(error)).not.toContain("Random123!");
  });

  test("create failure before commit preserves the original failure and rolls back", async () => {
    const sentinel = new Error("audit unavailable");
    const { service, enqueueRebuildJobs } = createCommand(tx => ({ ...tx, auditService: {
      ...tx.auditService,
      recordAuditLog: async (input) => {
        await tx.auditService.recordAuditLog(input);
        throw sentinel;
      },
    } }));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }));
    expect(error).toBe(sentinel);
    const after = await facts();
    expect(after).toEqual({ users: [], audits: [], dirty: [] });
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("zero-row create fails closed", async () => {
    const { service } = createCommand(tx => ({
      ...tx,
      userRepository: { ...tx.userRepository, setUserForAdmin: async () => null },
    }));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(Error);
    const after = await facts();
    expect(after).toEqual({ users: [], audits: [], dirty: [] });
  });

  test("create returns a safe resource and one-time password with committed audit and dirty", async () => {
    const { service } = createCommand();
    const result = await service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal });
    expect(result).toMatchObject({ changed: true, result: {
      username: "user",
      generatedPassword: "Random123!",
      user: { username: "user", name: "User" },
    } });
    expect(result.result.user).not.toHaveProperty("password");
    const after = await facts();
    expect(after.users[0]).toMatchObject({ password: "hash:Random123!", subjectIdentifier: expect.any(String) });
    expect(after.audits).toMatchObject([{ action: "admin.user.create", details: { changed: true, passwordProvided: false } }]);
    expect(after.dirty).toMatchObject([{ userId: after.users[0]!.id, dirtyVersion: "1" }]);
    expect(JSON.stringify(after.audits)).not.toContain("Random123!");
    expect(JSON.stringify(result)).not.toContain("hash:");
  });

  test("soft-deleted usernames remain occupied before lifecycle work", async () => {
    await seedUser(UserStatus.Enable, true);
    const { service, random } = createCommand();
    const before = await facts();
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "Duplicate", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(UsernameAlreadyExistsError);
    expect(random.password).not.toHaveBeenCalled();
    const after = await facts();
    expect(after).toEqual(before);
  });

  test("real unique violation retains Drizzle cause and unknown constraints remain internal", async () => {
    await seedUser();
    const raw = await failure(async () => await harness.db.insert(users).values({ username: "user", name: "Duplicate", userType: UserType.Formal }));
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)?.code).toBe("23505");
    await harness.sql`create unique index user_test_name_unique on "user"(name)`;
    try {
      const before = await facts();
      const error = await failure(() => createCommand().service.setUserForAdmin({ username: "other", name: "Original", userType: UserType.Formal }));
      expect(error).not.toBeInstanceOf(UsernameAlreadyExistsError);
      expect(extractPostgresError(error)).toEqual({ code: "23505", constraint: "user_test_name_unique" });
      const after = await facts();
      expect(after).toEqual(before);
    }
    finally {
      await harness.sql`drop index user_test_name_unique`;
    }
  });

  test("empty/missing updates fail and equal profile values do not write audit or dirty", async () => {
    await seedUser();
    const { service, enqueueRebuildJobs } = createCommand();
    const before = await facts();
    const empty = await failure(() => service.updateUser("missing", {}));
    expect(empty).toBeInstanceOf(BadRequestError);
    const missing = await failure(() => service.updateUser("missing", { name: "Name" }));
    expect(missing).toBeInstanceOf(UserNotFoundError);
    const same = await service.updateUser("user", { name: "Original", mobile: "13800000000", wxId: null });
    expect(same).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after).toEqual(before);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  for (const stage of ["audit", "dirty"] as const) {
    test(`profile edit rolls back source/audit/dirty when ${stage} fails`, async () => {
      await seedUser();
      const sentinel = new Error(`injected ${stage}`);
      const { service, enqueueRebuildJobs } = createCommand(tx => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: { ...tx.auditService, recordAuditLog: async (input) => {
                await tx.auditService.recordAuditLog(input);
                throw sentinel;
              } },
            }
          : {
              userProfileInvalidation: { recordChanges: async (changes) => {
                await tx.userProfileInvalidation.recordChanges(changes);
                throw sentinel;
              } },
            }),
      }));
      const before = await facts();
      const error = await failure(() => service.updateUser("user", { name: "Changed" }));
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  test("profile update commits before queue notification and masks contacts in audit", async () => {
    const user = await seedUser();
    const { service, enqueueRebuildJobs } = createCommand();
    let observed: Awaited<ReturnType<typeof facts>> | undefined;
    enqueueRebuildJobs.mockImplementation(async () => {
      observed = await facts();
      return { enqueued: 1, jobIds: ["user-job"] };
    });
    const result = await service.updateUser("user", { mobile: "13912345678" });
    expect(result).toEqual({ changed: true, result: null });
    expect(observed?.users[0]).toMatchObject({ mobile: "13912345678" });
    expect(observed?.audits).toMatchObject([{ action: "admin.user.update", details: { changed: true } }]);
    expect(observed?.dirty).toMatchObject([{ userId: user.id, dirtyVersion: "1" }]);
    expect(JSON.stringify(observed?.audits)).not.toContain("13912345678");
  });

  for (const method of ["updateUserByUsername", "setPassword"] as const) {
    test(`zero-row ${method} does not fabricate audit, dirty or session revocation`, async () => {
      await seedUser();
      const { service, revokeUserSessions } = createCommand(tx => ({
        ...tx,
        userRepository: { ...tx.userRepository, [method]: async () => null },
      }));
      const before = await facts();
      const error = await failure(() => method === "setPassword" ? service.resetPasswordByUsername("user") : service.updateUser("user", { name: "Changed" }));
      expect(error).toBeInstanceOf(Error);
      const after = await facts();
      expect(after).toEqual(before);
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  for (const status of [UserStatus.Pause, UserStatus.Disable]) {
    test(`guarded reset rejects status ${status} without audit or sessions`, async () => {
      await seedUser(status);
      const { service, revokeUserSessions } = createCommand();
      const before = await facts();
      const error = await failure(() => service.resetPasswordByUsername("user"));
      expect(error).toBeInstanceOf(UserNotFoundError);
      const after = await facts();
      expect(after).toEqual(before);
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  test("reset is a credential change and bestEffort session failure preserves safe success", async () => {
    await seedUser();
    const { service, revokeUserSessions, warn } = createCommand();
    revokeUserSessions.mockImplementation(async () => {
      throw new Error("session unavailable");
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await service.resetPasswordByUsername("user");
      expect(result).toEqual({ changed: true, result: "Random123!" });
    }
    const after = await facts();
    expect(after.users[0]!.password).toBe("hash:Random123!");
    expect(after.audits).toMatchObject([
      { action: "admin.user.reset_password", details: { changed: true, passwordReset: true } },
      { action: "admin.user.reset_password", details: { changed: true, passwordReset: true } },
    ]);
    expect(after.dirty).toEqual([]);
    expect(JSON.stringify(after.audits)).not.toContain("Random123!");
    expect(revokeUserSessions).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });

  for (const secondOperation of ["other-field", "same-value"] as const) {
    test(`a waiting ${secondOperation} profile edit observes committed facts`, async () => {
      await seedUser();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({ ...tx, userRepository: {
        ...tx.userRepository,
        updateUserByUsername: async (username, patch) => {
          const row = await tx.userRepository.updateUserByUsername(username, patch);
          written.resolve();
          await release.promise;
          return row;
        },
      } })).service;
      const firstPending = first.updateUser("user", { mobile: "13912345678" });
      await Promise.race([written.promise, firstPending]);
      const secondPending = createCommand().service.updateUser("user", secondOperation === "other-field"
        ? { name: "Changed" }
        : { mobile: "13912345678" });
      try {
        const deadline = Date.now() + 2000;
        let blocked = false;
        while (!blocked && Date.now() < deadline) {
          const rows = await harness.sql<{ blocked: boolean }[]>`select exists (
          select 1 from pg_stat_activity where wait_event_type = 'Lock'
          and query like '%"user"%' and application_name = current_setting('application_name')
          and pid <> pg_backend_pid()
        ) as blocked`;
          blocked = rows[0]!.blocked;
        }
        expect(blocked).toBe(true);
      }
      finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const firstResult = await firstPending;
      const secondResult = await secondPending;
      expect(firstResult).toEqual({ changed: true, result: null });
      expect(secondResult).toEqual({ changed: secondOperation === "other-field", result: null });
      const after = await facts();
      expect(after.users[0]).toMatchObject({
        name: secondOperation === "other-field" ? "Changed" : "Original",
        mobile: "13912345678",
        password: "old-hash",
        status: UserStatus.Enable,
      });
      expect(after.audits).toHaveLength(secondOperation === "other-field" ? 2 : 1);
      expect(after.dirty).toMatchObject([{ dirtyVersion: secondOperation === "other-field" ? "2" : "1" }]);
    });
  }
});

for (const profileState of [
  { status: UserStatus.Pause, isDelete: false },
  { status: UserStatus.Disable, isDelete: false },
  { status: UserStatus.Disable, isDelete: true },
]) {
  test(`permitted Admin reads retained PostgreSQL profile ${JSON.stringify(profileState)}`, async () => {
    const user = await seedUser(profileState.status, profileState.isDelete);
    const command = createCommand();
    const readBarrier = mock(async () => "20000000-0000-4000-8000-000000000001");
    const operations = createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: readBarrier },
      revocation: {
        revokePrincipalSession: command.revokeUserSessions,
        revokeUserSessions: command.revokeUserSessions,
      },
    });
    const detail = await operations.run(async (operation) => {
      await operation.acquireForAuthentication(user.subjectIdentifier);
      return await command.service.getUserDetailForPermittedAdmin(operation, user.subjectIdentifier);
    });
    expect(detail).toMatchObject({ id: user.id, ...profileState });
    expect(readBarrier).toHaveBeenCalledTimes(1);
    expect(command.revokeUserSessions).toHaveBeenCalledTimes(0);
  });
}
