import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { RoleAssignmentTargetType, RoleStatus } from "@iam/contracts";
import type { AuditLogInput } from "../audit.service";
import { buildAdminResourceAudit } from "../admin-resource-audit";

export interface RoleAuditTarget {
  id?: number | null;
  roleCode: string;
  roleName: string;
  status?: RoleStatus;
}

export interface RoleAssignmentAuditSummary {
  id?: number | null;
  targetType: RoleAssignmentTargetType;
  targetId: number;
  includeDescendants: boolean;
  target: {
    code: string;
    name: string;
    status?: number | null;
  };
}

export function buildRoleAudit(
  action: string,
  role: RoleAuditTarget,
  details: Record<string, unknown>,
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildAdminResourceAudit(
    action,
    {
      type: "role",
      id: role.id ?? null,
      code: role.roleCode,
      name: role.roleName,
    },
    {
      roleCode: role.roleCode,
      roleName: role.roleName,
      status: role.status,
      ...details,
    },
    auditContext,
  );
}

export function buildRoleAssignmentAudit(
  action: string,
  role: RoleAuditTarget,
  assignment: RoleAssignmentAuditSummary,
  details: Record<string, unknown>,
  auditContext?: AdminAuditContext,
): AuditLogInput {
  return buildRoleAudit(action, role, {
    assignment: {
      id: assignment.id ?? null,
      targetType: assignment.targetType,
      targetId: assignment.targetId,
      targetCode: assignment.target.code,
      targetName: assignment.target.name,
      targetStatus: assignment.target.status ?? null,
      includeDescendants: assignment.includeDescendants,
    },
    ...details,
  }, auditContext);
}
