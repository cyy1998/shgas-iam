import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createCustomAttributeAdapter } from "@admin-api/routes/admin/custom-attribute/custom-attribute.index";
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { createUserRoute } from "@admin-api/routes/admin/user/user.index";
import { createAdminAuthorizationContextHandler } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createCustomAttributeDefinitionService } from "@admin-api/services/custom-attribute/custom-attribute.service";
import type { AdminUserTransactionPorts } from "@admin-api/services/user/user.port";
import { createUserService } from "@admin-api/services/user/user.service";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createTRPCContext, router } from "@iam/api-core/trpc";
import {
  ApiErrorCode,
  ClientDelegationStatus,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  UserStatus,
  UserType,
} from "@iam/contracts";
import type { CustomAttributeDefinition } from "@iam/contracts/custom-attributes";
import { createAuditLogWriter, createAuditRepository } from "@iam/db/audit";
import { extractPostgresError } from "@iam/db/postgres-error";
import {
  auditLogs,
  clientDelegations,
  clients,
  employments,
  organizations,
  positions,
  subjectAccessTransitions,
  userDocumentRebuildStates,
  users,
  userWechatExternalBindings,
} from "@iam/db/schema";
import { createDelegationService } from "@iam/delegation";
import { createSubjectAccessTransitionRepository } from "@iam/documents/user/subject-access-transition";
import { UserHasOpenEmploymentError, UserNotFoundError, UsernameAlreadyExistsError } from "@iam/domain/user";
import { BadRequestError } from "@iam/runtime/errors";
import { createSubjectAccessBarrier, createSubjectAccessOperations } from "@iam/subject-access";
import { createSubjectAccessLifecycle } from "@iam/subject-access/lifecycle";
import { createInMemorySubjectAccessStore } from "@iam/subject-access/testing";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware } from "../../src/testing/admin-authorization";
import type { AdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import {
  createUserDocumentPublicationFixture,
  createUserDocumentSourceConsumer,
} from "../support/user-document-workflow";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.db.delete(clientDelegations);
  await harness.db.delete(clients);
});
afterAll(async () => {
  await harness?.close();
});

function createCommand(
  decorate: (tx: AdminUserTransactionPorts) => AdminUserTransactionPorts = (tx) => tx,
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
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries() {
        return { enqueued: 0 };
      },
    },
    userDocumentJobProducer: createUserDocumentSourceConsumer(harness.db, enqueueRebuildJobs, clock),
  });
  return {
    employment: createCreateEmploymentUseCase({
      clock,
      uow: mapUnitOfWork(uow, (tx) => ({
        employmentStore: tx.repositories.employment,
        userReader: tx.repositories.user,
        organizationReader: tx.repositories.organization,
        positionReader: tx.repositories.position,
        auditLogWriter: tx.auditService,
        userDocumentInvalidation: tx.userDocumentInvalidation,
      })),
    }),
    endEmployment: createEndEmploymentUseCase({
      clock,
      uow: mapUnitOfWork(uow, (tx) => ({
        employmentStore: tx.repositories.employment,
        organizationReader: tx.repositories.organization,
        auditLogWriter: tx.auditService,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userDocumentInvalidation: tx.userDocumentInvalidation,
      })),
    }),
    barrier,
    store,
    enqueueRebuildJobs,
    revokeUserSessions,
    warn,
    random,
    definitions: createCustomAttributeDefinitionService({
      reader: repositories.customAttribute,
      uow: mapUnitOfWork(uow, (tx) => ({
        definitions: tx.repositories.customAttribute,
        audit: tx.auditService,
        userDocumentInvalidation: tx.userDocumentInvalidation,
        organizationDocumentInvalidation: tx.organizationDocumentInvalidation,
      })),
    }),
    service: createUserService({
      userRepository: repositories.user,
      customAttributeDefinitions: repositories.customAttribute,
      employmentRepository: repositories.employment,
      roleAssignmentResolver: { resolveEffectiveRoles: async () => new Map() },
      roleRepository: repositories.role,

      passwordHasher: { hashPassword: async (password) => `hash:${password}` },
      random,
      sessionRevocation: { revokeUserSessions },
      subjectAccessLifecycle: createSubjectAccessLifecycle({
        barrier: prepareRepairError
          ? {
              ...barrier,
              prepareRepair: async () => {
                throw prepareRepairError;
              },
            }
          : barrier,
        logger: { warn },
        random,
        transitionIntent: createSubjectAccessTransitionRepository(harness.db),
      }),
      uow: mapUnitOfWork(uow, (tx) =>
        decorate({
          userRepository: tx.repositories.user,
          customAttributeDefinitions: tx.repositories.customAttribute,
          auditService: tx.auditService,
          subjectAccessMutation: tx.subjectAccessMutation,
          userDocumentInvalidation: tx.userDocumentInvalidation,
        }),
      ),
    }),
  };
}

type UserWriteProtocol = "REST" | "tRPC";
const userWriteProtocols: UserWriteProtocol[] = ["REST", "tRPC"];

function createUserWriteApp(command = createCommand(), hrOrganizationId?: number) {
  const adapter = createUserAdapter({ userService: command.service, random: command.random });
  const definitions = createCustomAttributeAdapter(command.definitions);
  const app = new Hono();
  app.onError(createErrorHandler({ info() {}, warn() {}, error() {} }));
  addTestAdminAuthorizationMiddleware(app, hrOrganizationId === undefined ? ["iam:admin"] : ["iam:hr-admin"]);
  if (hrOrganizationId !== undefined) {
    app.use(
      "*",
      createAdminAuthorizationContextHandler(
        createAdminAuthorizationPolicy({
          logger: { warn: mock() },
          hrAdministrationScopeResolver: {
            resolveForActor: async () => ({
              rootOrganizationIds: [hrOrganizationId],
              organizationIds: [hrOrganizationId],
            }),
          },
        }),
      ),
    );
  }
  app.route("/admin", createUserRoute(adapter));
  app.route("/admin", definitions.rest);
  const definitionRouter = router({ admin: router({ customAttribute: definitions.trpc }) });
  app.all("/rpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: c.req.path.startsWith("/rpc/admin.customAttribute.") ? definitionRouter : adapter.userAdminRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
    }),
  );
  return { app, command };
}

const userDefinition = (code: string, valueType: CustomAttributeDefinition["valueType"]) => ({
  entityType: "user" as const,
  code,
  valueType,
  displayName: code,
});

async function createDefinition(app: Hono, definition: Record<string, unknown>) {
  const response = await requestDefinition(app, "", definition);
  expect(response.status).toBe(200);
}

function requestDefinition(app: Hono, action: string, input: Record<string, unknown>) {
  return app.request(`/admin/custom-attribute-definitions${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

function requestUserUnlinkWecom(app: Hono, protocol: UserWriteProtocol, username: string) {
  return protocol === "REST"
    ? app.request(`/admin/users/${username}/unlink-wecom`, { method: "POST" })
    : app.request("/rpc/unlinkWecom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
}

function requestUserUnlinkWecomExternalBinding(
  app: Hono,
  protocol: UserWriteProtocol,
  username: string,
  bindingId: number,
) {
  return protocol === "REST"
    ? app.request(`/admin/users/${username}/wecom-external-bindings/${bindingId}`, { method: "DELETE" })
    : app.request("/rpc/unlinkWecomExternalBinding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, bindingId }),
      });
}

async function requestUserCreate(app: Hono, protocol: UserWriteProtocol, input: Record<string, unknown>) {
  return await app.request(protocol === "REST" ? "/admin/users" : "/rpc/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

function requestUserUpdate(app: Hono, protocol: UserWriteProtocol, username: string, data: Record<string, unknown>) {
  return app.request(protocol === "REST" ? `/admin/users/${username}` : "/rpc/update", {
    method: protocol === "REST" ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(protocol === "REST" ? data : { username, data }),
  });
}

async function seedUser(status = UserStatus.Enable, isDelete = false) {
  const [user] = await harness.db
    .insert(users)
    .values({
      username: "user",
      name: "Original",
      userType: UserType.Formal,
      status,
      isDelete,
      password: "old-hash",
      mobile: "13800000000",
    })
    .returning();
  return user!;
}

async function seedDelegation(
  userId: number,
  side: "delegator" | "delegatee",
  status: ClientDelegationStatus,
  period: "current" | "future" | "past",
) {
  const [other] = await harness.db.insert(users).values({ username: "other", name: "Other" }).returning();
  const [organization] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "ORG",
      orgName: "Organization",
      path: "/ORG",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    })
    .returning();
  const [client] = await harness.db
    .insert(clients)
    .values({ clientCode: "delegation-test", clientName: "Delegation", clientSecret: "test", extAttributes: {} })
    .returning();
  const periods = {
    current: ["2000-01-01", "2099-01-01"],
    future: ["2099-01-01", "2100-01-01"],
    past: ["2000-01-01", "2001-01-01"],
  } as const;
  const [delegation] = await harness.db
    .insert(clientDelegations)
    .values({
      delegatorUserId: side === "delegator" ? userId : other!.id,
      delegateeUserId: side === "delegatee" ? userId : other!.id,
      organizationScopeId: organization!.id,
      status,
      clientId: client!.id,
      startTime: new Date(periods[period][0]),
      endTime: new Date(periods[period][1]),
    })
    .returning();
  return delegation!;
}

async function facts() {
  return {
    users: await harness.db.select().from(users).orderBy(users.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    dirty: await harness.db.select().from(userDocumentRebuildStates).orderBy(userDocumentRebuildStates.userId),
  };
}

async function deletionFacts() {
  return {
    ...(await facts()),
    delegations: await harness.db.select().from(clientDelegations).orderBy(clientDelegations.id),
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

function stableStore(subjectIdentifier: string, state: "enabled" | "disabled" = "enabled") {
  return createInMemorySubjectAccessStore([
    {
      version: 1,
      subjectIdentifier,
      state,
      transitionId: randomUUID(),
      updatedAt: "2026-09-07T00:00:00Z",
    },
  ]);
}

async function transitions() {
  return await harness.db.select().from(subjectAccessTransitions).orderBy(subjectAccessTransitions.createTime);
}

async function waitForUserLock() {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const rows = await harness.sql<{ blocked: boolean }[]>`select exists (
      select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'
      and query like '%"user"%' and application_name = current_setting('application_name')
      and pid <> pg_backend_pid()
    ) as blocked`;
    if (rows[0]!.blocked) return;
  }
  throw new Error("Expected an independent transaction waiting for the User row lock");
}

describe("User lifecycle mutations through production PostgreSQL UnitOfWork", () => {
  test("Full Admin restores Pause before HR rehires and enables an ended-only User", async () => {
    const user = await seedUser();
    const [organization] = await harness.db
      .insert(organizations)
      .values({
        orgCode: "IN",
        orgName: "In scope",
        path: "/IN",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
      })
      .returning();
    const [position] = await harness.db.insert(positions).values({ posCode: "POS", posName: "Position" }).returning();
    const [tenure] = await harness.db
      .insert(employments)
      .values({
        userId: user.id,
        orgId: organization!.id,
        posId: position!.id,
        startTime: "2026-01-01",
      })
      .returning();
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
    for (const operation of [
      () => service.updateUserStatus("missing", UserStatus.Disable),
      () => service.deleteUser("missing"),
    ]) {
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

  for (const status of [EmploymentStatus.Enable, EmploymentStatus.Pause, EmploymentStatus.Pending]) {
    test(`Open Employment ${status} blocks deletion and restores the barrier`, async () => {
      const user = await seedUser();
      const [organization] = await harness.db
        .insert(organizations)
        .values({
          orgCode: "ORG",
          orgName: "Organization",
          path: "/ORG",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Company,
        })
        .returning();
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
    await seedDelegation(unrelated!.id, "delegator", ClientDelegationStatus.Enable, "current");
    const { service } = createCommand(undefined, undefined, stableStore(user.subjectIdentifier));
    const before = await deletionFacts();
    const result = await service.deleteUser("user");
    const after = await deletionFacts();
    expect(result).toEqual({ changed: true, result: null });
    expect(after.delegations).toEqual(before.delegations);
  });

  test.each(["REST", "tRPC"])(
    "%s deletion returns the stable delegation conflict without effects",
    async (protocol) => {
      const user = await seedUser();
      await seedDelegation(user.id, "delegatee", ClientDelegationStatus.Enable, "past");
      const command = createCommand(undefined, undefined, stableStore(user.subjectIdentifier));
      const adapter = createUserAdapter({ userService: command.service, random: command.random });
      const definitions = createCustomAttributeAdapter(command.definitions);
      const app = new Hono();
      app.onError(createErrorHandler({ info() {}, warn() {}, error() {} }));
      addTestAdminAuthorizationMiddleware(app);
      app.route("/admin", createUserRoute(adapter));
      app.route("/admin", definitions.rest);
      const definitionRouter = router({ admin: router({ customAttribute: definitions.trpc }) });
      app.all("/rpc/*", (c) =>
        fetchRequestHandler({
          endpoint: "/rpc",
          req: c.req.raw,
          router: c.req.path.startsWith("/rpc/admin.customAttribute.") ? definitionRouter : adapter.userAdminRouter,
          createContext: () => createTRPCContext({ honoCtx: c }),
        }),
      );
      const before = await deletionFacts();
      const response =
        protocol === "REST"
          ? await app.request("/admin/users/user", { method: "DELETE" })
          : await app.request("/rpc/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: "user" }),
            });
      const body = await response.json();
      expect(response.status).toBe(409);
      const message = "该用户存在未结束的委托，无法删除；请先结束相关委托";
      expect(body).toMatchObject(
        protocol === "REST"
          ? { code: "USER.HAS_OPEN_CLIENT_DELEGATION", message }
          : { error: { message, data: { code: "CONFLICT", serviceCode: "USER.HAS_OPEN_CLIENT_DELEGATION" } } },
      );
      const after = await deletionFacts();
      expect(after).toEqual(before);
      expect(command.enqueueRebuildJobs).not.toHaveBeenCalled();
      expect(command.revokeUserSessions).not.toHaveBeenCalled();
    },
  );

  describe.each(["delegator", "delegatee"] as const)("Open Delegation deletion gate for %s", (side) => {
    test.each([
      [ClientDelegationStatus.Enable, "current"],
      [ClientDelegationStatus.Pause, "current"],
      [ClientDelegationStatus.Enable, "future"],
      [ClientDelegationStatus.Pause, "future"],
      [ClientDelegationStatus.Enable, "past"],
      [ClientDelegationStatus.Pause, "past"],
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
      expect(error).toMatchObject({ code: "USER.HAS_OPEN_CLIENT_DELEGATION", httpStatus: 409 });
      const after = await deletionFacts();
      const barrierAfter = await store.read(user.subjectIdentifier);
      const intents = await transitions();
      expect(after).toEqual(before);
      expect(barrierAfter).toEqual(barrierBefore);
      expect(intents).toMatchObject([{ status: "rolled_back", targetState: "rollback" }]);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });

    test.each([[ClientDelegationStatus.Disable, false]] as const)(
      "ended status %s permits deletion and preserves delegation history",
      async (status) => {
        const user = await seedUser();
        await seedDelegation(user.id, side, status, "current");
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
        expect(after.audits).toMatchObject([{ action: "admin.user.delete", details: { changed: true } }]);
        expect(after.dirty).toMatchObject([{ userId: user.id, version: "1" }]);
        expect(access.state).toBe("disabled");
        expect(revokeUserSessions).toHaveBeenCalledTimes(1);
      },
    );

    test("ending the delegation through the Internal command releases the deletion gate", async () => {
      const user = await seedUser();
      const delegation = await seedDelegation(user.id, side, ClientDelegationStatus.Pause, "future");
      const { service } = createCommand(undefined, undefined, stableStore(user.subjectIdentifier));
      const error = await failure(() => service.deleteUser("user"));
      expect(error).toMatchObject({ code: "USER.HAS_OPEN_CLIENT_DELEGATION" });
      const delegations = createDelegationService({
        db: harness.db,
        recordAudit: async (tx, event) =>
          createAuditLogWriter({ sourceApp: "iam", auditRepository: createAuditRepository(tx) }).recordAuditLog(event),
      });
      await delegations.update(
        delegation.id,
        { status: ClientDelegationStatus.Disable },
        { kind: "client", clientId: delegation.clientId },
        { actionPrefix: "internal", actor: { actorType: "client", actorClientCode: "delegation-test" } },
      );
      const ended = await deletionFacts();
      expect(ended.delegations).toMatchObject([{ id: delegation.id, status: ClientDelegationStatus.Disable }]);
      const result = await service.deleteUser("user");
      const after = await deletionFacts();
      expect(result).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({ id: user.id, isDelete: true });
      expect(after.delegations).toEqual(ended.delegations);
      expect(after.audits.map((audit) => audit.action)).toEqual(["internal.delegation.update", "admin.user.delete"]);
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
    expect(after.dirty).toMatchObject([{ version: "1" }]);
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
        const { service, store, enqueueRebuildJobs, revokeUserSessions } = createCommand(
          (tx) => ({
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
              : stage === "dirty"
                ? {
                    userDocumentInvalidation: {
                      recordChanges: async (changes) => {
                        await tx.userDocumentInvalidation.recordChanges(changes);
                        throw sentinel;
                      },
                    },
                  }
                : {
                    userRepository: {
                      ...tx.userRepository,
                      [operation === "status" ? "updateUserByUsername" : "softDeleteUserByUsername"]: async () => null,
                    },
                  }),
          }),
          undefined,
          stableStore(user.subjectIdentifier),
        );
        const before = await facts();
        const barrierBefore = await store.read(user.subjectIdentifier);
        const error = await failure(() =>
          operation === "status" ? service.updateUserStatus("user", UserStatus.Disable) : service.deleteUser("user"),
        );
        if (stage === "zero-row") expect(error).toBeInstanceOf(Error);
        else expect(error).toBe(sentinel);
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
      const { service, barrier } = createCommand(
        undefined,
        new Error("repair unavailable"),
        stableStore(user.subjectIdentifier),
      );
      const error = await failure(() =>
        operation === "status" ? service.updateUserStatus("user", UserStatus.Disable) : service.deleteUser("user"),
      );
      expect(error).toBeInstanceOf(AdminMutationCommittedError);
      const after = await facts();
      const intents = await transitions();
      const record = await barrier.read(user.subjectIdentifier);
      expect(after.users[0]).toMatchObject(
        operation === "status" ? { status: UserStatus.Disable } : { isDelete: true },
      );
      expect(after.audits).toMatchObject([{ action, details: { changed: true } }]);
      expect(after.dirty).toMatchObject([{ userId: user.id, version: "1" }]);
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
      expect(after.dirty).toMatchObject([{ userId: user.id, version: "1" }]);
      expect(record.state).toBe("disabled");
      expect(revokeUserSessions).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
    });

    test(`${operation} waits for an independent profile transaction and keeps its committed fields`, async () => {
      const user = await seedUser();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand((tx) => ({
        ...tx,
        userRepository: {
          ...tx.userRepository,
          updateUserByUsername: async (username, patch) => {
            const row = await tx.userRepository.updateUserByUsername(username, patch);
            written.resolve();
            await release.promise;
            return row;
          },
        },
      })).service;
      const firstPending = first.updateUser("user", { name: "Concurrent profile" });
      await Promise.race([written.promise, firstPending]);
      const second = createCommand(undefined, undefined, stableStore(user.subjectIdentifier)).service;
      const secondPending =
        operation === "status" ? second.updateUserStatus("user", UserStatus.Disable) : second.deleteUser("user");
      try {
        await waitForUserLock();
      } finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const firstResult = await firstPending;
      const secondResult = await secondPending;
      const after = await facts();
      expect(firstResult).toEqual({ changed: true, result: null });
      expect(secondResult).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({
        name: "Concurrent profile",
        password: "old-hash",
        ...(operation === "status" ? { status: UserStatus.Disable } : { isDelete: true }),
      });
      expect(after.audits.map((audit) => audit.action)).toEqual(["admin.user.update", action]);
      expect(after.dirty).toMatchObject([{ version: "2" }]);
    });

    test(`pending ${operation} lifecycle rejects the competing lifecycle through the durable intent fence`, async () => {
      const user = await seedUser();
      const locked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const profile = createCommand((tx) => ({
        ...tx,
        userRepository: {
          ...tx.userRepository,
          lockUserByUsername: async (...args) => {
            const row = await tx.userRepository.lockUserByUsername(...args);
            locked.resolve();
            await release.promise;
            return row;
          },
        },
      })).service;
      const profilePending = profile.updateUser("user", { name: "Concurrent profile" });
      await Promise.race([locked.promise, profilePending]);
      const store = stableStore(user.subjectIdentifier);
      const first = createCommand(undefined, undefined, store).service;
      const second = createCommand(undefined, undefined, store).service;
      const firstPending =
        operation === "status" ? first.updateUserStatus("user", UserStatus.Disable) : first.deleteUser("user");
      try {
        await waitForUserLock();
        const error = await failure(() =>
          operation === "status" ? second.deleteUser("user") : second.updateUserStatus("user", UserStatus.Disable),
        );
        expect(extractPostgresError(error)).toEqual({
          code: "23505",
          constraint: "subject_access_transition_pending_subject_idx",
        });
      } finally {
        release.resolve();
        await Promise.allSettled([profilePending, firstPending]);
      }
      const result = await firstPending;
      const after = await facts();
      const intents = await transitions();
      expect(result).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({
        name: "Concurrent profile",
        status: operation === "status" ? UserStatus.Disable : UserStatus.Enable,
        isDelete: operation === "delete",
      });
      expect(after.audits.map((audit) => audit.action)).toEqual(["admin.user.update", action]);
      expect(after.dirty).toMatchObject([{ version: "2" }]);
      expect(intents).toMatchObject([{ status: "committed", targetState: "disabled" }]);
    });
  }
});

describe("User custom attributes through Admin and PostgreSQL", () => {
  test("publishes user attributes and preserves their exact values in Subject Facts", async () => {
    const { app } = createUserWriteApp();
    await createDefinition(app, userDefinition("remote", "boolean"));
    const username = "attribute-target";
    const created = await requestUserCreate(app, "REST", { username, name: "Target", userType: UserType.Formal });
    expect(created.status).toBe(200);

    const publication = createUserDocumentPublicationFixture(harness.db);
    await publication.publishPending();
    const before = await publication.get(username);
    expect(before.customAttributes).toBeUndefined();

    const changed = await requestUserUpdate(app, "REST", username, { customAttributes: { remote: false } });
    expect(changed.status).toBe(200);
    const current = await app.request(`/admin/users/${username}`);
    const detail = await current.json();
    expect(detail).toMatchObject({ data: { customAttributes: { remote: false } } });
    const prior = await publication.get(username);
    expect(prior).toEqual(before);

    await publication.publishPending();
    const published = await publication.get(username);
    expect(published.customAttributes).toEqual({ remote: false });
    expect(publication.facts.get(published.subjectIdentifier ?? "")).toMatchObject({
      facts: { profile: { customAttributes: { remote: false } } },
    });

    for (const enabled of [false, true]) {
      const toggled = await requestDefinition(app, "/enabled", { entityType: "user", code: "remote", enabled });
      expect(toggled.status).toBe(200);
      const prior = await publication.get(username);
      expect(prior.customAttributes).toEqual(enabled ? undefined : { remote: false });
      await publication.publishPending();
      const next = await publication.get(username);
      expect(next.customAttributes).toEqual(enabled ? { remote: false } : undefined);
    }
    const cleared = await requestUserUpdate(app, "REST", username, { customAttributes: { remote: null } });
    expect(cleared.status).toBe(200);
    await publication.publishPending();
    const afterClear = await publication.get(username);
    expect(afterClear).toEqual(before);
  });

  test("persists six optional types and redacts value content from audit", async () => {
    const { app } = createUserWriteApp();
    for (const [code, valueType] of [
      ["building", "text"],
      ["desk", "number"],
      ["remote", "boolean"],
      ["start", "date"],
      ["zone", "single_select"],
      ["sites", "text_list"],
    ] as const) {
      await createDefinition(app, {
        ...userDefinition(code, valueType),
        ...(code === "zone" ? { options: [{ code: "north", displayName: "北区", enabled: true }] } : {}),
      });
    }
    const values = {
      building: "private room",
      desk: 0,
      remote: false,
      start: "2024-02-29",
      zone: "north",
      sites: ["Building Z", "Building A", "Building Z"],
    };
    const created = await requestUserCreate(app, "REST", {
      username: "attribute-target",
      name: "Target",
      userType: UserType.Formal,
      customAttributes: values,
    });
    expect(created.status).toBe(200);
    const detail = await app.request("/admin/users/attribute-target");
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ data: { customAttributes: values } });
    const empty = await requestUserUpdate(app, "REST", "attribute-target", { customAttributes: {} });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ message: "至少提交一个用户更新字段" });
    const same = await requestUserUpdate(app, "REST", "attribute-target", { customAttributes: values });
    expect(await same.json()).toMatchObject({ data: { changed: false } });
    const invalid = await requestUserUpdate(app, "tRPC", "attribute-target", {
      name: "must roll back",
      customAttributes: { building: "must roll back too", start: "2026-02-29" },
    });
    expect(invalid.status).toBe(400);
    for (const customAttributes of [
      { building: 1 },
      { desk: "0" },
      { remote: "false" },
      { zone: "not_an_option" },
      { sites: "Building Z" },
    ]) {
      const response = await requestUserUpdate(app, "REST", "attribute-target", { customAttributes });
      expect(response.status).toBe(400);
    }
    const nonFinite = await app.request("/admin/users/attribute-target", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: '{"customAttributes":{"desk":1e999}}',
    });
    expect(nonFinite.status).toBe(422);
    const unchanged = await app.request("/admin/users/attribute-target");
    expect(await unchanged.json()).toMatchObject({ data: { name: "Target", customAttributes: values } });
    const cleared = await requestUserUpdate(app, "tRPC", "attribute-target", {
      name: "Updated target",
      customAttributes: { building: "", zone: null, sites: [] },
    });
    expect(cleared.status).toBe(200);
    const current = await app.request("/admin/users/attribute-target");
    expect(await current.json()).toMatchObject({
      data: { name: "Updated target", customAttributes: { desk: 0, remote: false, start: "2024-02-29" } },
    });
    const currentRow = await harness.db.query.users.findFirst({ where: { username: "attribute-target" } });
    expect(currentRow?.customAttributes).toEqual({ desk: 0, remote: false, start: "2024-02-29" });
    const audit = (await harness.db.select().from(auditLogs).orderBy(auditLogs.id)).filter(
      ({ targetType }) => targetType === "user",
    );
    expect(audit.map(({ action }) => action)).toEqual(["admin.user.create", "admin.user.update"]);
    expect(audit[0]).toMatchObject({
      targetCode: "attribute-target",
      details: {
        customAttributeChanges: [
          { attributeCode: "building", action: "set" },
          { attributeCode: "desk", action: "set" },
          { attributeCode: "remote", action: "set" },
          { attributeCode: "start", action: "set" },
          { attributeCode: "zone", action: "set" },
          { attributeCode: "sites", action: "set" },
        ],
      },
    });
    expect(audit[1]).toMatchObject({
      details: {
        customAttributeChanges: [
          { attributeCode: "building", action: "clear" },
          { attributeCode: "zone", action: "clear" },
          { attributeCode: "sites", action: "clear" },
        ],
      },
    });
    expect(JSON.stringify(audit)).not.toMatch(/private room|2024-02-29|Building Z|Building A|must roll back/u);
  });

  test("validates definition identity, option availability and definition reactivation", async () => {
    const { app } = createUserWriteApp();
    await seedUser();
    const key = { entityType: "user", code: "zone" };
    await createDefinition(app, {
      ...userDefinition("zone", "single_select"),
      options: [{ code: "north", displayName: "北区", enabled: true }],
    });
    const duplicate = await requestDefinition(app, "", userDefinition("zone", "text"));
    expect(duplicate.status).toBe(409);
    await createDefinition(app, { ...userDefinition("zone", "text"), entityType: "position" });
    const immutable = await requestDefinition(app, "/update", { ...key, patch: { valueType: "text" } });
    expect(immutable.status).toBe(422);
    const assigned = await requestUserUpdate(app, "REST", "user", { customAttributes: { zone: "north" } });
    expect(assigned.status).toBe(200);
    const edited = await requestDefinition(app, "/update", {
      ...key,
      patch: {
        displayName: "办公区域",
        description: "工作地点所在区域",
        orderNum: -3,
        options: [
          { code: "north", displayName: "北区旧址", enabled: false },
          { code: "south", displayName: "南区", enabled: true },
        ],
      },
    });
    expect(edited.status).toBe(200);
    const listed = await app.request("/admin/custom-attribute-definitions/user");
    expect(await listed.json()).toMatchObject({
      data: [{ ...key, valueType: "single_select", displayName: "办公区域" }],
    });
    const retained = await requestUserUpdate(app, "REST", "user", { customAttributes: { zone: "north" } });
    expect(await retained.json()).toMatchObject({ data: { changed: false } });
    const invalidNew = await requestUserCreate(app, "tRPC", {
      username: "other-user",
      name: "Other",
      userType: UserType.Formal,
      customAttributes: { zone: "north" },
    });
    expect(invalidNew.status).toBe(400);
    const readActive = await app.request("/admin/users/user");
    expect(await readActive.json()).toMatchObject({
      data: {
        customAttributes: { zone: "north" },
        customAttributeDefinitions: [
          {
            displayName: "办公区域",
            description: "工作地点所在区域",
            orderNum: -3,
            options: [
              { code: "north", displayName: "北区旧址", enabled: false },
              { code: "south", enabled: true },
            ],
          },
        ],
      },
    });
    const disabled = await requestDefinition(app, "/enabled", { ...key, enabled: false });
    expect(disabled.status).toBe(200);
    const disabledValue = await requestUserUpdate(app, "REST", "user", { customAttributes: { zone: "south" } });
    expect(disabledValue.status).toBe(400);
    const hidden = await app.request("/admin/users/user");
    expect(await hidden.json()).toMatchObject({ data: { customAttributes: {}, customAttributeDefinitions: [] } });
    const reenabled = await requestDefinition(app, "/enabled", { ...key, enabled: true });
    expect(reenabled.status).toBe(200);
    const shown = await app.request("/admin/users/user");
    expect(await shown.json()).toMatchObject({ data: { customAttributes: { zone: "north" } } });
    const cleared = await requestUserUpdate(app, "REST", "user", { customAttributes: { zone: null } });
    expect(cleared.status).toBe(200);
    const replaced = await requestUserUpdate(app, "REST", "user", { customAttributes: { zone: "south" } });
    expect(replaced.status).toBe(200);
    const operations = (await harness.db.select().from(auditLogs).orderBy(auditLogs.id)).filter(
      ({ targetType, details }) =>
        targetType === "custom_attribute_definition" &&
        details &&
        typeof details === "object" &&
        "entityType" in details &&
        details.entityType === "user",
    );
    expect(operations.map(({ action, targetCode }) => [action, targetCode])).toEqual([
      ["admin.custom_attribute_definition.create", "zone"],
      ["admin.custom_attribute_definition.update", "zone"],
      ["admin.custom_attribute_definition.disable", "zone"],
      ["admin.custom_attribute_definition.enable", "zone"],
    ]);
  });

  test("denies HR definition access and hides and protects stored user values", async () => {
    const command = createCommand();
    const { app } = createUserWriteApp(command);
    const hr = createUserWriteApp(command, 1).app;
    await seedUser();
    await createDefinition(app, userDefinition("building", "text"));
    const set = await requestUserUpdate(app, "REST", "user", { customAttributes: { building: "private room" } });
    expect(set.status).toBe(200);
    const blockedList = await hr.request("/admin/custom-attribute-definitions/user");
    const requestInput = encodeURIComponent(JSON.stringify({ entityType: "user" }));
    const blockedTrpcList = await hr.request(`/rpc/admin.customAttribute.list?input=${requestInput}`);
    const blockedCreate = await requestDefinition(hr, "", userDefinition("another", "text"));
    const blockedWrite = await requestUserUpdate(hr, "REST", "user", { customAttributes: { building: null } });
    expect([blockedList.status, blockedTrpcList.status, blockedCreate.status, blockedWrite.status]).toEqual([
      403, 403, 403, 403,
    ]);
    const hrDetail = await hr.request("/admin/users/user");
    expect(hrDetail.status).toBe(200);
    const body = await hrDetail.text();
    expect(body).not.toMatch(/customAttributes|customAttributeDefinitions|private room/u);
    const fullDetail = await app.request("/admin/users/user");
    expect(await fullDetail.json()).toMatchObject({ data: { customAttributes: { building: "private room" } } });
  });

  test("rolls back the user edit and audit together, then allows an explicit retry", async () => {
    const { app } = createUserWriteApp();
    await seedUser();
    await createDefinition(app, userDefinition("building", "text"));
    const failedApp = createUserWriteApp(
      createCommand((tx) => ({
        ...tx,
        auditService: {
          ...tx.auditService,
          async recordAuditLog(log) {
            await tx.auditService.recordAuditLog(log);
            throw new Error("Injected audit failure after writing to the audit log");
          },
        },
      })),
    ).app;
    const patch = { name: "Updated", customAttributes: { building: "West" } };
    const failed = await requestUserUpdate(failedApp, "tRPC", "user", patch);
    expect(failed.status).toBe(500);
    const unchanged = await app.request("/admin/users/user");
    expect(await unchanged.json()).toMatchObject({ data: { name: "Original", customAttributes: {} } });
    const afterFailure = await facts();
    expect(afterFailure.audits.map(({ action }) => action)).toEqual(["admin.custom_attribute_definition.create"]);
    expect(afterFailure.dirty).toEqual([]);
    const retry = await requestUserUpdate(app, "tRPC", "user", patch);
    expect(retry.status).toBe(200);
    const updated = await app.request("/admin/users/user");
    expect(await updated.json()).toMatchObject({ data: { name: "Updated", customAttributes: { building: "West" } } });
  });

  test("keeps independently patched keys when two edits overlap", async () => {
    const command = createCommand();
    const { app } = createUserWriteApp(command);
    await seedUser();
    await createDefinition(app, userDefinition("building", "text"));
    await createDefinition(app, userDefinition("desk", "number"));
    const firstHasLock = Promise.withResolvers<void>();
    const allowFirstSave = Promise.withResolvers<void>();
    const first = createUserWriteApp(
      createCommand((tx) => ({
        ...tx,
        userRepository: {
          ...tx.userRepository,
          async updateUserByUsername(username, data) {
            firstHasLock.resolve();
            await allowFirstSave.promise;
            return await tx.userRepository.updateUserByUsername(username, data);
          },
        },
      })),
    ).app;
    const firstWrite = requestUserUpdate(first, "REST", "user", { customAttributes: { building: "West" } });
    await firstHasLock.promise;
    const secondTakingLock = Promise.withResolvers<void>();
    const second = createUserWriteApp(
      createCommand((tx) => ({
        ...tx,
        userRepository: {
          ...tx.userRepository,
          async lockUserByUsername(username, includeDeleted) {
            secondTakingLock.resolve();
            return await tx.userRepository.lockUserByUsername(username, includeDeleted);
          },
        },
      })),
    ).app;
    const secondWrite = requestUserUpdate(second, "tRPC", "user", { customAttributes: { desk: 0 } });
    await secondTakingLock.promise;
    allowFirstSave.resolve();
    const writes = await Promise.all([firstWrite, secondWrite]);
    expect(writes.map(({ status }) => status)).toEqual([200, 200]);
    const latest = await app.request("/admin/users/user");
    expect(await latest.json()).toMatchObject({ data: { customAttributes: { building: "West", desk: 0 } } });
  });
});

describe("User mutations through production PostgreSQL UnitOfWork", () => {
  test.each(userWriteProtocols)("%s rejects unknown custom attributes without creating a user", async (protocol) => {
    const { app } = createUserWriteApp();
    const response = await requestUserCreate(app, protocol, {
      username: "attribute-target",
      name: "Target",
      userType: UserType.Formal,
      customAttributes: { unknown_code: "private value" },
    });
    expect(response.status).toBe(400);
    const user = await harness.db.query.users.findFirst({ where: { username: "attribute-target" } });
    expect(user).toBeUndefined();
  });

  test.each(userWriteProtocols)("%s unlinks WeCom from a disabled user and audits both results", async (protocol) => {
    const { app, command } = createUserWriteApp();
    const [target] = await harness.db
      .insert(users)
      .values({ username: "wecom-user", name: "User", wxId: "Private-Member", status: UserStatus.Disable })
      .returning();

    for (const changed of [true, false]) {
      const response = await requestUserUnlinkWecom(app, protocol, target!.username);
      expect(response.status).toBe(200);
      const result = { changed, result: null };
      expect(await response.json()).toMatchObject(
        protocol === "REST" ? { data: result } : { result: { data: result } },
      );
    }

    const after = await facts();
    expect(after.users).toMatchObject([{ id: target!.id, wxId: null, status: UserStatus.Disable }]);
    expect(after.audits).toMatchObject(
      [true, false].map((changed) => ({
        action: "admin.user.unlink_wecom",
        outcome: "success",
        actorType: "admin",
        actorUsername: "admin",
        actorUserId: 1,
        targetType: "user",
        targetId: target!.id,
        targetCode: "wecom-user",
        details: { changed },
      })),
    );
    expect(JSON.stringify(after.audits)).not.toContain("Private-Member");
    expect(after.dirty).toMatchObject([{ userId: target!.id, version: "1" }]);
    expect(command.revokeUserSessions).not.toHaveBeenCalled();

    const newOwner = await requestUserCreate(app, protocol, {
      username: "other",
      name: "Other User",
      userType: UserType.Formal,
      wxId: "Private-Member",
    });
    expect(newOwner.status).toBe(200);
  });

  test.each(userWriteProtocols)("%s revokes only the selected external WeCom binding", async (protocol) => {
    const { app, command } = createUserWriteApp();
    const [target, other] = await harness.db
      .insert(users)
      .values([
        { username: "target", name: "User", wxId: "Member-User", status: UserStatus.Disable },
        { username: "other", name: "Other User" },
      ])
      .returning();
    if (!target || !other) throw new Error("WeCom test users were not inserted");
    const [first, second] = await harness.db
      .insert(userWechatExternalBindings)
      .values([
        { userId: target.id, corpId: "test-corp", openId: "Private-OpenId-1234" },
        { userId: target.id, corpId: "test-corp", openId: "abc" },
      ])
      .returning();
    if (!first || !second) throw new Error("WeCom test bindings were not inserted");

    const detailResponse = await app.request("/admin/users/target");
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as { data: unknown };
    expect(detail.data).toMatchObject({
      externalWecomBindings: [
        { id: first.id, maskedOpenId: "••••1234" },
        { id: second.id, maskedOpenId: "••••" },
      ],
    });
    expect(JSON.stringify(detail)).not.toContain(first.openId);

    const wrongOwner = await requestUserUnlinkWecomExternalBinding(app, protocol, other.username, first.id);
    expect(wrongOwner.status).toBe(404);
    for (const changed of [true, false]) {
      const response = await requestUserUnlinkWecomExternalBinding(app, protocol, target.username, first.id);
      expect(response.status).toBe(200);
      const result = { changed, result: null };
      const body = await response.json();
      expect(body).toMatchObject(protocol === "REST" ? { data: result } : { result: { data: result } });
    }

    const after = await facts();
    expect(after.users.find((row) => row.id === target.id)?.wxId).toBe("Member-User");
    expect(after.audits).toMatchObject(
      [true, false].map((changed) => ({
        action: "admin.user.unlink_wecom",
        targetId: target.id,
        details: { changed, bindingId: first.id, identityType: "openid" },
      })),
    );
    expect(JSON.stringify(after.audits)).not.toContain(first.openId);
    expect(after.dirty).toHaveLength(0);
    expect(command.revokeUserSessions).not.toHaveBeenCalled();
    const activeBindings = await command.service.listWecomExternalBindings(target.id);
    expect(activeBindings).toMatchObject([{ id: second.id }]);
    const rows = await harness.db.select().from(userWechatExternalBindings).orderBy(userWechatExternalBindings.id);
    expect(rows).toMatchObject([
      { id: first.id, revokedAt: expect.any(Date) },
      { id: second.id, revokedAt: null },
    ]);
  });

  test("soft deletion releases external WeCom identities and preserves their binding history", async () => {
    const { service } = createCommand();
    const target = await seedUser();
    const [other] = await harness.db.insert(users).values({ username: "other", name: "Other User" }).returning();
    const [binding] = await harness.db
      .insert(userWechatExternalBindings)
      .values({ userId: target.id, corpId: "test-corp", openId: "Private-OpenId" })
      .returning();
    if (!other || !binding) throw new Error("WeCom test records were not inserted");

    const result = await service.deleteUser(target.username);
    expect(result).toEqual({ changed: true, result: null });
    await harness.db.insert(userWechatExternalBindings).values({
      userId: other.id,
      corpId: binding.corpId,
      openId: binding.openId,
    });
    const rows = await harness.db.select().from(userWechatExternalBindings).orderBy(userWechatExternalBindings.id);
    expect(rows).toMatchObject([
      { id: binding.id, userId: target.id, revokedAt: expect.any(Date) },
      { userId: other.id, revokedAt: null },
    ]);
  });

  test("aborts WeCom unlink when document invalidation fails", async () => {
    const [target] = await harness.db
      .insert(users)
      .values({ username: "linked", name: "Linked User", wxId: "Private-Member" })
      .returning();
    const command = createCommand((tx) => ({
      ...tx,
      userDocumentInvalidation: {
        recordChanges: async (changes) => {
          await tx.userDocumentInvalidation.recordChanges(changes);
          throw new Error("injected document invalidation failure");
        },
      },
    }));
    const { app } = createUserWriteApp(command);
    const before = await facts();

    const response = await requestUserUnlinkWecom(app, "REST", target!.username);
    expect(response.status).toBe(500);
    expect(await facts()).toEqual(before);
    expect(command.enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test.each(userWriteProtocols)(
    "%s ordinary profile edits cannot replace or clear a WeCom binding",
    async (protocol) => {
      const { app } = createUserWriteApp();
      const [target] = await harness.db
        .insert(users)
        .values({ username: "linked", name: "Linked User", wxId: "Private-Member" })
        .returning();
      const response = await requestUserUpdate(app, protocol, target!.username, { wxId: null });
      expect(response.status).toBe(400);
      const update = await requestUserUpdate(app, protocol, target!.username, { name: "Renamed User", wxId: "Other" });
      expect(update.status).toBe(200);

      const after = await facts();
      expect(after.users).toMatchObject([{ name: "Renamed User", wxId: "Private-Member" }]);
      expect(after.audits).toMatchObject([
        { action: "admin.user.update", details: { patch: { name: "Renamed User" } } },
      ]);
      expect(after.audits[0]?.details).not.toHaveProperty("patch.wxId");
    },
  );

  test.each(userWriteProtocols)("%s denies WeCom unlink to HR who can edit the user's profile", async (protocol) => {
    const [target] = await harness.db
      .insert(users)
      .values({ username: "managed", name: "Managed User", wxId: "Private-Member" })
      .returning();
    const [organization] = await harness.db
      .insert(organizations)
      .values({
        orgCode: "IN",
        orgName: "In scope",
        path: "/IN",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
      })
      .returning();
    const [position] = await harness.db.insert(positions).values({ posCode: "POS", posName: "Position" }).returning();
    await harness.db.insert(employments).values({
      userId: target!.id,
      orgId: organization!.id,
      posId: position!.id,
      status: EmploymentStatus.Enable,
    });
    const { app } = createUserWriteApp(createCommand(), organization!.id);
    const update = await requestUserUpdate(app, protocol, target!.username, { name: "HR Edit" });
    expect(update.status).toBe(200);
    const before = await facts();
    expect(before.users).toMatchObject([{ name: "HR Edit", wxId: "Private-Member" }]);

    const denied = await requestUserUnlinkWecom(app, protocol, target!.username);
    expect(denied.status).toBe(403);
    expect(await facts()).toEqual(before);
  });

  test.each([
    ["mobile", "12345678", ApiErrorCode.MobileAlreadyExists],
    ["wxId", "Member-A", ApiErrorCode.WxIdAlreadyExists],
  ] as const)(
    "disabled users retain %s until soft deletion, which preserves the old value",
    async (field, value, code) => {
      const { app } = createUserWriteApp();
      const owner = await requestUserCreate(app, "REST", {
        username: "owner",
        name: "Owner",
        userType: UserType.Formal,
        status: UserStatus.Disable,
        [field]: `  ${value}  `,
      });
      expect(owner.status).toBe(200);

      const candidate = { username: "candidate", name: "Candidate", userType: UserType.Formal };
      if (field === "mobile") expect((await requestUserCreate(app, "REST", candidate)).status).toBe(200);
      const claim = () =>
        field === "mobile"
          ? requestUserUpdate(app, "REST", candidate.username, { mobile: ` ${value}` })
          : requestUserCreate(app, "REST", { ...candidate, wxId: ` ${value}` });
      const duplicate = await claim();
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({ code });
      expect((await facts()).audits).toHaveLength(field === "mobile" ? 2 : 1);

      const removed = await app.request("/admin/users/owner", { method: "DELETE" });
      expect(removed.status).toBe(200);
      expect((await claim()).status).toBe(200);
      const after = await facts();
      expect(after.users).toMatchObject([
        { username: "owner", isDelete: true, [field]: value },
        { username: "candidate", isDelete: false, [field]: value },
      ]);
    },
  );

  test.each([
    ["mobile", "17712345678", ApiErrorCode.MobileAlreadyExists],
    ["wxId", "Member-A", ApiErrorCode.WxIdAlreadyExists],
  ] as const)("concurrent creates cannot claim the same normalized %s", async (field, value, code) => {
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const command = createCommand((tx) => ({
      ...tx,
      userRepository: {
        ...tx.userRepository,
        setUserForAdmin: async (input) => {
          if (++arrived === 2) gate.resolve();
          await gate.promise;
          return await tx.userRepository.setUserForAdmin(input);
        },
      },
    }));
    const { app } = createUserWriteApp(command);
    const responses = await Promise.all(
      ["First", "Second"].map((name, index) =>
        requestUserCreate(app, "REST", {
          username: name,
          name,
          userType: UserType.Formal,
          [field]: index === 0 ? " " + value : `${value} `,
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const rejected = responses.find((response) => response.status === 409);
    expect(await rejected?.json()).toMatchObject({ code });
    const after = await facts();
    expect(after.users).toMatchObject([{ [field]: value }]);
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toHaveLength(1);
  });

  test("stores blank contacts as null and keeps wxId case significant", async () => {
    const { app } = createUserWriteApp();
    for (const [index, wxId] of [" \t", "", "Member", "member"].entries()) {
      const created = await requestUserCreate(app, "REST", {
        username: `user-${index}`,
        name: "User",
        userType: UserType.Formal,
        mobile: " \t",
        wxId,
      });
      expect(created.status).toBe(200);
    }
    expect((await facts()).users.map(({ mobile, wxId }) => ({ mobile, wxId }))).toEqual([
      { mobile: null, wxId: null },
      { mobile: null, wxId: null },
      { mobile: null, wxId: "Member" },
      { mobile: null, wxId: "member" },
    ]);
  });

  test.each(userWriteProtocols)(
    "%s normalizes User identity writes before PostgreSQL and preserves no-op semantics",
    async (protocol) => {
      const { app } = createUserWriteApp();
      const suffix = protocol === "REST" ? "Rest" : "TrPc";
      const username = `Mixed-${suffix}`;
      const createInput = {
        username: `  ${username}  `,
        name: `  ${suffix} Name  `,
        mobile: "  12345678 \t",
        wxId: "  Mixed-Wx \t",
        userType: UserType.Formal,
      };
      const created = await requestUserCreate(app, protocol, createInput);
      expect(created.status).toBe(200);

      const updated = await requestUserUpdate(app, protocol, username, { mobile: " 12345678 " });
      expect(updated.status).toBe(200);

      const after = await facts();
      expect(after.users).toMatchObject([{ username, name: `${suffix} Name`, mobile: "12345678", wxId: "Mixed-Wx" }]);
      expect(after.audits).toMatchObject([{ action: "admin.user.create" }]);
      expect(after.dirty).toMatchObject([{ version: "1" }]);
    },
  );

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
    expect(body).toMatchObject(
      protocol === "REST"
        ? { code: ApiErrorCode.UsernameAlreadyExists, message: "用户名已存在" }
        : {
            error: {
              message: "用户名已存在",
              data: { code: "CONFLICT", serviceCode: ApiErrorCode.UsernameAlreadyExists },
            },
          },
    );
    const after = await facts();
    expect(after).toEqual(before);
    expect(command.random.password).not.toHaveBeenCalled();
  });

  test("concurrent username creates reach the real unique constraint and only one commits", async () => {
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const { service } = createCommand((tx) => ({
      ...tx,
      userRepository: {
        ...tx.userRepository,
        getAnyUserByUsername: async (username) => {
          const row = await tx.userRepository.getAnyUserByUsername(username);
          if (++arrived === 2) gate.resolve();
          await gate.promise;
          return row;
        },
      },
    }));
    const results = await Promise.allSettled(
      ["First", "Second"].map((name) => service.setUserForAdmin({ username: "user", name, userType: UserType.Formal })),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(UsernameAlreadyExistsError);
    const after = await facts();
    expect(after.users).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toMatchObject([{ version: "1" }]);
  });

  test("transaction precheck catches a tombstone appearing after the root precheck", async () => {
    const { service } = createCommand((tx) => ({
      ...tx,
      userRepository: {
        ...tx.userRepository,
        getAnyUserByUsername: async (username) => {
          await seedUser(UserStatus.Enable, true);
          return await tx.userRepository.getAnyUserByUsername(username);
        },
      },
    }));
    const error = await failure(() =>
      service.setUserForAdmin({ username: "user", name: "Duplicate", userType: UserType.Formal }),
    );
    expect(error).toBeInstanceOf(UsernameAlreadyExistsError);
    const after = await facts();
    expect(after.users).toMatchObject([{ isDelete: true, password: "old-hash" }]);
    expect(after.audits).toEqual([]);
    expect(after.dirty).toEqual([]);
  });

  test("create reports committed failure when Subject Access repair preparation fails", async () => {
    const { service } = createCommand(undefined, new Error("repair unavailable"));
    const error = await failure(() =>
      service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }),
    );
    expect(error).toBeInstanceOf(AdminMutationCommittedError);
    const after = await facts();
    expect(after.users).toHaveLength(1);
    expect(after.audits).toMatchObject([{ details: { changed: true } }]);
    expect(after.dirty).toMatchObject([{ version: "1" }]);
    expect(JSON.stringify(error)).not.toContain("Random123!");
  });

  test("create failure before commit preserves the original failure and rolls back", async () => {
    const sentinel = new Error("audit unavailable");
    const { service, enqueueRebuildJobs } = createCommand((tx) => ({
      ...tx,
      auditService: {
        ...tx.auditService,
        recordAuditLog: async (input) => {
          await tx.auditService.recordAuditLog(input);
          throw sentinel;
        },
      },
    }));
    const error = await failure(() =>
      service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }),
    );
    expect(error).toBe(sentinel);
    const after = await facts();
    expect(after).toEqual({ users: [], audits: [], dirty: [] });
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("zero-row create fails closed", async () => {
    const { service } = createCommand((tx) => ({
      ...tx,
      userRepository: { ...tx.userRepository, setUserForAdmin: async () => null },
    }));
    const error = await failure(() =>
      service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }),
    );
    expect(error).toBeInstanceOf(Error);
    const after = await facts();
    expect(after).toEqual({ users: [], audits: [], dirty: [] });
  });

  test("create returns a safe resource and one-time password with committed audit and dirty", async () => {
    const { service } = createCommand();
    const result = await service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal });
    expect(result).toMatchObject({
      changed: true,
      result: {
        username: "user",
        generatedPassword: "Random123!",
        user: { username: "user", name: "User" },
      },
    });
    expect(result.result.user).not.toHaveProperty("password");
    const after = await facts();
    expect(after.users[0]).toMatchObject({ password: "hash:Random123!", subjectIdentifier: expect.any(String) });
    expect(after.audits).toMatchObject([
      { action: "admin.user.create", details: { changed: true, passwordProvided: false } },
    ]);
    expect(after.dirty).toMatchObject([{ userId: after.users[0]!.id, version: "1" }]);
    expect(JSON.stringify(after.audits)).not.toContain("Random123!");
    expect(JSON.stringify(result)).not.toContain("hash:");
  });

  test("soft-deleted usernames remain occupied before lifecycle work", async () => {
    await seedUser(UserStatus.Enable, true);
    const { service, random } = createCommand();
    const before = await facts();
    const error = await failure(() =>
      service.setUserForAdmin({ username: "user", name: "Duplicate", userType: UserType.Formal }),
    );
    expect(error).toBeInstanceOf(UsernameAlreadyExistsError);
    expect(random.password).not.toHaveBeenCalled();
    const after = await facts();
    expect(after).toEqual(before);
  });

  test("real unique violation retains Drizzle cause and unknown constraints remain internal", async () => {
    await seedUser();
    const raw = await failure(
      async () =>
        await harness.db.insert(users).values({ username: "user", name: "Duplicate", userType: UserType.Formal }),
    );
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)?.code).toBe("23505");
    await harness.sql`create unique index user_test_name_unique on "user"(name)`;
    try {
      const before = await facts();
      const error = await failure(() =>
        createCommand().service.setUserForAdmin({ username: "other", name: "Original", userType: UserType.Formal }),
      );
      expect(error).not.toBeInstanceOf(UsernameAlreadyExistsError);
      expect(extractPostgresError(error)).toEqual({ code: "23505", constraint: "user_test_name_unique" });
      const after = await facts();
      expect(after).toEqual(before);
    } finally {
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
    const same = await service.updateUser("user", { name: "Original", mobile: "13800000000" });
    expect(same).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after).toEqual(before);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  for (const stage of ["audit", "dirty"] as const) {
    test(`profile edit rolls back source/audit/dirty when ${stage} fails`, async () => {
      await seedUser();
      const sentinel = new Error(`injected ${stage}`);
      const { service, enqueueRebuildJobs } = createCommand((tx) => ({
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
              userDocumentInvalidation: {
                recordChanges: async (changes) => {
                  await tx.userDocumentInvalidation.recordChanges(changes);
                  throw sentinel;
                },
              },
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
    expect(observed?.dirty).toMatchObject([{ userId: user.id, version: "1" }]);
    expect(JSON.stringify(observed?.audits)).not.toContain("13912345678");
  });

  for (const method of ["updateUserByUsername", "setPassword"] as const) {
    test(`zero-row ${method} does not fabricate audit, dirty or session revocation`, async () => {
      await seedUser();
      const { service, revokeUserSessions } = createCommand((tx) => ({
        ...tx,
        userRepository: { ...tx.userRepository, [method]: async () => null },
      }));
      const before = await facts();
      const error = await failure(() =>
        method === "setPassword"
          ? service.resetPasswordByUsername("user")
          : service.updateUser("user", { name: "Changed" }),
      );
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
      const first = createCommand((tx) => ({
        ...tx,
        userRepository: {
          ...tx.userRepository,
          updateUserByUsername: async (username, patch) => {
            const row = await tx.userRepository.updateUserByUsername(username, patch);
            written.resolve();
            await release.promise;
            return row;
          },
        },
      })).service;
      const firstPending = first.updateUser("user", { mobile: "13912345678" });
      await Promise.race([written.promise, firstPending]);
      const secondPending = createCommand().service.updateUser(
        "user",
        secondOperation === "other-field" ? { name: "Changed" } : { mobile: "13912345678" },
      );
      try {
        const deadline = Date.now() + 2000;
        let blocked = false;
        while (!blocked && Date.now() < deadline) {
          const rows = await harness.sql<{ blocked: boolean }[]>`select exists (
          select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'
          and query like '%"user"%' and application_name = current_setting('application_name')
          and pid <> pg_backend_pid()
        ) as blocked`;
          blocked = rows[0]!.blocked;
        }
        expect(blocked).toBe(true);
      } finally {
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
      expect(after.dirty).toMatchObject([{ version: secondOperation === "other-field" ? "2" : "1" }]);
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
