import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createRoleAdapter } from "@admin-api/routes/admin/role/role.adapter";
import { createRoleRoute } from "@admin-api/routes/admin/role/role.index";
import type { AdminRoleTransactionPorts } from "@admin-api/services/role/role.port";
import { createRoleService } from "@admin-api/services/role/role.service";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createRoleAssignmentResolver } from "@iam/assignment-resolution/role-assignment";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  RoleAssignmentTargetType,
  RoleStatus,
  UserDocumentRebuildReason,
  UserDocumentWorkStatus,
  UserType,
} from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import {
  auditLogs,
  clients,
  employments,
  organizationClosures,
  organizations,
  positions,
  roles,
  userDocumentRebuildStates,
  userDocuments,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { StoredUserDocumentSchema } from "@iam/documents/user/document";
import {
  createCurrentUserDocumentProjectionBundle,
  createUserDocumentUpdateProcessor,
} from "@iam/documents/user/worker";
import { ClientNotFoundError } from "@iam/domain/client";
import {
  RoleAssignmentExistsError,
  RoleAssignmentTargetNotFoundError,
  RoleCodeExistsError,
  RoleHasAssignmentError,
  RoleNotFoundError,
} from "@iam/domain/role";
import { BadRequestError } from "@iam/runtime/errors";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { addTestAdminAuthorizationMiddleware } from "../../src/testing/admin-authorization";
import type { AdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createUserDocumentSourceConsumer } from "../support/user-document-workflow";

let harness: AdminApiPostgresTestHarness;
const now = new Date("2026-09-07T00:00:00Z");
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
  await harness.sql`truncate role_assignment, role, client, user_document restart identity cascade`;
});
afterAll(async () => {
  await harness?.close();
});

function createCommand(decorate: (tx: AdminRoleTransactionPorts) => AdminRoleTransactionPorts = (tx) => tx) {
  const enqueueRebuildJobs = mock(async () => ({
    enqueued: 1,
    jobIds: ["role-job"],
  }));
  const uow = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn: mock(() => undefined) },
    clock: { nowDate: () => now },
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries() {
        return { enqueued: 0 };
      },
    },
    userDocumentJobProducer: createUserDocumentSourceConsumer(harness.db, enqueueRebuildJobs, { nowDate: () => now }),
  });
  return {
    enqueueRebuildJobs,
    service: createRoleService({
      roleRepository: createAdminApiRepositories(harness.db).role,
      uow: mapUnitOfWork(uow, (tx) =>
        decorate({
          roleRepository: tx.repositories.role,
          auditService: tx.auditService,
          userDocumentInvalidation: tx.userDocumentInvalidation,
        }),
      ),
    }),
  };
}

test("Admin role transports manage Global Roles with an explicit type and no Client", async () => {
  await seedRole("test-client:existing");
  const adapter = createRoleAdapter({ roleService: createCommand().service });
  const app = new Hono();
  addTestAdminAuthorizationMiddleware(app);
  app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
  app.route("/admin", createRoleRoute(adapter));
  app.all("/rpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: adapter.roleAdminRouter,
      createContext: () => ({ hono: c }),
    }),
  );
  const request = (path: string, body: object, method = "POST") =>
    app.request(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const global = { roleType: "global", roleCode: "global:reviewer", roleName: "Reviewer" };
  const created = await request("/admin/roles", global);
  expect(created.status).toBe(200);
  expect(await created.json()).toMatchObject({
    data: { changed: true, result: { roleType: "global", roleCode: "global:reviewer", clientId: null, client: null } },
  });

  const legacy = await request("/rpc/create", {
    roleCode: "test-client:reader",
    roleName: "Reader",
    clientCode: "test-client",
  });
  expect(legacy.status).toBe(200);
  expect(await legacy.json()).toMatchObject({
    result: { data: { changed: true, result: { roleType: "client", client: { clientCode: "test-client" } } } },
  });

  for (const [path, body] of [
    ["/rpc/create", { ...global, clientCode: "test-client" }],
    ["/admin/roles", { ...global, roleType: undefined, clientCode: "test-client" }],
    ["/admin/roles", { ...global, roleCode: "reviewer" }],
    ["/rpc/create", { ...global, roleCode: "global: " }],
  ] as const) {
    const rejected = await request(path, body);
    expect(rejected.status).toBe(path.startsWith("/rpc") ? 400 : 422);
  }

  for (const [exactConditions, expected] of [
    [{}, ["test-client:existing", "global:reviewer", "test-client:reader"]],
    [{ roleType: "global" }, ["global:reviewer"]],
    [{ clientCode: "test-client" }, ["test-client:existing", "test-client:reader"]],
  ] as const) {
    const search = await request("/admin/roles/search", {
      pageNum: 1,
      pageSize: 10,
      conditions: { fuzzyConditions: {}, exactConditions },
    });
    expect(search.status).toBe(200);
    const { data } = z
      .object({ data: z.object({ total: z.number(), result: z.array(z.object({ roleCode: z.string() })) }) })
      .parse(await search.json());
    expect(data.total).toBe(expected.length);
    expect(data.result.map((role) => role.roleCode)).toEqual([...expected]);
  }

  const update = await request("/rpc/update", {
    roleCode: "global:reviewer",
    data: { roleName: "Updated", roleType: "client", clientCode: "test-client" },
  });
  expect(update.status).toBe(400);
  const hrApp = new Hono();
  addTestAdminAuthorizationMiddleware(hrApp, ["iam:hr-admin"]);
  hrApp.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
  hrApp.route("/admin", createRoleRoute(adapter));
  const denied = await hrApp.request("/admin/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...global, roleCode: "global:blocked" }),
  });
  expect(denied.status).toBe(403);

  const detail = await app.request("/admin/roles/global%3Areviewer");
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({ data: { roleName: "Reviewer", roleType: "global", client: null } });
  const deleted = await app.request("/admin/roles/global%3Areviewer", { method: "DELETE" });
  expect(deleted.status).toBe(200);
  const occupied = await request("/rpc/create", global);
  expect(occupied.status).toBe(409);
});

test("PostgreSQL rejects invalid Role ownership and reserved codes", async () => {
  const clientRole = await seedRole("test-client:existing");
  for (const [roleType, roleCode, clientId] of [
    ["client", "test-client:missing", null],
    ["client", "global:reserved", clientRole.clientId],
    ["global", "global:owned", clientRole.clientId],
    ["global", "missing-prefix", null],
    ["global", "global:", null],
    ["global", "global: \t\r\n", null],
    ["global", "global:\uFEFF", null],
    ["global", "global:\u00A0\uFEFF\u2028\u3000", null],
    ["unknown", "unknown-type", null],
  ] as const) {
    const error = await failure(
      () => harness.sql`
      INSERT INTO role (role_type, role_code, role_name, client_id)
      VALUES (${roleType}, ${roleCode}, 'Invalid role', ${clientId})`,
    );
    expect(extractPostgresError(error)).toEqual({ code: "23514", constraint: "role_type_ownership_check" });
  }
  const orphaned = await failure(
    () => harness.sql`
    INSERT INTO role (role_code, role_name, client_id)
    VALUES ('missing:role', 'Missing owner', 99999)`,
  );
  expect(extractPostgresError(orphaned)).toEqual({ code: "23503", constraint: "role_client_id_fkey" });

  const roleCode = "global:\uFEFFreviewer\u00A0";
  const valid = await harness.sql`INSERT INTO role (role_type, role_code, role_name)
    VALUES ('global', ${roleCode}, 'Reviewer') RETURNING role_code`;
  expect([...valid]).toEqual([{ role_code: roleCode }]);
});

async function seedRole(roleCode = "ROLE") {
  let client = await harness.db.query.clients.findFirst({
    where: { clientCode: "test-client" },
  });
  if (!client) {
    [client] = await harness.db
      .insert(clients)
      .values({
        clientCode: "test-client",
        clientName: "Test",
        clientSecret: "synthetic",
        extAttributes: {},
      })
      .returning();
  }
  const [role] = await harness.db
    .insert(roles)
    .values({ roleCode, roleName: roleCode, clientId: client!.id })
    .returning();
  return role!;
}

test("loads names only for the requested role identities, including duplicate names", async () => {
  const first = await seedRole("APP:ADMIN");
  const second = await seedRole("OTHER:ADMIN");
  await seedRole("UNRELATED");
  await harness.db.update(roles).set({ roleName: "管理员" }).where(eq(roles.id, first.id));
  await harness.db.update(roles).set({ roleName: "管理员" }).where(eq(roles.id, second.id));
  const repository = createAdminApiRepositories(harness.db).role;
  const names = await repository.getRoleNamesByIds([first.id, second.id, first.id]);
  expect(names.sort((a, b) => a.roleCode.localeCompare(b.roleCode))).toEqual([
    { roleCode: "APP:ADMIN", roleName: "管理员" },
    { roleCode: "OTHER:ADMIN", roleName: "管理员" },
  ]);
  const empty = await repository.getRoleNamesByIds([]);
  expect(empty).toEqual([]);
});

async function seedHolder(roleId: number, targetType = RoleAssignmentTargetType.Employment) {
  const [user] = await harness.db
    .insert(users)
    .values({ username: "holder", name: "Holder", userType: UserType.Formal })
    .returning();
  const [organization] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "ORG",
      orgName: "Organization",
      path: "/1",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    })
    .returning();
  await harness.db.insert(organizationClosures).values({
    ancestorId: organization!.id,
    descendantId: organization!.id,
    depth: 0,
  });
  const [position] = await harness.db
    .insert(positions)
    .values({ posCode: "POSITION", posName: "Position" })
    .returning();
  const [employment] = await harness.db
    .insert(employments)
    .values({
      userId: user!.id,
      orgId: organization!.id,
      posId: position!.id,
      status: EmploymentStatus.Enable,
      startTime: new Date("2026-08-01T00:00:00Z"),
    })
    .returning();
  const [assignment] = await harness.db
    .insert(roleAssignments)
    .values({
      roleId,
      targetType,
      targetId: targetType === RoleAssignmentTargetType.Organization ? organization!.id : employment!.id,
      includeDescendants: false,
    })
    .returning();
  return {
    user: user!,
    employment: employment!,
    assignment: assignment!,
    organization: organization!,
  };
}

async function facts() {
  return {
    roles: await harness.db.select().from(roles).orderBy(roles.id),
    assignments: await harness.db.select().from(roleAssignments).orderBy(roleAssignments.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    dirty: await harness.db.select().from(userDocumentRebuildStates),
  };
}

test("searches employment role assignments by the displayed organization and position", async () => {
  const role = await seedRole();
  const holder = await seedHolder(role.id);
  const { service } = createCommand();
  for (const text of ["Organization", "org", "Position", "position", "Holder"]) {
    const page = await service.searchAssignments(role.roleCode, {
      pageNum: 1,
      pageSize: 1,
      conditions: {
        fuzzyConditions: { text },
        exactConditions: { targetType: RoleAssignmentTargetType.Employment, includeDescendants: false },
      },
    });
    expect(page.total).toBe(1);
    expect(page.result.map((row) => row.id)).toEqual([holder.assignment.id]);
  }
  const empty = await service.searchAssignments(role.roleCode, {
    pageNum: 1,
    pageSize: 1,
    conditions: { fuzzyConditions: { text: "no-such-target" }, exactConditions: {} },
  });
  expect(empty).toMatchObject({ result: [], total: 0 });
});

async function failure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected command failure");
}

async function waitForBlocked(table: "role" | "role_assignment", count = 1) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [row] = await harness.sql<{ blocked: boolean }[]>`
      select (select count(*) from pg_stat_activity
        where wait_event_type = 'Lock' and query like ${`%"${table}"%`}
        and application_name = current_setting('application_name') and pid <> pg_backend_pid()) >= ${count} as blocked
    `;
    if (row!.blocked) return;
  }
  throw new Error(`Expected independent transaction waiting on ${table}`);
}

async function publish(userId: number, version: string) {
  const processor = createUserDocumentUpdateProcessor({
    db: harness.db,
    projection: createCurrentUserDocumentProjectionBundle(),
    clock: { nowDate: () => now },
    batchSize: 10,
    logger: { warn() {} },
    jobProducer: {
      enqueueOutboxEntries: async () => ({ enqueued: 0, jobIds: [] }),
      enqueueRebuildJobs: async () => ({ enqueued: 0, jobIds: [] }),
    },
    subjectFactsPublisher: { publish: async () => ({ status: "published" }) },
    subjectAccessRepair: { repairSubject: async () => ({ status: "stable" }) },
  });
  const result = await processor.process({
    userId,
    version: version,
    reason: UserDocumentRebuildReason.ManualRebuild,
  });
  expect(result.status).toBe("rebuilt");
  const [row] = await harness.db
    .select({ document: userDocuments.document })
    .from(userDocuments)
    .where(eq(userDocuments.userId, userId));
  return { document: StoredUserDocumentSchema.parse(row?.document) };
}

describe("Role mutations through production PostgreSQL UnitOfWork", () => {
  for (const entry of ["status", "profile"] as const) {
    test(`a waiting ${entry} observes Pause without resetting status or duplicating dirty`, async () => {
      const role = await seedRole();
      const { user } = await seedHolder(role.id);
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand((tx) => ({
        ...tx,
        roleRepository: {
          ...tx.roleRepository,
          updateRoleByCode: async (...args) => {
            const row = await tx.roleRepository.updateRoleByCode(...args);
            written.resolve();
            await release.promise;
            return row;
          },
        },
      })).service;
      const pending = first.updateRoleStatus("ROLE", RoleStatus.Pause);
      await Promise.race([written.promise, pending]);
      const second = createCommand().service;
      const competing =
        entry === "status"
          ? second.updateRoleStatus("ROLE", RoleStatus.Pause)
          : second.updateRole("ROLE", { roleName: "New name" });
      try {
        await waitForBlocked("role");
      } finally {
        release.resolve();
        await Promise.allSettled([pending, competing]);
      }
      const result = await competing;
      expect(result).toEqual({ changed: entry === "profile", result: null });
      const after = await facts();
      expect(after.roles[0]).toMatchObject({
        status: RoleStatus.Pause,
        roleName: entry === "profile" ? "New name" : "ROLE",
      });
      expect(after.audits).toMatchObject([
        { details: { changed: true } },
        { details: { changed: entry === "profile" } },
      ]);
      expect(after.dirty).toMatchObject([{ userId: user.id, version: "1" }]);
    });
  }

  test("unknown Assignment unique constraints preserve the production cause and roll back", async () => {
    const role = await seedRole();
    const { employment } = await seedHolder(role.id);
    const other = await seedRole("OTHER");
    await harness.sql`create unique index assignment_test_target_unique on role_assignment(target_type, target_id)`;
    try {
      const before = await facts();
      const error = await failure(() =>
        createCommand().service.createAssignment(other.roleCode, {
          targetType: RoleAssignmentTargetType.Employment,
          employmentId: employment.id,
        }),
      );
      expect(error).not.toBeInstanceOf(RoleAssignmentExistsError);
      expect(error).toHaveProperty("cause");
      expect(extractPostgresError(error)).toEqual({
        code: "23505",
        constraint: "assignment_test_target_unique",
      });
      const after = await facts();
      expect(after).toEqual(before);
    } finally {
      await harness.sql`drop index assignment_test_target_unique`;
    }
  });

  for (const entry of ["status", "profile-status"] as const) {
    test(`${entry} after a concurrent Pause registers the actual Enable change and invalidates published authorization`, async () => {
      const role = await seedRole();
      const { user, employment } = await seedHolder(role.id);
      await harness.db.insert(userDocumentRebuildStates).values({
        userId: user.id,
        version: "1",
        status: UserDocumentWorkStatus.Pending,
      });
      await publish(user.id, "1");
      const firstWritten = Promise.withResolvers<void>();
      const releaseFirst = Promise.withResolvers<void>();
      const secondReady = Promise.withResolvers<void>();
      const releaseSecond = Promise.withResolvers<void>();
      const first = createCommand((tx) => ({
        ...tx,
        roleRepository: {
          ...tx.roleRepository,
          updateRoleByCode: async (code, patch) => {
            const row = await tx.roleRepository.updateRoleByCode(code, patch);
            firstWritten.resolve();
            await releaseFirst.promise;
            return row;
          },
        },
      })).service;
      const second = createCommand((tx) => ({
        ...tx,
        roleRepository: {
          ...tx.roleRepository,
          updateRoleByCode: async (code, patch) => {
            secondReady.resolve();
            await releaseSecond.promise;
            return await tx.roleRepository.updateRoleByCode(code, patch);
          },
        },
      })).service;
      const firstPending = first.updateRoleStatus("ROLE", RoleStatus.Pause);
      await Promise.race([firstWritten.promise, firstPending]);
      const secondPending =
        entry === "status"
          ? second.updateRoleStatus("ROLE", RoleStatus.Enable)
          : second.updateRole("ROLE", { status: RoleStatus.Enable });
      try {
        await waitForBlocked("role");
        releaseFirst.resolve();
        const firstResult = await firstPending;
        expect(firstResult).toEqual({ changed: true, result: null });
        await Promise.race([secondReady.promise, secondPending]);
        const paused = await publish(user.id, "2");
        expect(paused.document.employments[0]!.clientAuthorizations).toEqual([]);
      } finally {
        releaseFirst.resolve();
        releaseSecond.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const result = await secondPending;
      expect(result).toEqual({ changed: true, result: null });
      const after = await facts();
      expect(after.roles[0]!.status).toBe(RoleStatus.Enable);
      expect(after.audits).toMatchObject([
        { details: { changed: true, status: RoleStatus.Pause } },
        { details: { changed: true, status: RoleStatus.Enable } },
      ]);
      expect(after.dirty).toMatchObject([
        {
          userId: user.id,
          version: "3",
          status: UserDocumentWorkStatus.Pending,
        },
      ]);
      const [stalePublished] = await harness.db.select().from(userDocuments);
      expect(stalePublished!.sourceVersion).toBe("2");
      const resolver = createRoleAssignmentResolver(harness.db);
      if (role.clientId === null) throw new Error("Expected a Client Role");
      const effective = await resolver.resolveEffectiveRoles({
        employmentIds: [employment.id],
        clientId: role.clientId,
      });
      expect(effective.get(employment.id)).toEqual([{ id: role.id, roleCode: "ROLE" }]);
      const otherClient = await resolver.resolveEffectiveRoles({
        employmentIds: [employment.id],
        clientId: role.clientId + 1,
      });
      expect(otherClient.get(employment.id)).toEqual([]);
      const rebuilt = await publish(user.id, "3");
      expect(rebuilt.document.employments[0]!.clientAuthorizations).toMatchObject([
        { clientCode: "test-client", roles: [{ code: "ROLE" }] },
      ]);
    });
  }

  test("profile no-op is silent while both explicit status entries preserve intent without dirty", async () => {
    const role = await seedRole();
    await seedHolder(role.id);
    const { service, enqueueRebuildJobs } = createCommand();
    const before = await facts();
    const profile = await service.updateRole("ROLE", {
      roleName: "ROLE",
      description: null,
    });
    expect(profile).toEqual({ changed: false, result: null });
    expect(await facts()).toEqual(before);
    const status = await service.updateRoleStatus("ROLE", RoleStatus.Enable);
    const profileStatus = await service.updateRole("ROLE", {
      status: RoleStatus.Enable,
    });
    expect(status).toEqual({ changed: false, result: null });
    expect(profileStatus).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after.roles).toEqual(before.roles);
    expect(after.dirty).toEqual([]);
    expect(after.audits).toMatchObject([{ details: { changed: false } }, { details: { changed: false } }]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("missing, empty, assignment blocker and repeated deletes never fabricate changes", async () => {
    const { service } = createCommand();
    expect(await failure(() => service.updateRole("MISSING", {}))).toBeInstanceOf(BadRequestError);
    for (const command of [
      () => service.deleteRole("MISSING"),
      () => service.updateRole("MISSING", { roleName: "Name" }),
      () => service.updateRoleStatus("MISSING", RoleStatus.Pause),
    ]) {
      expect(await failure(command)).toBeInstanceOf(RoleNotFoundError);
    }
    const role = await seedRole();
    const { assignment } = await seedHolder(role.id);
    expect(await failure(() => service.deleteRole("ROLE"))).toBeInstanceOf(RoleHasAssignmentError);
    const deleted = await service.deleteAssignment("ROLE", assignment.id);
    expect(deleted).toEqual({ changed: true, result: null });
    const before = await facts();
    expect(await failure(() => service.deleteAssignment("ROLE", assignment.id))).toBeInstanceOf(
      RoleAssignmentTargetNotFoundError,
    );
    expect(await facts()).toEqual(before);
    expect(await service.deleteRole("ROLE")).toEqual({
      changed: true,
      result: null,
    });
    const afterDelete = await facts();
    expect(await failure(() => service.deleteRole("ROLE"))).toBeInstanceOf(RoleNotFoundError);
    expect(await facts()).toEqual(afterDelete);
  });

  test.each(["delete", "assign"] as const)(
    "when %s holds the Role first, creation and deletion cannot both commit",
    async (first) => {
      const role = await seedRole();
      const { employment, user } = await seedHolder(role.id);
      await harness.db.delete(roleAssignments);
      const ready = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const firstService = createCommand((tx) => ({
        ...tx,
        roleRepository: {
          ...tx.roleRepository,
          async countAssignmentsByRoleId(roleId) {
            const count = await tx.roleRepository.countAssignmentsByRoleId(roleId);
            ready.resolve();
            await release.promise;
            return count;
          },
          async createAssignment(input) {
            const assignment = await tx.roleRepository.createAssignment(input);
            ready.resolve();
            await release.promise;
            return assignment;
          },
        },
      })).service;
      const secondService = createCommand().service;
      const assignment = {
        targetType: RoleAssignmentTargetType.Employment,
        employmentId: employment.id,
      };
      const firstPending =
        first === "delete"
          ? firstService.deleteRole(role.roleCode)
          : firstService.createAssignment(role.roleCode, assignment);
      let secondResult: PromiseSettledResult<unknown> | undefined;
      let competing: Promise<unknown> | undefined;
      try {
        await Promise.race([ready.promise, firstPending]);
        competing =
          first === "delete"
            ? secondService.createAssignment(role.roleCode, assignment)
            : secondService.deleteRole(role.roleCode);
        const completed = Promise.allSettled([competing]);
        // The competing command either waits on the Role or settles while the first transaction is open.
        await Promise.race([waitForBlocked("role"), completed]);
        release.resolve();
        await firstPending;
        [secondResult] = await completed;
      } finally {
        release.resolve();
        await Promise.allSettled([firstPending, competing]);
      }

      const after = await facts();
      expect(secondResult).toEqual({
        status: "rejected",
        reason: expect.any(first === "delete" ? RoleNotFoundError : RoleHasAssignmentError),
      });
      expect(after.roles[0]?.isDelete).toBe(first === "delete");
      expect(after.assignments).toEqual(
        first === "delete" ? [] : [expect.objectContaining({ roleId: role.id, targetId: employment.id })],
      );
      expect(after.audits).toMatchObject([
        { action: first === "delete" ? "admin.role.delete" : "admin.role.assignment.create" },
      ]);
      expect(after.dirty).toMatchObject(first === "delete" ? [] : [{ userId: user.id, version: "1" }]);
    },
  );

  test("organization assignment scope no-op audits intent, change and delete each increment dirty once", async () => {
    const role = await seedRole();
    const { assignment, user } = await seedHolder(role.id, RoleAssignmentTargetType.Organization);
    const { service } = createCommand();
    expect(await service.updateAssignmentScope("ROLE", assignment.id, false)).toEqual({ changed: false, result: null });
    const noOp = await facts();
    expect(noOp.dirty).toEqual([]);
    expect(noOp.audits).toMatchObject([{ details: { changed: false } }]);
    expect(await service.updateAssignmentScope("ROLE", assignment.id, true)).toEqual({ changed: true, result: null });
    expect(await service.deleteAssignment("ROLE", assignment.id)).toEqual({
      changed: true,
      result: null,
    });
    const after = await facts();
    expect(after.assignments).toEqual([]);
    expect(after.dirty).toMatchObject([{ userId: user.id, version: "2" }]);
    expect(after.audits).toMatchObject([
      { details: { changed: false } },
      { details: { changed: true } },
      { details: { changed: true } },
    ]);
  });

  for (const stage of ["audit", "dirty"] as const) {
    for (const operation of ["status", "assignment-scope", "assignment-delete", "assignment-create"] as const) {
      test(`${operation} rolls back source/audit/dirty when ${stage} fails`, async () => {
        const role = await seedRole();
        const { assignment } = await seedHolder(role.id, RoleAssignmentTargetType.Organization);
        if (operation === "assignment-create") await harness.db.delete(roleAssignments);
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
        const error = await failure(() =>
          operation === "status"
            ? service.updateRoleStatus("ROLE", RoleStatus.Pause)
            : operation === "assignment-scope"
              ? service.updateAssignmentScope("ROLE", assignment.id, true)
              : operation === "assignment-delete"
                ? service.deleteAssignment("ROLE", assignment.id)
                : service.createAssignment("ROLE", {
                    targetType: RoleAssignmentTargetType.Organization,
                    orgCode: "ORG",
                    includeDescendants: false,
                  }),
        );
        expect(error).toBe(sentinel);
        expect(await facts()).toEqual(before);
        expect(enqueueRebuildJobs).not.toHaveBeenCalled();
      });
    }
  }

  for (const method of [
    "createRole",
    "updateRoleByCode",
    "softDeleteRoleByCode",
    "createAssignment",
    "updateAssignmentScope",
    "deleteAssignment",
  ] as const) {
    test(`zero-row ${method} fails closed without audit or dirty`, async () => {
      const role = await seedRole();
      const { assignment } = await seedHolder(role.id, RoleAssignmentTargetType.Organization);
      if (method === "softDeleteRoleByCode" || method === "createAssignment") await harness.db.delete(roleAssignments);
      const { service } = createCommand((tx) => ({
        ...tx,
        roleRepository: { ...tx.roleRepository, [method]: async () => null },
      }));
      const before = await facts();
      const error = await failure(() =>
        method === "createRole"
          ? service.createRole({
              roleCode: "NEW",
              roleName: "New",
              clientCode: "test-client",
              status: RoleStatus.Enable,
            })
          : method === "updateRoleByCode"
            ? service.updateRole("ROLE", { roleName: "New" })
            : method === "softDeleteRoleByCode"
              ? service.deleteRole("ROLE")
              : method === "createAssignment"
                ? service.createAssignment("ROLE", {
                    targetType: RoleAssignmentTargetType.Organization,
                    orgCode: "ORG",
                  })
                : method === "updateAssignmentScope"
                  ? service.updateAssignmentScope("ROLE", assignment.id, true)
                  : service.deleteAssignment("ROLE", assignment.id),
      );
      expect(error).toBeInstanceOf(Error);
      expect(await facts()).toEqual(before);
    });
  }

  test("requires an existing client before checking the role code during insert", async () => {
    await seedRole();
    const { service } = createCommand();
    const before = await facts();
    const error = await failure(() =>
      service.createRole({
        roleCode: "ROLE",
        roleName: "Duplicate",
        clientCode: "MISSING",
        status: RoleStatus.Enable,
      }),
    );
    expect(error).toBeInstanceOf(ClientNotFoundError);
    expect(await facts()).toEqual(before);
  });

  test("soft-deleted role codes remain occupied and real unknown constraints stay internal", async () => {
    await seedRole();
    const { service } = createCommand();
    const raw = await failure(() =>
      harness.db.insert(roles).values({ roleCode: "ROLE", roleName: "Duplicate", clientId: 1 }),
    );
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)?.code).toBe("23505");
    await service.deleteRole("ROLE");
    expect(
      await failure(() =>
        service.createRole({
          roleCode: "ROLE",
          roleName: "New",
          clientCode: "test-client",
          status: RoleStatus.Enable,
        }),
      ),
    ).toBeInstanceOf(RoleCodeExistsError);
    await harness.sql`create unique index role_test_name_unique on role(role_name)`;
    try {
      const before = await facts();
      const error = await failure(() =>
        service.createRole({
          roleCode: "OTHER",
          roleName: "ROLE",
          clientCode: "test-client",
          status: RoleStatus.Enable,
        }),
      );
      expect(error).not.toBeInstanceOf(RoleCodeExistsError);
      expect(extractPostgresError(error)).toEqual({
        code: "23505",
        constraint: "role_test_name_unique",
      });
      expect(await facts()).toEqual(before);
    } finally {
      await harness.sql`drop index role_test_name_unique`;
    }
  });

  test("concurrent role creates reach independent writes and unique constraint maps loser to 409", async () => {
    await seedRole();
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const { service } = createCommand((tx) => ({
      ...tx,
      roleRepository: {
        ...tx.roleRepository,
        createRole: async (input) => {
          if (++arrived === 2) gate.resolve();
          await gate.promise;
          return await tx.roleRepository.createRole(input);
        },
      },
    }));
    const results = await Promise.allSettled(
      ["First", "Second"].map((roleName) =>
        service.createRole({
          roleCode: "WINNER",
          roleName,
          clientCode: "test-client",
          status: RoleStatus.Enable,
        }),
      ),
    );
    expect(arrived).toBe(2);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(RoleCodeExistsError);
    expect(rejected?.reason).toMatchObject({ httpStatus: 409, message: "角色编码已存在" });
    const after = await facts();
    expect(after.roles.filter((role) => role.roleCode === "WINNER")).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toEqual([]);
  });

  test("competing assignment creates retain unique constraint and exactly one audit/dirty", async () => {
    const role = await seedRole();
    const { user, employment } = await seedHolder(role.id);
    await harness.db.delete(roleAssignments);
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const { service } = createCommand((tx) => ({
      ...tx,
      roleRepository: {
        ...tx.roleRepository,
        createAssignment: async (input) => {
          if (++arrived === 2) gate.resolve();
          await gate.promise;
          return await tx.roleRepository.createAssignment(input);
        },
      },
    }));
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.createAssignment("ROLE", {
          targetType: RoleAssignmentTargetType.Employment,
          employmentId: employment.id,
        }),
      ),
    );
    expect(arrived).toBe(2);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(RoleAssignmentExistsError);
    expect(rejected?.reason).toMatchObject({ httpStatus: 409, message: "角色分配已存在" });
    const after = await facts();
    expect(after.assignments).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toMatchObject([{ userId: user.id, version: "1" }]);
  });

  test("assignment creation waits for uncommitted deletion; a repeated delete cannot delete its replacement", async () => {
    const role = await seedRole();
    const { assignment, employment, user } = await seedHolder(role.id);
    const createReady = Promise.withResolvers<void>();
    const allowCreate = Promise.withResolvers<void>();
    const removed = Promise.withResolvers<void>();
    const allowDeleteCommit = Promise.withResolvers<void>();
    const creating = createCommand((tx) => ({
      ...tx,
      roleRepository: {
        ...tx.roleRepository,
        createAssignment: async (input) => {
          createReady.resolve();
          await allowCreate.promise;
          return await tx.roleRepository.createAssignment(input);
        },
      },
    })).service;
    const createPending = creating.createAssignment("ROLE", {
      targetType: RoleAssignmentTargetType.Employment,
      employmentId: employment.id,
    });
    await Promise.race([createReady.promise, createPending]);
    const deleting = createCommand((tx) => ({
      ...tx,
      roleRepository: {
        ...tx.roleRepository,
        deleteAssignment: async (...args) => {
          const row = await tx.roleRepository.deleteAssignment(...args);
          removed.resolve();
          await allowDeleteCommit.promise;
          return row;
        },
      },
    })).service;
    const deletePending = deleting.deleteAssignment("ROLE", assignment.id);
    await Promise.race([removed.promise, deletePending]);
    const repeatedPending = createCommand().service.deleteAssignment("ROLE", assignment.id);
    try {
      await waitForBlocked("role_assignment");
      allowCreate.resolve();
      await waitForBlocked("role_assignment", 2);
    } finally {
      allowDeleteCommit.resolve();
      allowCreate.resolve();
      await Promise.allSettled([createPending, deletePending, repeatedPending]);
    }
    expect(await deletePending).toEqual({ changed: true, result: null });
    const created = await createPending;
    expect(created).toMatchObject({
      changed: true,
      result: { targetId: employment.id },
    });
    expect(created.result.id).not.toBe(assignment.id);
    expect(await failure(() => repeatedPending)).toBeInstanceOf(RoleAssignmentTargetNotFoundError);
    const after = await facts();
    expect(after.assignments).toHaveLength(1);
    expect(after.assignments[0]!.id).toBe(created.result.id);
    expect(after.audits).toHaveLength(2);
    expect(after.dirty).toMatchObject([{ userId: user.id, version: "2" }]);
  });
});
