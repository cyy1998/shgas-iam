import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import {
  RoleAssignmentTargetType,
  RoleStatus,
  UserProfileDirtyReason,
  UserProfileScopeType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createRoleService } from "../role.service";

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
    profileDirtyMarker: {
      markScopeDirty: mock(async () => ({ marked: 1, userIds: [1] })),
    },
    roleRepository: {
      countAssignmentsByRoleId: mock(async () => 0),
      createAssignment: mock(async () => ({ ...assignment(), target: undefined })),
      createRole: mock(async () => role()),
      deleteAssignment: mock(async () => assignment()),
      findAssignmentByRoleTarget: mock(async () => null),
      getAnyRoleByCode: mock(async () => null),
      getAssignmentByIdForRole: mock(async () => assignment()),
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
      softDeleteRoleByCode: mock(async () => role({ isDelete: true })),
      updateAssignmentScope: mock(async () => ({ ...assignment({ includeDescendants: false }), target: undefined })),
      updateRoleByCode: mock(async () => role()),
    },
  };
  const deps = {
    roleRepository: {
      getRoleByCode: mock(async () => role()),
      searchAssignmentsPaged: mock(async () => ({ rows: [], total: 0 })),
      searchRolesPaged: mock(async () => ({ rows: [], total: 0 })),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createRoleService(deps), tx };
}

describe("createRoleService", () => {
  test("creates an organization assignment with default descendant scope and marks profiles dirty", async () => {
    const { service, tx } = createService();

    await expect(service.createAssignment("portal-admin", {
      targetType: RoleAssignmentTargetType.Organization,
      orgCode: "ORG",
    })).resolves.toMatchObject({
      targetType: RoleAssignmentTargetType.Organization,
      includeDescendants: true,
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
    expect(tx.profileDirtyMarker.markScopeDirty).toHaveBeenCalledWith(expect.objectContaining({
      scope: { scopeType: UserProfileScopeType.OrganizationId, scopeId: 20 },
      reasonCodes: [UserProfileDirtyReason.RoleUpdated],
    }));
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
    tx.roleRepository.getAssignmentByIdForRole.mockResolvedValue(assignment({
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

  test("prevents deleting a role that still has assignments", async () => {
    const { service, tx } = createService();
    tx.roleRepository.countAssignmentsByRoleId.mockResolvedValue(1);

    await expect(service.deleteRole("portal-admin")).rejects.toThrow("角色仍存在分配");

    expect(tx.roleRepository.softDeleteRoleByCode).not.toHaveBeenCalled();
  });
});
