import type { TransferEmploymentUseCaseDeps } from "./transfer-employment.port";
import type {
  TransferEmploymentInput,
  TransferEmploymentOptions,
} from "./transfer-employment.type";
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
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { UserNotFoundError } from "@iam/domain/user";

export function createTransferEmploymentUseCase(
  deps: TransferEmploymentUseCaseDeps,
) {
  async function execute(
    input: TransferEmploymentInput,
    options: TransferEmploymentOptions = {},
  ) {
    const { auditContext, authorization } = options;
    return await deps.uow.transaction(async (tx) => {
      const context = await tx.employmentStore.getEmploymentLifecycleContextById(input.employmentId);
      if (context === null) {
        throw new EmploymentNotFoundError();
      }
      const { employment } = context;
      if (
        employment.status !== EmploymentStatus.Enable
        && employment.status !== EmploymentStatus.Pause
      ) {
        throw new EmploymentNotEditableError("当前任职状态不允许转岗");
      }
      const [user, organization, position] = await Promise.all([
        tx.userReader.getUserByIdForAdmin(employment.userId),
        tx.organizationReader.getOrganizationByCode(input.newOrgCode),
        tx.positionReader.getPositionByCode(input.newPosCode),
      ]);
      if (user === null || user.isDelete) {
        throw new UserNotFoundError("用户不存在");
      }
      if (organization === null) {
        throw new OrganizationNotFoundError("新任职组织未启用或不存在");
      }
      if (
        authorization?.kind === "scoped"
        && !authorization.organizationIds.includes(organization.id)
      ) {
        authorization.denyMutation({
          operationId: "admin.employment.transfer",
          resourceIdentifier: input.newOrgCode,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      if (
        organization.status !== OrganizationStatus.Enable
        || organization.isDelete
      ) {
        throw new OrganizationNotFoundError("新任职组织未启用或不存在");
      }
      if (
        position === null
        || position.status !== PositionStatus.Enable
        || position.isDelete
      ) {
        throw new PositionNotFoundError("新岗位未启用或不存在");
      }
      await assertEmploymentOrganizationScope(
        tx.organizationReader,
        organization.orgCode,
        input.expectedAncestorOrgCode,
        "新任职组织不属于期望组织范围",
      );
      const duplicate = await tx.employmentStore.getOpenEmploymentByUserOrgPosId(
        employment.userId,
        organization.id,
        position.id,
        employment.id,
      );
      if (duplicate !== null) {
        throw new EmploymentAlreadyExistsError();
      }

      const transactionTime = deps.clock.nowDate();
      await tx.employmentStore.updateEmploymentRecord(employment.id, {
        status: EmploymentStatus.Disable,
        endTime: transactionTime,
        isPrimary: false,
      });
      const assignmentChanged
        = await tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
          action: "transfer",
          auditContext,
          employmentId: employment.id,
          endTime: transactionTime,
        });
      if (input.isPrimary) {
        await tx.employmentStore.unsetOpenPrimariesByUserId(employment.userId);
      }
      const created = await tx.employmentStore.createEmploymentRecord({
        userId: employment.userId,
        posId: position.id,
        orgId: organization.id,
        isPrimary: input.isPrimary,
        startTime: transactionTime,
        endTime: null,
        description: input.description ?? null,
        status: EmploymentStatus.Enable,
      });
      await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
        "admin.employment.transfer",
        {
          ...employment,
          user: { name: user.name, username: user.username },
          organization: context.organization == null
            ? undefined
            : {
                assignedOrg: {
                  orgCode: context.organization.orgCode,
                  orgName: context.organization.orgName,
                },
              },
          position: context.position == null
            ? undefined
            : {
                posCode: context.position.posCode,
                posName: context.position.posName,
              },
        },
        {
          newEmploymentId: created.id,
          newOrgCode: organization.orgCode,
          newPosCode: position.posCode,
          newIsPrimary: input.isPrimary,
          endTime: transactionTime,
          startTime: transactionTime,
        },
        auditContext,
      ));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: employment.userId },
        ...(assignmentChanged
          ? [{
              kind: "organization-responsibility-assignment" as const,
              userId: employment.userId,
            }]
          : []),
      ]);
      return { newEmploymentId: created.id };
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type TransferEmploymentUseCase = ReturnType<
  typeof createTransferEmploymentUseCase
>;
