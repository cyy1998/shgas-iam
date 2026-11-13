import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminOperationId } from "@admin-api/services/admin-authorization/admin-operation.registry";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import { OPEN_EMPLOYMENT_STATUSES } from "@iam/contracts";
import { EmploymentNotFoundError } from "@iam/domain/employment";
import type { AdminEmploymentServiceDeps } from "./employment.port";
import type { EmploymentAdminPaginationQueryDto } from "./employment.type";

const GUARDED_EMPLOYMENT_ACTION_BY_OPERATION = {
  "admin.employment.pause": "pause",
  "admin.employment.resume": "resume",
  "admin.employment.end": "end",
  "admin.employment.transfer": "transfer",
  "admin.employment.setPrimary": "setPrimary",
  "admin.employment.clearPrimary": "clearPrimary",
} as const satisfies Partial<Record<AdminOperationId, string>>;

export function createEmploymentService(deps: AdminEmploymentServiceDeps) {
  function readScope(authorization?: AdminEmploymentAuthorization) {
    return authorization?.kind === "scoped" ? { organizationIds: authorization.organizationIds } : undefined;
  }

  async function getEmploymentDetailByIdForAdmin(id: number, authorization?: AdminEmploymentAuthorization) {
    const employment = await deps.employmentRepository.getEmploymentByIdForAdmin(id, readScope(authorization));
    if (employment === null) {
      throw new EmploymentNotFoundError();
    }
    const rolesByEmployment = await deps.roleAssignmentResolver.resolveEffectiveRoles({
      employmentIds: [employment.id],
    });
    const roles = rolesByEmployment.get(employment.id) ?? [];
    const dto = EmploymentDetailDtoSchema.parse(toEmploymentDto(employment));
    dto.roles = roles.map((r) => r.roleCode);
    dto.roleNames = Object.fromEntries(
      (await deps.roleRepository.getRoleNamesByIds(roles.map((r) => r.id))).map((role) => [
        role.roleCode,
        role.roleName,
      ]),
    );
    return { ...dto, userStatus: employment.user.status };
  }

  async function searchEmploymentsFuzzyForAdmin(
    dto: EmploymentAdminPaginationQueryDto,
    authorization?: AdminEmploymentAuthorization,
  ) {
    const scopedDto =
      authorization?.kind === "scoped" && dto.conditions.exactConditions.statuses === undefined
        ? {
            ...dto,
            conditions: {
              ...dto.conditions,
              exactConditions: {
                ...dto.conditions.exactConditions,
                statuses: [...OPEN_EMPLOYMENT_STATUSES],
              },
            },
          }
        : dto;
    const { rows, total } = await deps.employmentRepository.searchEmploymentsFuzzyForAdminPaged(
      scopedDto,
      readScope(authorization),
    );
    const result = rows.map((e) => toEmploymentDto(e));
    const pages = total === 0 ? 0 : Math.ceil(total / dto.pageSize);
    return {
      result,
      total,
      pageNum: scopedDto.pageNum,
      pageSize: scopedDto.pageSize,
      pages,
    };
  }

  async function guardEmploymentMutationForAdmin(
    id: number,
    operationId: keyof typeof GUARDED_EMPLOYMENT_ACTION_BY_OPERATION,
    authorization: AdminEmploymentAuthorization,
  ) {
    if (authorization.kind === "full") return;
    const facts = await deps.employmentRepository.getEmploymentAuthorizationFactsByIdForAdmin(id);
    if (facts === null || !authorization.organizationIds.includes(facts.organizationId)) {
      authorization.denyMutation({
        operationId,
        resourceIdentifier: id,
        reason: "RESOURCE_OUT_OF_SCOPE",
        concealExistence: true,
      });
    }
    const decision = authorization.getAllowedActions({
      status: facts.status,
      userStatus: facts.userStatus,
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
  };
}

export type EmploymentService = ReturnType<typeof createEmploymentService>;
