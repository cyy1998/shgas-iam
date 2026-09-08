import type { TransferEmploymentUseCaseDeps } from "./transfer-employment.port";
import type {
  TransferEmploymentInput,
  TransferEmploymentOptions,
} from "./transfer-employment.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
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
  const mutation = createAdminMutation(deps.uow);
  async function execute(
    input: TransferEmploymentInput,
    options: TransferEmploymentOptions = {},
  ) {
    const { auditContext, authorization } = options;
    function notFound() {
      if (authorization?.kind === "scoped") {
        authorization.denyMutation({ operationId: "admin.employment.transfer", resourceIdentifier: input.employmentId, reason: "RESOURCE_OUT_OF_SCOPE", concealExistence: true });
      }
      return new EmploymentNotFoundError();
    }
    return await mutation.transaction(async (tx) => {
      const context = await tx.employmentStore.getEmploymentLifecycleContextById(input.employmentId);
      if (context === null) {
        throw notFound();
      }
      const primaryIds = input.isPrimary
        ? await tx.employmentStore.getOpenPrimaryEmploymentIdsByUserId(context.employment.userId)
        : [];
      const selected = await tx.employmentStore.lockEmploymentsByIds([input.employmentId, ...primaryIds]);
      const employment = selected.find(row => row.id === input.employmentId);
      if (employment === undefined || employment.isDelete)
        throw notFound();
      if (authorization?.kind === "scoped" && !authorization.organizationIds.includes(employment.orgId))
        throw notFound();
      const selectedAssignments = await tx.responsibilityParentLifecycle.lockAssignmentsForEmployment({
        employmentId: employment.id,
        command: "end",
      });
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
      const updated = await tx.employmentStore.updateEmploymentRecord(employment.id, {
        status: EmploymentStatus.Disable,
        endTime: transactionTime,
        isPrimary: false,
      });
      if (updated == null)
        throw new Error("Locked Employment transfer returned no row");
      const assignmentChanged
        = await tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
          action: "transfer",
          selectedAssignments,
          auditContext,
          employmentId: employment.id,
          endTime: transactionTime,
        });
      const clearedPrimaryEmploymentIds: number[] = [];
      if (input.isPrimary) {
        for (const row of selected) {
          if (row.id === employment.id || row.isDelete || !row.isPrimary
            || (row.status !== EmploymentStatus.Enable && row.status !== EmploymentStatus.Pause)) {
            continue;
          }
          const cleared = await tx.employmentStore.updateEmploymentRecord(row.id, { isPrimary: false });
          if (cleared == null)
            throw new Error("Locked Employment primary update returned no row");
          clearedPrimaryEmploymentIds.push(row.id);
        }
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
      if (created == null)
        throw new Error("Employment insert returned no row");
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
          changed: true,
          clearedPrimaryEmploymentIds,
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
      return { changed: true, result: { id: created.id } };
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type TransferEmploymentUseCase = ReturnType<
  typeof createTransferEmploymentUseCase
>;
