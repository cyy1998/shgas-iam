import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AdminEmploymentServiceDeps } from "./employment.port";
import type {
  EmploymentAdminPaginationQueryDto,
  EmploymentUpdateDto,
} from "./employment.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import { EmploymentStatus } from "@iam/contracts";
import {
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";

export function createEmploymentService(deps: AdminEmploymentServiceDeps) {
  async function getEmploymentDetailByIdForAdmin(id: number) {
    const employment = await deps.employmentRepository.getEmploymentByIdForAdmin(id);
    if (employment === null) {
      throw new EmploymentNotFoundError();
    }
    const rolesByEmployment = await deps.roleAssignmentResolver.resolveEffectiveRoles({
      employmentIds: [employment.id],
    });
    const roles = rolesByEmployment.get(employment.id) ?? [];
    const privileges = await deps.privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
    const dto = EmploymentDetailDtoSchema.parse(toEmploymentDto(employment));
    dto.roles = roles.map(r => r.roleCode);
    dto.privileges = privileges.map(p => p.privilegeCode);
    return dto;
  }

  async function searchEmploymentsFuzzyForAdmin(dto: EmploymentAdminPaginationQueryDto) {
    const { rows, total } = await deps.employmentRepository.searchEmploymentsFuzzyForAdminPaged(dto);
    const result = rows.map(e => toEmploymentDto(e));
    const pages = total === 0 ? 0 : Math.ceil(total / dto.pageSize);
    return {
      result,
      total,
      pageNum: dto.pageNum,
      pageSize: dto.pageSize,
      pages,
    };
  }

  async function updateEmployment(id: number, dto: EmploymentUpdateDto, auditContext?: AdminAuditContext) {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.employmentRepository.getEmploymentByIdForAdmin(id);
      if (existing === null)
        throw new EmploymentNotFoundError();
      if (existing.status === EmploymentStatus.Disable)
        throw new EmploymentNotEditableError();

      await tx.employmentRepository.updateEmploymentRecord(
        id,
        {
          description: dto.description,
        },
      );
      await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.update", existing, {
        patch: dto,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: existing.userId },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return {
    getEmploymentDetailByIdForAdmin,
    searchEmploymentsFuzzyForAdmin,
    updateEmployment,
  };
}

export type EmploymentService = ReturnType<typeof createEmploymentService>;
