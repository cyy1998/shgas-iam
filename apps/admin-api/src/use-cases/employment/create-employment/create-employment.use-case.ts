import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { assertEmploymentOrganizationScope } from "@admin-api/services/employment/employment-organization-scope";
import {
  EmploymentStatus,
  isOpenEmploymentStatus,
  OrganizationStatus,
  PositionStatus,
  UserStatus,
} from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
  EmploymentInvalidPeriodError,
  EmploymentUserDisabledError,
} from "@iam/domain/employment";
import {
  assertValidEmploymentPeriod,
  getEmploymentDate,
  getEmploymentStatusForDate,
} from "@iam/domain/employment/employment-date";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { UserNotFoundError } from "@iam/domain/user";
import type { CreateEmploymentUseCaseDeps } from "./create-employment.port";
import type { CreateEmploymentInput, CreateEmploymentOptions } from "./create-employment.type";

export function createCreateEmploymentUseCase(deps: CreateEmploymentUseCaseDeps) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(input: CreateEmploymentInput, options: CreateEmploymentOptions = {}) {
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
      if (organization === null || organization.status !== OrganizationStatus.Enable || organization.isDelete) {
        throw new OrganizationNotFoundError("组织未启用或不存在");
      }
      if (authorization?.kind === "scoped" && !authorization.organizationIds.includes(organization.id)) {
        authorization.denyMutation({
          operationId: "admin.employment.create",
          resourceIdentifier: input.orgCode,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      if (position === null || position.status !== PositionStatus.Enable || position.isDelete) {
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

      const period = { startTime: input.startTime ?? null, endTime: input.endTime ?? null };
      assertValidEmploymentPeriod(period);
      const existing = await tx.employmentStore.getOpenEmploymentByUserOrgPosId(user.id, organization.id, position.id);
      if (existing !== null) {
        throw new EmploymentAlreadyExistsError();
      }

      const isPrimary = input.isPrimary ?? false;
      const selected = isPrimary
        ? await tx.employmentStore.lockEmploymentsByIds(
            await tx.employmentStore.getOpenPrimaryEmploymentIdsByUserId(user.id),
          )
        : [];
      const observedAt = deps.clock.nowDate();
      const status = getEmploymentStatusForDate(period, getEmploymentDate(observedAt));
      if (status === EmploymentStatus.Disable) {
        throw new EmploymentInvalidPeriodError("任职截止日必须晚于今天");
      }

      const clearedPrimaryEmploymentIds: number[] = [];
      for (const employment of selected) {
        if (employment.isDelete || !employment.isPrimary || !isOpenEmploymentStatus(employment.status)) continue;
        const updated = await tx.employmentStore.updateEmploymentRecord(employment.id, { isPrimary: false });
        if (updated == null) throw new Error("Locked Employment primary update returned no row");
        clearedPrimaryEmploymentIds.push(employment.id);
      }

      const created = await tx.employmentStore.createEmploymentRecord({
        userId: user.id,
        posId: position.id,
        orgId: organization.id,
        isPrimary,
        ...period,
        description: input.description ?? null,
        status,
      });
      if (created == null) throw new Error("Employment insert returned no row");
      await tx.auditLogWriter.recordAuditLog(
        buildEmploymentAudit(
          "admin.employment.create",
          {
            id: created.id,
            userId: user.id,
            posId: position.id,
            orgId: organization.id,
            isPrimary,
            status,
            user: { username: user.username },
            organization: { assignedOrg: { orgCode: organization.orgCode } },
            position: { posCode: position.posCode },
          },
          {
            changed: true,
            clearedPrimaryEmploymentIds,
            startTime: created.startTime,
            endTime: created.endTime,
            description: input.description ?? null,
          },
          auditContext,
          observedAt,
        ),
      );
      await tx.userDocumentInvalidation.recordChanges([{ kind: "employment", userId: user.id }]);
      return { changed: true, result: { id: created.id } };
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type CreateEmploymentUseCase = ReturnType<typeof createCreateEmploymentUseCase>;
