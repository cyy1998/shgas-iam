import type { AdminClientTransactionPorts } from "@admin-api/services/client/client.port";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createClientSsoManagement } from "@admin-api/composition/services/client-sso-management";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createClientAdapter } from "@admin-api/routes/admin/client/client.adapter";
import { createClientRoute } from "@admin-api/routes/admin/client/client.index";
import { createClientService } from "@admin-api/services/client/client.service";
import { createRoleService } from "@admin-api/services/role/role.service";
import { BadRequestError } from "@iam/api-core/errors";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { ApiErrorCode, ClientStatus, RoleAssignmentTargetType, RoleStatus } from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import { auditLogs, clients, positions, roles, userProfileDirty } from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { ClientCodeExistsError, ClientCodeImmutableError, ClientNotFoundError } from "@iam/domain/client";
import { RoleHasAssignmentError } from "@iam/domain/role";
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
  await harness.sql`truncate table role_assignment, role, client restart identity cascade`;
});
afterAll(async () => {
  await harness?.close();
});

function createCommand(
  decorate: (tx: AdminClientTransactionPorts) => AdminClientTransactionPorts = tx => tx,
) {
  const warn = mock(() => undefined);
  const invalidateClient = mock(async (_clientCode: string) => undefined);
  const revokeClientAllProtocols = mock(async () => ({
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
  }));
  const enqueueRebuildJobs = mock(async () => ({ enqueued: 0, jobIds: [] }));
  const uow = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn },
    clock: { nowDate: () => new Date("2026-09-07T00:00:00Z") },
    userProfileJobProducer: { enqueueRebuildJobs },
  });
  const management = createClientSsoManagement({
    db: harness.db,
    logger: { warn, error: mock() },
    invalidation: { invalidateClient },
    sessionTermination: { revokeClientSessions: revokeClientAllProtocols },
  });
  const roleService = createRoleService({
    roleRepository: createAdminApiRepositories(harness.db).role,
    uow: mapUnitOfWork(uow, tx => ({
      roleRepository: tx.repositories.role,
      auditService: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
  const service = createClientService({
    clientRepository: createAdminApiRepositories(harness.db).client,
    clientCache: {
      invalidateClient: mock(async () => undefined),
      invalidateUpdatedClient: mock(async () => undefined),
    },
    clientRuntimeInvalidation: { invalidateClient },
    clientMutationLogger: { error: mock(() => undefined) },
    management: management.service,
    passwordHasher: { hashSecret: async secret => `hash-${secret}` },
    random: { customSsoClientSecret: () => "custom-secret", oidcClientSecret: () => "oidc-secret" },
    uow: mapUnitOfWork(uow, tx =>
      decorate({
        clientRepository: tx.repositories.client,
        auditService: tx.auditService,
      })),
  });
  return { service, management, roleService, invalidateClient, revokeClientAllProtocols, enqueueRebuildJobs, warn };
}

function input(clientCode = "portal") {
  return {
    clientCode,
    clientName: clientCode,
    clientSecret: "secret",
    status: ClientStatus.Enable,
    extAttributes: {},
  };
}

async function seedClient(clientCode = "portal") {
  const [row] = await harness.db.insert(clients).values(input(clientCode)).returning();
  return row!;
}

async function facts() {
  return {
    clients: await harness.db.select().from(clients).orderBy(clients.id),
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

describe("Client commands through production PostgreSQL UnitOfWork", () => {
  test.each([
    ["Enable", RoleStatus.Enable],
    ["Pause", RoleStatus.Pause],
    ["Disable", RoleStatus.Disable],
  ])("an undeleted %s Role blocks Client deletion without changing facts or running follow-up effects", async (_name, status) => {
    const client = await seedClient();
    const roleRows = await harness.db.insert(roles).values({
      clientId: client.id,
      roleCode: "portal:reader",
      roleName: "Reader",
      status,
    }).returning();
    const { service, invalidateClient, revokeClientAllProtocols, enqueueRebuildJobs } = createCommand();
    const before = await facts();
    const error = await failure(() => service.deleteClient(client.clientCode));
    expect(error).toMatchObject({ code: ApiErrorCode.ClientHasRole, httpStatus: 409 });
    const after = await facts();
    const remainingRoles = await harness.db.select().from(roles);
    expect(after).toEqual(before);
    expect(remainingRoles).toEqual(roleRows);
    expect(invalidateClient).not.toHaveBeenCalled();
    expect(revokeClientAllProtocols).not.toHaveBeenCalled();
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("explicit Assignment and Role removal releases Client deletion while preserving Role history and other Clients' Roles", async () => {
    await seedClient();
    const other = await seedClient("other");
    const [otherRole] = await harness.db.insert(roles).values({
      clientId: other.id,
      roleCode: "other:reader",
      roleName: "Other reader",
    }).returning();
    await harness.db.insert(positions).values({ posCode: "READER", posName: "Reader" });
    const { service, roleService, invalidateClient, revokeClientAllProtocols } = createCommand();
    await roleService.createRole({ clientCode: "portal", roleCode: "portal:reader", roleName: "Reader", status: RoleStatus.Enable });
    const assignment = await roleService.createAssignment("portal:reader", {
      targetType: RoleAssignmentTargetType.Position,
      posCode: "READER",
    });
    const before = await facts();
    const rolesBefore = await harness.db.select().from(roles).orderBy(roles.id);
    const assignmentsBefore = await harness.db.select().from(roleAssignments);
    const clientError = await failure(() => service.deleteClient("portal"));
    const roleError = await failure(() => roleService.deleteRole("portal:reader"));
    expect(clientError).toMatchObject({ code: ApiErrorCode.ClientHasRole });
    expect(roleError).toBeInstanceOf(RoleHasAssignmentError);
    const afterRejection = await facts();
    const rolesAfterRejection = await harness.db.select().from(roles).orderBy(roles.id);
    const assignmentsAfterRejection = await harness.db.select().from(roleAssignments);
    expect(afterRejection).toEqual(before);
    expect(rolesAfterRejection).toEqual(rolesBefore);
    expect(assignmentsAfterRejection).toEqual(assignmentsBefore);
    expect(invalidateClient).not.toHaveBeenCalled();
    expect(revokeClientAllProtocols).not.toHaveBeenCalled();

    await roleService.deleteAssignment("portal:reader", assignment.result.id);
    await roleService.deleteRole("portal:reader");
    const result = await service.deleteClient("portal");
    expect(result).toEqual({ changed: true, result: null });
    const after = await facts();
    const rolesAfter = await harness.db.select().from(roles).orderBy(roles.id);
    const assignmentsAfter = await harness.db.select().from(roleAssignments);
    expect(after.clients).toMatchObject([{ clientCode: "portal", isDelete: true }, { clientCode: "other", isDelete: false }]);
    expect(rolesAfter).toEqual([otherRole!, { ...rolesBefore[1]!, isDelete: true, updateTime: expect.any(Date) }]);
    expect(assignmentsAfter).toEqual([]);
    expect(after.audits.filter(audit => audit.action === "admin.client.delete")).toMatchObject([
      { targetCode: "portal", details: { changed: true, deleted: true } },
    ]);
    expect(invalidateClient.mock.calls).toEqual([["portal"]]);
    expect(revokeClientAllProtocols).toHaveBeenCalledTimes(1);
  });

  for (const surface of ["client", "client-sso"] as const) {
    for (const transport of ["rest", "trpc"] as const) {
      test(`${surface} ${transport} deletion returns the real Role conflict and succeeds after explicit Role deletion`, async () => {
        const client = await seedClient();
        await harness.db.insert(roles).values({ clientId: client.id, roleCode: "portal:reader", roleName: "Reader" });
        const candidate = createCommand();
        const adapter = createClientAdapter({ clientService: candidate.service });
        const app = new Hono();
        addTestAdminAuthorizationMiddleware(app);
        app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
        app.route("/admin", surface === "client" ? createClientRoute(adapter) : candidate.management.rest);
        app.all("/rpc/*", c => fetchRequestHandler({
          endpoint: "/rpc",
          req: c.req.raw,
          router: surface === "client" ? adapter.clientAdminRouter : candidate.management.trpc,
          createContext: () => ({ hono: c }),
        }));
        const request = () => app.request(
          transport === "rest" ? `/admin/${surface === "client" ? "clients" : "clients-sso"}/portal` : "/rpc/delete",
          transport === "rest"
            ? { method: "DELETE" }
            : {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ clientCode: "portal" }),
              },
        );
        const rejected = await request();
        const rejection = await rejected.json();
        expect(rejected.status).toBe(409);
        expect(rejection).toMatchObject(transport === "rest"
          ? { code: ApiErrorCode.ClientHasRole, data: null, message: expect.stringContaining("角色") }
          : { error: { message: expect.stringContaining("角色"), data: { code: "CONFLICT", serviceCode: ApiErrorCode.ClientHasRole } } });
        expect(rejection).not.toHaveProperty("result");
        expect(candidate.invalidateClient).not.toHaveBeenCalled();
        expect(candidate.revokeClientAllProtocols).not.toHaveBeenCalled();
        await candidate.roleService.deleteRole("portal:reader");
        const accepted = await request();
        const body = await accepted.json();
        expect(accepted.status).toBe(200);
        const outcome = { changed: true, result: null };
        expect(body).toMatchObject(transport === "rest" ? { data: outcome } : { result: { data: outcome } });
      });
    }
  }

  test("create returns a DTO; profile no-op preserves facts and every successful command invalidates Snapshot", async () => {
    const { service, invalidateClient, enqueueRebuildJobs } = createCommand();
    const created = await service.createClient(input());
    expect(created).toMatchObject({ changed: true, result: { clientCode: "portal", clientName: "portal" } });
    const before = await facts();
    expect(before.audits).toMatchObject([{ action: "admin.client.create", details: { changed: true } }]);
    const unchanged = await service.updateClient("portal", {
      clientName: "portal",
      description: null,
      extAttributes: {},
    });
    expect(unchanged).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after).toEqual(before);
    const legacy = await service.updateClientById({
      id: before.clients[0]!.id,
      clientCode: "portal",
      clientName: "Edited",
    });
    expect(legacy).toEqual({ changed: true, result: null });
    const edited = await facts();
    expect(edited.clients[0]).toMatchObject({ clientCode: "portal", clientName: "Edited" });
    expect(edited.audits).toHaveLength(2);
    expect(invalidateClient.mock.calls).toEqual([["portal"], ["portal"], ["portal"]]);
    expect(edited.dirty).toEqual([]);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  for (const path of ["code", "legacy"] as const) {
    test(`same-value explicit credential intent via ${path} is audited without changing persisted facts`, async () => {
      const row = await seedClient();
      const { service, invalidateClient, revokeClientAllProtocols, enqueueRebuildJobs } = createCommand();
      const result
        = path === "code"
          ? await service.updateClient(row.clientCode, { clientSecret: row.clientSecret })
          : await service.updateClientById({ id: row.id, clientSecret: row.clientSecret });
      expect(result).toEqual({ changed: false, result: null });
      const after = await facts();
      expect(after.clients).toEqual([row]);
      expect(after.audits).toHaveLength(1);
      expect(after.audits[0]).toMatchObject({
        action: "admin.client.update",
        details: { changed: false, patch: { clientSecretRotated: false } },
      });
      expect(JSON.stringify(after.audits)).not.toContain(`"clientSecret":"${row.clientSecret}"`);
      expect(after.dirty).toEqual([]);
      expect(invalidateClient).toHaveBeenCalledTimes(1);
      expect(revokeClientAllProtocols).not.toHaveBeenCalled();
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  test("empty and identity-only legacy input fail with 400 and code cannot be renamed", async () => {
    const row = await seedClient();
    const { service, invalidateClient } = createCommand();
    const before = await facts();
    for (const command of [
      () => service.updateClient("portal", {}),
      () => service.updateClientById({ id: row.id }),
      () => service.updateClientById({ id: row.id, clientCode: "portal" }),
    ]) {
      const error = await failure(command);
      expect(error).toBeInstanceOf(BadRequestError);
    }
    const renamed = await failure(() =>
      service.updateClientById({ id: row.id, clientCode: "renamed", clientName: "Other" }),
    );
    expect(renamed).toBeInstanceOf(ClientCodeImmutableError);
    const after = await facts();
    expect(after).toEqual(before);
    expect(invalidateClient).not.toHaveBeenCalled();
  });

  test("audit failure rolls back the internal credential write without propagation", async () => {
    await seedClient();
    const sentinel = new Error("audit unavailable");
    const { service, invalidateClient, revokeClientAllProtocols } = createCommand(tx => ({
      ...tx,
      auditService: {
        ...tx.auditService,
        recordAuditLog: async (event) => {
          await tx.auditService.recordAuditLog(event);
          throw sentinel;
        },
      },
    }));
    const before = await facts();
    const error = await failure(() =>
      service.updateClient("portal", { clientSecret: "changed-internal-secret" }),
    );
    expect(error).toBe(sentinel);
    const after = await facts();
    expect(after).toEqual(before);
    expect(invalidateClient).not.toHaveBeenCalled();
    expect(revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("required Snapshot failure reports committed state and persists mutation plus audit", async () => {
    await seedClient();
    const { service, invalidateClient } = createCommand();
    invalidateClient.mockImplementation(async () => {
      throw new Error("Snapshot unavailable");
    });
    const error = await failure(() => service.updateClient("portal", { clientName: "Committed" }));
    expect(error).toMatchObject({ code: "ADMIN_MUTATION_COMMITTED", httpStatus: 500 });
    const after = await facts();
    expect(after.clients[0]!.clientName).toBe("Committed");
    expect(after.audits).toMatchObject([{ action: "admin.client.update", details: { changed: true } }]);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
  });

  test("missing code and id commands return 404 without audit or invalidation", async () => {
    const { service, invalidateClient } = createCommand();
    for (const command of [
      () => service.updateClient("missing", { clientName: "New" }),
      () => service.updateClientById({ id: 12345, clientName: "New" }),
      () => service.updateClientStatus("missing", ClientStatus.Disable),
      () => service.deleteClient("missing"),
    ]) {
      const error = await failure(command);
      expect(error).toBeInstanceOf(ClientNotFoundError);
      expect(error).toMatchObject({ httpStatus: 404 });
    }
    const after = await facts();
    expect(after).toEqual({ clients: [], audits: [], dirty: [] });
    expect(invalidateClient).not.toHaveBeenCalled();
  });

  test("delete is factual, repeated deletion retries termination, and tombstone code stays occupied", async () => {
    await seedClient();
    const { service, revokeClientAllProtocols } = createCommand();
    const deleted = await service.deleteClient("portal");
    expect(deleted).toEqual({ changed: true, result: null });
    const before = await facts();
    expect(before.clients[0]!.isDelete).toBe(true);
    expect(before.audits).toMatchObject([{ action: "admin.client.delete", details: { changed: true } }]);
    const repeated = await service.deleteClient("portal");
    expect(repeated).toEqual({ changed: false, result: null });
    expect(revokeClientAllProtocols).toHaveBeenCalledTimes(2);
    const occupied = await failure(() => service.createClient(input()));
    expect(occupied).toBeInstanceOf(ClientCodeExistsError);
    expect(occupied).toMatchObject({ httpStatus: 409 });
    const after = await facts();
    expect(after.clients).toEqual(before.clients);
    expect(after.audits).toHaveLength(2);
  });

  test("independent create transactions pass prechecks and unique constraint chooses one winner", async () => {
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const { service } = createCommand(tx => ({
      ...tx,
      clientRepository: {
        ...tx.clientRepository,
        getAnyClientByCode: async (code) => {
          const current = await tx.clientRepository.getAnyClientByCode(code);
          arrived++;
          if (arrived === 2)
            gate.resolve();
          await gate.promise;
          return current;
        },
      },
    }));
    const results = await Promise.allSettled([service.createClient(input()), service.createClient(input())]);
    expect(arrived).toBe(2);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")?.reason).toBeInstanceOf(
      ClientCodeExistsError,
    );
    const after = await facts();
    expect(after.clients).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toEqual([]);
  });

  test("unknown real unique constraints are not mapped to client code conflict", async () => {
    await seedClient();
    await harness.sql`create unique index client_test_name_unique on client (client_name)`;
    try {
      const { service } = createCommand();
      const error = await failure(() => service.createClient({ ...input("other"), clientName: "portal" }));
      expect(error).not.toBeInstanceOf(ClientCodeExistsError);
      expect(extractPostgresError(error)).toEqual({ code: "23505", constraint: "client_test_name_unique" });
      const after = await facts();
      expect(after.clients).toHaveLength(1);
      expect(after.audits).toEqual([]);
    }
    finally {
      await harness.sql`drop index client_test_name_unique`;
    }
  });

  for (const operation of ["create", "code", "id", "disable", "delete"] as const) {
    test(`real zero-row ${operation} fails without successful audit or propagation`, async () => {
      const row = await seedClient();
      const { service, invalidateClient } = createCommand();
      await harness.sql`create function client_test_zero_row() returns trigger language plpgsql as $$ begin return null; end $$`;
      await harness.sql`create trigger client_test_zero_row before insert or update on client for each row execute function client_test_zero_row()`;
      try {
        const before = await facts();
        const error = await failure(() =>
          operation === "create"
            ? service.createClient(input("new-client"))
            : operation === "code"
              ? service.updateClient("portal", { clientName: "New" })
              : operation === "id"
                ? service.updateClientById({ id: row.id, clientName: "New" })
                : operation === "disable"
                  ? service.updateClientStatus("portal", ClientStatus.Disable)
                  : service.deleteClient("portal"),
        );
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(ClientCodeExistsError);
        const after = await facts();
        expect(after).toEqual(before);
        expect(invalidateClient).not.toHaveBeenCalled();
      }
      finally {
        await harness.sql`drop trigger client_test_zero_row on client`;
        await harness.sql`drop function client_test_zero_row()`;
      }
    });
  }
});
