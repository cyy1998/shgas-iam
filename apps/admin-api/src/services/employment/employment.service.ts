import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminOperationId } from "@admin-api/services/admin-authorization/admin-operation.registry";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { AdminEmploymentServiceDeps } from "./employment.port";
import type {
  EmploymentAdminPaginationQueryDto,
  EmploymentUpdateDto,
} from "./employment.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import { BadRequestError } from "@iam/api-core/errors";
import { EmploymentStatus } from "@iam/contracts";
import {
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";

const GUARDED_EMPLOYMENT_ACTION_BY_OPERATION = {
  "admin.employment.pause": "pause",
  "admin.employment.resume": "resume",
  "admin.employment.end": "end",
  "admin.employment.transfer": "transfer",
  "admin.employment.setPrimary": "setPrimary",
  "admin.employment.clearPrimary": "clearPrimary",
} as const satisfies Partial<Record<AdminOperationId, string>>;

export function createEmploymentService(deps: AdminEmploymentServiceDeps) {
  const mutation = createAdminMutation(deps.uow);
  function readScope(authorization?: AdminEmploymentAuthorization) {
    return authorization?.kind === "scoped"
      ? { organizationIds: authorization.organizationIds }
      : undefined;
  }

  async function getEmploymentDetailByIdForAdmin(
    id: number,
    authorization?: AdminEmploymentAuthorization,
  ) {
    const employment = await deps.employmentRepository.getEmploymentByIdForAdmin(
      id,
      readScope(authorization),
    );
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
    dto.roleNames = Object.fromEntries((await deps.roleRepository.getRoleNamesByIds(roles.map(r => r.id)))
      .map(role => [role.roleCode, role.roleName]));
    dto.privilegeNames = Object.fromEntries(privileges.map(p => [p.privilegeCode, p.privilegeName]));
    return dto;
  }

  async function searchEmploymentsFuzzyForAdmin(
    dto: EmploymentAdminPaginationQueryDto,
    authorization?: AdminEmploymentAuthorization,
  ) {
    const scopedDto = authorization?.kind === "scoped"
      && dto.conditions.exactConditions.statuses === undefined
      ? {
          ...dto,
          conditions: {
            ...dto.conditions,
            exactConditions: {
              ...dto.conditions.exactConditions,
              statuses: [EmploymentStatus.Enable, EmploymentStatus.Pause],
            },
          },
        }
      : dto;
    const { rows, total } = await deps.employmentRepository
      .searchEmploymentsFuzzyForAdminPaged(scopedDto, readScope(authorization));
    const result = rows.map(e => toEmploymentDto(e));
    const pages = total === 0 ? 0 : Math.ceil(total / dto.pageSize);
    return {
      result,
      total,
      pageNum: scopedDto.pageNum,
      pageSize: scopedDto.pageSize,
      pages,
    };
  }

  async function updateEmployment(
    id: number,
    dto: EmploymentUpdateDto,
    auditContext?: AdminAuditContext,
    authorization?: AdminEmploymentAuthorization,
  ) {
    if (dto.description === undefined)
      throw new BadRequestError("至少提交一个任职更新字段");
    return await mutation.locked(
      tx => tx.employmentRepository.lockEmploymentByIdForAdmin(id),
      () => new EmploymentNotFoundError(),
      async (tx, existing) => {
        if (
          authorization?.kind === "scoped"
          && !authorization.organizationIds.includes(existing.orgId)
        ) {
          authorization.denyMutation({
            operationId: "admin.employment.update",
            resourceIdentifier: id,
            reason: "RESOURCE_OUT_OF_SCOPE",
            concealExistence: true,
          });
        }
        if (existing.status === EmploymentStatus.Disable)
          throw new EmploymentNotEditableError();

        if (existing.description === dto.description)
          return { changed: false, result: null };
        const updated = await tx.employmentRepository.updateEmploymentRecord(
          id,
          {
            description: dto.description,
          },
        );
        if (updated == null)
          throw new Error("Locked Employment update returned no row");
        await tx.auditService.recordAuditLog(buildEmploymentAudit("admin.employment.update", existing, {
          changed: true,
          patch: dto,
        }, auditContext));
        await tx.userProfileInvalidation.recordChanges([
          { kind: "employment", userId: existing.userId },
        ]);
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function guardEmploymentMutationForAdmin(
    id: number,
    operationId: keyof typeof GUARDED_EMPLOYMENT_ACTION_BY_OPERATION,
    authorization: AdminEmploymentAuthorization,
  ) {
    if (authorization.kind === "full")
      return;
    const facts = await deps.employmentRepository
      .getEmploymentAuthorizationFactsByIdForAdmin(id);
    if (
      facts === null
      || !authorization.organizationIds.includes(facts.organizationId)
    ) {
      authorization.denyMutation({
        operationId,
        resourceIdentifier: id,
        reason: "RESOURCE_OUT_OF_SCOPE",
        concealExistence: true,
      });
    }
    const decision = authorization.getAllowedActions({
      status: facts.status,
      isPrimary: facts.isPrimary,
    })[GUARDED_EMPLOYMENT_ACTION_BY_OPERATION[operationId]];
    if (!decision.allowed) {
      authorization.denyMutation({
        operationId,
        resourceIdentifier: id,
        reason: decision.reason,
      });
    }
  }

  return {
    getEmploymentDetailByIdForAdmin,
    guardEmploymentMutationForAdmin,
    searchEmploymentsFuzzyForAdmin,
    updateEmployment,
  };
}

export type EmploymentService = ReturnType<typeof createEmploymentService>;
