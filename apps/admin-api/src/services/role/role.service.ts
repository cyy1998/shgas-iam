import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { RoleAssignmentTargetSummaryDto } from "@iam/domain/role";
import type { UserProfileAfterCommitPort, UserProfileExpansionScope } from "@iam/user-profile-read-model/producer";
import type { AdminRoleServiceDeps, AdminRoleTransactionPorts } from "./role.port";
import type { RoleAssignmentCreateDto, RoleAssignmentPaginationQueryDto, RoleCreateDto, RolePaginationQueryDto, RoleUpdateDto } from "./role.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.service";
import { buildRoleAssignmentAudit, buildRoleAudit } from "@admin-api/services/audit/events/role.audit";
import { RoleAssignmentTargetType, RoleStatus, UserProfileDirtyReason, UserProfileScopeType } from "@iam/contracts";
import { ClientNotFoundError } from "@iam/domain/client";
import {
  InvalidRoleAssignmentScopeError,
  RoleAssignmentExistsError,
  RoleAssignmentTargetNotFoundError,
  RoleCodeExistsError,
  RoleHasAssignmentError,
  RoleNotFoundError,
  toRoleAssignmentDto,
  toRoleDetailDto,
  toRoleDto,
} from "@iam/domain/role";

export function createRoleService(deps: AdminRoleServiceDeps) {
  async function searchRolesForAdmin(input: RolePaginationQueryDto) {
    const { rows, total } = await deps.roleRepository.searchRolesPaged(input);
    return pageResult(rows.map(row => toRoleDto(row)), total, input);
  }

  async function getRoleDetailByCode(roleCode: string) {
    const role = await deps.roleRepository.getRoleByCode(roleCode);
    if (role === null) {
      throw new RoleNotFoundError();
    }
    return toRoleDetailDto(role);
  }

  async function createRole(dto: RoleCreateDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.roleRepository.getAnyRoleByCode(dto.roleCode);
      if (existing !== null) {
        throw new RoleCodeExistsError("角色编码已存在");
      }

      const client = await tx.roleRepository.getClientByCode(dto.clientCode);
      if (client === null) {
        throw new ClientNotFoundError("所属应用不存在");
      }

      const created = await tx.roleRepository.createRole({
        roleCode: dto.roleCode,
        roleName: dto.roleName,
        clientId: client.id,
        status: dto.status ?? RoleStatus.Enable,
        description: dto.description ?? null,
      });
      const detail = toRoleDetailDto({
        ...created,
        client: {
          id: client.id,
          clientCode: client.clientCode,
          clientName: client.clientName,
          status: client.status,
        },
        assignmentCount: 0,
      });

      await tx.auditService.recordAuditLog(buildRoleAudit("admin.role.create", detail, {
        clientCode: client.clientCode,
      }, auditContext));
      return detail;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateRole(
    roleCode: string,
    data: RoleUpdateDto,
    auditContext?: AdminAuditContext,
    action = "admin.role.update",
  ) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.roleRepository.getRoleByCode(roleCode);
      if (existing === null) {
        throw new RoleNotFoundError();
      }
      const updated = await tx.roleRepository.updateRoleByCode(roleCode, data);
      if (updated === null) {
        throw new RoleNotFoundError();
      }
      const detail = toRoleDetailDto({
        ...updated,
        client: existing.client,
        assignmentCount: existing.assignmentCount,
      });
      await tx.auditService.recordAuditLog(buildRoleAudit(action, detail, {
        patch: data,
      }, auditContext));
      if (data.status !== undefined && data.status !== existing.status) {
        await markRoleScopeDirty(tx, existing.id, auditContext);
      }
      return detail;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateRoleStatus(roleCode: string, status: RoleStatus, auditContext?: AdminAuditContext) {
    return await updateRole(roleCode, { status }, auditContext, "admin.role.status_update");
  }

  async function deleteRole(roleCode: string, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.roleRepository.getRoleByCode(roleCode);
      if (existing === null) {
        throw new RoleNotFoundError();
      }
      const assignmentCount = await tx.roleRepository.countAssignmentsByRoleId(existing.id);
      if (assignmentCount > 0) {
        throw new RoleHasAssignmentError();
      }
      await tx.roleRepository.softDeleteRoleByCode(roleCode);
      await tx.auditService.recordAuditLog(buildRoleAudit("admin.role.delete", existing, {
        deleted: true,
      }, auditContext));
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function searchAssignments(roleCode: string, input: RoleAssignmentPaginationQueryDto) {
    const role = await deps.roleRepository.getRoleByCode(roleCode);
    if (role === null) {
      throw new RoleNotFoundError();
    }
    const { rows, total } = await deps.roleRepository.searchAssignmentsPaged(role.id, input);
    return pageResult(rows.map(row => toRoleAssignmentDto(row)), total, input);
  }

  async function createAssignment(roleCode: string, dto: RoleAssignmentCreateDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const role = await tx.roleRepository.getRoleByCode(roleCode);
      if (role === null) {
        throw new RoleNotFoundError();
      }
      const resolved = await resolveAssignmentTarget(dto, tx);
      const existing = await tx.roleRepository.findAssignmentByRoleTarget(
        role.id,
        dto.targetType,
        resolved.target.id,
      );
      if (existing !== null) {
        throw new RoleAssignmentExistsError();
      }

      const assignment = await tx.roleRepository.createAssignment({
        roleId: role.id,
        targetType: dto.targetType,
        targetId: resolved.target.id,
        includeDescendants: resolved.includeDescendants,
      });
      const detail = toRoleAssignmentDto({
        ...assignment,
        target: resolved.target,
      });
      await tx.auditService.recordAuditLog(buildRoleAssignmentAudit(
        "admin.role.assignment.create",
        role,
        detail,
        { created: true },
        auditContext,
      ));
      await markAssignmentScopeDirty(tx, detail, auditContext);
      return detail;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateAssignmentScope(
    roleCode: string,
    assignmentId: number,
    includeDescendants: boolean,
    auditContext?: AdminAuditContext,
  ) {
    return await deps.uow.transaction(async (tx) => {
      const role = await tx.roleRepository.getRoleByCode(roleCode);
      if (role === null) {
        throw new RoleNotFoundError();
      }
      const existing = await tx.roleRepository.getAssignmentByIdForRole(role.id, assignmentId);
      if (existing === null) {
        throw new RoleAssignmentTargetNotFoundError("角色分配不存在");
      }
      if (existing.targetType !== RoleAssignmentTargetType.Organization) {
        throw new InvalidRoleAssignmentScopeError("仅组织角色分配允许修改作用范围");
      }
      const updated = await tx.roleRepository.updateAssignmentScope(role.id, assignmentId, includeDescendants);
      if (updated === null) {
        throw new RoleAssignmentTargetNotFoundError("角色分配不存在");
      }
      const detail = toRoleAssignmentDto({
        ...updated,
        target: existing.target,
      });
      await tx.auditService.recordAuditLog(buildRoleAssignmentAudit(
        "admin.role.assignment.update_scope",
        role,
        detail,
        { previousIncludeDescendants: existing.includeDescendants },
        auditContext,
      ));
      await markAssignmentScopeDirty(tx, detail, auditContext);
      return detail;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function deleteAssignment(roleCode: string, assignmentId: number, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const role = await tx.roleRepository.getRoleByCode(roleCode);
      if (role === null) {
        throw new RoleNotFoundError();
      }
      const existing = await tx.roleRepository.getAssignmentByIdForRole(role.id, assignmentId);
      if (existing === null) {
        throw new RoleAssignmentTargetNotFoundError("角色分配不存在");
      }
      await tx.roleRepository.deleteAssignment(role.id, assignmentId);
      await tx.auditService.recordAuditLog(buildRoleAssignmentAudit(
        "admin.role.assignment.delete",
        role,
        existing,
        { deleted: true },
        auditContext,
      ));
      await markAssignmentScopeDirty(tx, existing, auditContext);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return {
    createAssignment,
    createRole,
    deleteAssignment,
    deleteRole,
    getRoleDetailByCode,
    searchAssignments,
    searchRolesForAdmin,
    updateAssignmentScope,
    updateRole,
    updateRoleStatus,
  };
}

export type RoleService = ReturnType<typeof createRoleService>;

type AdminRoleTransactionContext = AdminRoleTransactionPorts & {
  afterCommit: UserProfileAfterCommitPort;
};

interface ResolvedRoleAssignmentTarget {
  target: RoleAssignmentTargetSummaryDto;
  includeDescendants: boolean;
}

async function resolveAssignmentTarget(
  dto: RoleAssignmentCreateDto,
  tx: AdminRoleTransactionPorts,
): Promise<ResolvedRoleAssignmentTarget> {
  switch (dto.targetType) {
    case RoleAssignmentTargetType.Organization: {
      if (dto.orgCode === undefined) {
        throw new RoleAssignmentTargetNotFoundError("组织编码不能为空");
      }
      const target = await tx.roleRepository.getAssignableOrganizationByCode(dto.orgCode);
      if (target === null) {
        throw new RoleAssignmentTargetNotFoundError("组织不存在或未启用");
      }
      return { target, includeDescendants: dto.includeDescendants ?? true };
    }
    case RoleAssignmentTargetType.Position: {
      if (dto.includeDescendants === true) {
        throw new InvalidRoleAssignmentScopeError("includeDescendants 仅适用于组织分配");
      }
      if (dto.posCode === undefined) {
        throw new RoleAssignmentTargetNotFoundError("岗位编码不能为空");
      }
      const target = await tx.roleRepository.getAssignablePositionByCode(dto.posCode);
      if (target === null) {
        throw new RoleAssignmentTargetNotFoundError("岗位不存在或未启用");
      }
      return { target, includeDescendants: false };
    }
    case RoleAssignmentTargetType.Employment: {
      if (dto.includeDescendants === true) {
        throw new InvalidRoleAssignmentScopeError("includeDescendants 仅适用于组织分配");
      }
      if (dto.employmentId === undefined) {
        throw new RoleAssignmentTargetNotFoundError("任职 ID 不能为空");
      }
      const target = await tx.roleRepository.getAssignableEmploymentById(dto.employmentId);
      if (target === null) {
        throw new RoleAssignmentTargetNotFoundError("任职不存在或未启用");
      }
      return { target, includeDescendants: false };
    }
  }
}

async function markRoleScopeDirty(
  tx: AdminRoleTransactionContext,
  roleId: number,
  auditContext?: AdminAuditContext,
) {
  await tx.profileDirtyMarker.markScopeDirty({
    scope: { scopeType: UserProfileScopeType.RoleId, scopeId: roleId },
    reasonCodes: [UserProfileDirtyReason.RoleUpdated],
    afterCommit: tx.afterCommit,
    requestId: auditContext?.requestId ?? undefined,
    traceId: auditContext?.traceId ?? undefined,
  });
}

async function markAssignmentScopeDirty(
  tx: AdminRoleTransactionContext,
  assignment: {
    targetType: RoleAssignmentTargetType;
    targetId: number;
  },
  auditContext?: AdminAuditContext,
) {
  await tx.profileDirtyMarker.markScopeDirty({
    scope: assignmentScope(assignment),
    reasonCodes: [UserProfileDirtyReason.RoleUpdated],
    afterCommit: tx.afterCommit,
    requestId: auditContext?.requestId ?? undefined,
    traceId: auditContext?.traceId ?? undefined,
  });
}

function assignmentScope(
  assignment: { targetType: RoleAssignmentTargetType; targetId: number },
): UserProfileExpansionScope {
  switch (assignment.targetType) {
    case RoleAssignmentTargetType.Organization:
      return { scopeType: UserProfileScopeType.OrganizationId, scopeId: assignment.targetId };
    case RoleAssignmentTargetType.Position:
      return { scopeType: UserProfileScopeType.PositionId, scopeId: assignment.targetId };
    case RoleAssignmentTargetType.Employment:
      return { scopeType: UserProfileScopeType.EmploymentId, scopeId: assignment.targetId };
  }
}

function pageResult<T>(rows: T[], total: number, input: { pageNum: number; pageSize: number }) {
  return {
    result: rows,
    total,
    pageNum: input.pageNum,
    pageSize: input.pageSize,
    pages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}
