import { createRoleService } from "@admin-api/services/role/role.service";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import {
  RoleAssignmentTargetType,
  RoleStatus,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const now = new Date("2026-01-01T00:00:00Z");

function role(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    roleCode: "portal-admin",
    roleName: "Portal Admin",
    clientId: 10,
    status: RoleStatus.Enable,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    client: {
      id: 10,
      clientCode: "portal",
      clientName: "Portal",
      status: 1,
    },
    assignmentCount: 0,
    ...overrides,
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    roleId: 1,
    targetType: RoleAssignmentTargetType.Organization,
    targetId: 20,
    includeDescendants: true,
    createTime: now,
    updateTime: now,
    target: {
      id: 20,
      code: "ORG",
      name: "Org",
      status: 1,
      description: null,
    },
    ...overrides,
  };
}

function createService() {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
    },
    roleRepository: {
      countAssignmentsByRoleId: mock(async () => 0),
      createAssignment: mock(async () => ({ ...assignment(), target: undefined })),
      createRole: mock(async () => role()),
      deleteAssignment: mock(async () => assignment()),
      findAssignmentByRoleTarget: mock(async () => null),
      getAnyRoleByCode: mock(async () => null),
      lockAssignmentByIdForRole: mock(async () => assignment()),
      getAssignableEmploymentById: mock(async (id: number) => ({
        id,
        code: String(id),
        name: "User / Org / Position",
        status: 1,
        description: null,
      })),
      getAssignableOrganizationByCode: mock(async () => assignment().target),
      getAssignablePositionByCode: mock(async () => ({
        id: 30,
        code: "POS",
        name: "Position",
        status: 1,
        description: null,
      })),
      getClientByCode: mock(async () => role().client),
      getRoleByCode: mock(async () => role()),
      lockRoleByCode: mock(async () => role()),
      softDeleteRoleByCode: mock(async () => role({ isDelete: true })),
      updateAssignmentScope: mock(async () => ({ ...assignment({ includeDescendants: false }), target: undefined })),
      updateRoleByCode: mock(async () => role()),
    },
  };
  const deps = {
    roleRepository: {
      getRoleByCode: mock(async () => role()),
      lockRoleByCode: mock(async () => role()),
      searchAssignmentsPaged: mock(async () => ({ rows: [], total: 0 })),
      searchRolesPaged: mock(async () => ({ rows: [], total: 0 })),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createRoleService(deps), tx };
}

describe("createRoleService", () => {
  test("records a role change after updating role status", async () => {
    const { service, tx } = createService();
    tx.roleRepository.updateRoleByCode.mockResolvedValueOnce(role({ status: RoleStatus.Disable }));

    await expect(service.updateRoleStatus("portal-admin", RoleStatus.Disable)).resolves.toMatchObject({
      changed: true,
      result: null,
    });

    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "role", roleId: 1 },
    ]);
  });

  test("creates an organization assignment and records its current domain target", async () => {
    const { service, tx } = createService();

    await expect(service.createAssignment("portal-admin", {
      targetType: RoleAssignmentTargetType.Organization,
      orgCode: "ORG",
    })).resolves.toMatchObject({
      changed: true,
      result: { targetType: RoleAssignmentTargetType.Organization, includeDescendants: true },
    });

    expect(tx.roleRepository.createAssignment).toHaveBeenCalledWith({
      roleId: 1,
      targetType: RoleAssignmentTargetType.Organization,
      targetId: 20,
      includeDescendants: true,
    });
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.role.assignment.create",
      targetType: "role",
      targetCode: "portal-admin",
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Organization,
        targetId: 20,
      },
    ]);
  });

  test("rejects duplicate assignment before insert", async () => {
    const { service, tx } = createService();
    (tx.roleRepository.findAssignmentByRoleTarget as any).mockResolvedValue(assignment());

    await expect(service.createAssignment("portal-admin", {
      targetType: RoleAssignmentTargetType.Organization,
      orgCode: "ORG",
    })).rejects.toThrow("角色分配已存在");

    expect(tx.roleRepository.createAssignment).not.toHaveBeenCalled();
  });

  test("rejects descendant scope on non-organization assignment", async () => {
    const { service } = createService();

    await expect(service.createAssignment("portal-admin", {
      targetType: RoleAssignmentTargetType.Position,
      posCode: "POS",
      includeDescendants: true,
    })).rejects.toThrow("includeDescendants 仅适用于组织分配");
  });

  test("rejects scope updates on non-organization assignments", async () => {
    const { service, tx } = createService();
    tx.roleRepository.lockAssignmentByIdForRole.mockResolvedValue(assignment({
      targetType: RoleAssignmentTargetType.Position,
      targetId: 30,
      includeDescendants: false,
      target: {
        id: 30,
        code: "POS",
        name: "Position",
        status: 1,
        description: null,
      },
    }));

    await expect(service.updateAssignmentScope("portal-admin", 100, true)).rejects.toThrow("仅组织角色分配允许修改作用范围");

    expect(tx.roleRepository.updateAssignmentScope).not.toHaveBeenCalled();
  });

  test("records the original and updated assignment targets when changing scope", async () => {
    const { service, tx } = createService();

    await expect(service.updateAssignmentScope("portal-admin", 100, false)).resolves.toMatchObject({
      changed: true,
      result: null,
    });

    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Organization,
        targetId: 20,
      },
    ]);
  });

  test("records the saved assignment target after deleting the assignment", async () => {
    const { service, tx } = createService();
    tx.roleRepository.lockAssignmentByIdForRole.mockResolvedValueOnce(assignment({
      targetType: RoleAssignmentTargetType.Position,
      targetId: 30,
      includeDescendants: false,
      target: {
        id: 30,
        code: "POS",
        name: "Position",
        status: 1,
        description: null,
      },
    }));

    await expect(service.deleteAssignment("portal-admin", 100)).resolves.toEqual({ changed: true, result: null });

    expect(tx.roleRepository.deleteAssignment).toHaveBeenCalledWith(1, 100);
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Position,
        targetId: 30,
      },
    ]);
  });

  test("prevents deleting a role that still has assignments", async () => {
    const { service, tx } = createService();
    tx.roleRepository.countAssignmentsByRoleId.mockResolvedValue(1);

    await expect(service.deleteRole("portal-admin")).rejects.toThrow("角色仍存在分配");

    expect(tx.roleRepository.softDeleteRoleByCode).not.toHaveBeenCalled();
  });
});

describe("Role mutation outcomes", () => {
  test("ordinary empty and same-value patches do not create audit or dirty facts", async () => {
    const { service, tx } = createService();
    let failure: unknown;
    try {
      await service.updateRole("portal-admin", {});
    }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ httpStatus: 400 });
    const unchanged = await service.updateRole("portal-admin", { roleName: "Portal Admin", description: null });
    expect(unchanged).toEqual({ changed: false, result: null });
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("both status entry points and scope no-op preserve intent without dirty", async () => {
    const { service, tx } = createService();
    const ordinaryStatus = await service.updateRole("portal-admin", { status: RoleStatus.Enable });
    const status = await service.updateRoleStatus("portal-admin", RoleStatus.Enable);
    const scope = await service.updateAssignmentScope("portal-admin", 100, true);
    for (const outcome of [ordinaryStatus, status, scope])
      expect(outcome).toEqual({ changed: false, result: null });
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledTimes(3);
    for (const [audit] of tx.auditService.recordAuditLog.mock.calls as unknown[][])
      expect(audit).toMatchObject({ details: { changed: false } });
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("missing role and assignment writes return not found without success facts", async () => {
    const { service, tx } = createService();
    (tx.roleRepository.lockRoleByCode as any).mockResolvedValue(null);
    (tx.roleRepository.lockAssignmentByIdForRole as any).mockResolvedValue(null);
    for (const operation of [
      () => service.updateRole("missing", { roleName: "Name" }),
      () => service.deleteRole("missing"),
      () => service.updateAssignmentScope("portal-admin", 999, false),
      () => service.deleteAssignment("portal-admin", 999),
    ]) {
      let failure: unknown;
      try {
        await operation();
      }
      catch (error) { failure = error; }
      expect(failure).toMatchObject({ httpStatus: 404 });
    }
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("zero-row results fail closed before success audit and dirty", async () => {
    const { service, tx } = createService();
    for (const method of ["updateRoleByCode", "softDeleteRoleByCode", "updateAssignmentScope", "deleteAssignment"] as const)
      (tx.roleRepository[method] as any).mockResolvedValue(null);
    for (const operation of [
      () => service.updateRoleStatus("portal-admin", RoleStatus.Disable),
      () => service.deleteRole("portal-admin"),
      () => service.updateAssignmentScope("portal-admin", 100, false),
      () => service.deleteAssignment("portal-admin", 100),
    ]) {
      let failure: unknown;
      try {
        await operation();
      }
      catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain("returned no row");
    }
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });
});
