import type { CreateEmploymentUseCaseDeps } from "./create-employment.port";
import type { CreateEmploymentInput, CreateEmploymentOptions } from "./create-employment.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { assertEmploymentOrganizationScope } from "@admin-api/services/employment/employment-organization-scope";
import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
  UserStatus,
} from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
  EmploymentUserDisabledError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { UserNotFoundError } from "@iam/domain/user";

export function createCreateEmploymentUseCase(deps: CreateEmploymentUseCaseDeps) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(
    input: CreateEmploymentInput,
    options: CreateEmploymentOptions = {},
  ) {
    const { auditContext, authorization } = options;
    return await mutation.transaction(async (tx) => {
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
        authorization?.kind === "scoped"
        && !authorization.organizationIds.includes(organization.id)
      ) {
        authorization.denyMutation({
          operationId: "admin.employment.create",
          resourceIdentifier: input.orgCode,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      if (
        position === null
        || position.status !== PositionStatus.Enable
        || position.isDelete
      ) {
        throw new PositionNotFoundError("岗位未启用或不存在");
      }
      if (user.status === UserStatus.Disable) {
        throw new EmploymentUserDisabledError();
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
      const clearedPrimaryEmploymentIds: number[] = [];
      if (isPrimary) {
        const ids = await tx.employmentStore.getOpenPrimaryEmploymentIdsByUserId(user.id);
        const selected = await tx.employmentStore.lockEmploymentsByIds(ids);
        for (const employment of selected) {
          if (employment.isDelete || !employment.isPrimary
            || (employment.status !== EmploymentStatus.Enable && employment.status !== EmploymentStatus.Pause)) {
            continue;
          }
          const updated = await tx.employmentStore.updateEmploymentRecord(employment.id, { isPrimary: false });
          if (updated == null)
            throw new Error("Locked Employment primary update returned no row");
          clearedPrimaryEmploymentIds.push(employment.id);
        }
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
      if (created == null)
        throw new Error("Employment insert returned no row");
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
        changed: true,
        clearedPrimaryEmploymentIds,
        startTime: transactionTime,
        description: input.description ?? null,
      }, auditContext));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: user.id },
      ]);
      return { changed: true, result: { id: created.id } };
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type CreateEmploymentUseCase = ReturnType<typeof createCreateEmploymentUseCase>;
