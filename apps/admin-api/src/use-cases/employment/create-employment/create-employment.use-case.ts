import type { CreateEmploymentUseCaseDeps } from "./create-employment.port";
import type { CreateEmploymentInput, CreateEmploymentOptions } from "./create-employment.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { assertEmploymentOrganizationScope } from "@admin-api/services/employment/employment-organization-scope";
import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
} from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { UserNotFoundError } from "@iam/domain/user";

export function createCreateEmploymentUseCase(deps: CreateEmploymentUseCaseDeps) {
  async function execute(
    input: CreateEmploymentInput,
    options: CreateEmploymentOptions = {},
  ) {
    const { auditContext } = options;
    return await deps.uow.transaction(async (tx) => {
      const [user, organization, position] = await Promise.all([
        tx.userReader.getUserByUsernameForAdmin(input.username),
        tx.organizationReader.getOrganizationByCode(input.orgCode),
        tx.positionReader.getPositionByCode(input.posCode),
      ]);
      if (user === null || user.isDelete) {
        throw new UserNotFoundError("用户不存在");
      }
      if (
        organization === null
        || organization.status !== OrganizationStatus.Enable
        || organization.isDelete
      ) {
        throw new OrganizationNotFoundError("组织未启用或不存在");
      }
      if (
        position === null
        || position.status !== PositionStatus.Enable
        || position.isDelete
      ) {
        throw new PositionNotFoundError("岗位未启用或不存在");
      }
      await assertEmploymentOrganizationScope(
        tx.organizationReader,
        organization.orgCode,
        input.expectedAncestorOrgCode,
        "任职组织不属于期望组织范围",
      );

      const existing = await tx.employmentStore.getOpenEmploymentByUserOrgPosId(
        user.id,
        organization.id,
        position.id,
      );
      if (existing !== null) {
        throw new EmploymentAlreadyExistsError();
      }

      const isPrimary = input.isPrimary ?? false;
      if (isPrimary) {
        await tx.employmentStore.unsetOpenPrimariesByUserId(user.id);
      }

      const transactionTime = deps.clock.nowDate();
      const created = await tx.employmentStore.createEmploymentRecord({
        userId: user.id,
        posId: position.id,
        orgId: organization.id,
        isPrimary,
        startTime: transactionTime,
        endTime: null,
        description: input.description ?? null,
        status: EmploymentStatus.Enable,
      });
      await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit("admin.employment.create", {
        id: created.id,
        userId: user.id,
        posId: position.id,
        orgId: organization.id,
        isPrimary,
        status: EmploymentStatus.Enable,
        user: { username: user.username },
        organization: { assignedOrg: { orgCode: organization.orgCode } },
        position: { posCode: position.posCode },
      }, {
        startTime: transactionTime,
        description: input.description ?? null,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: user.id },
      ]);
      return { id: created.id };
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type CreateEmploymentUseCase = ReturnType<typeof createCreateEmploymentUseCase>;
