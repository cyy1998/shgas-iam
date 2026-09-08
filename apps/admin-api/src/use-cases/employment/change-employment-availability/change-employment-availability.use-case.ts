import type {
  ChangeEmploymentAvailabilityTransactionPorts,
  ChangeEmploymentAvailabilityUseCaseDeps,
  EmploymentLifecycleContext,
} from "./change-employment-availability.port";
import type {
  ChangeEmploymentAvailabilityInput,
  ChangeEmploymentAvailabilityOptions,
} from "./change-employment-availability.type";
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

export function createChangeEmploymentAvailabilityUseCase(
  deps: ChangeEmploymentAvailabilityUseCaseDeps,
) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(
    input: ChangeEmploymentAvailabilityInput,
    options: ChangeEmploymentAvailabilityOptions = {},
  ) {
    const { auditContext, authorization } = options;
    return await mutation.locked(
      async (tx) => {
        const context = await tx.employmentStore.lockEmploymentLifecycleContextById(input.employmentId);
        if (context === null)
          return null;
        const selectedAssignments = input.command === "pause"
          ? await tx.responsibilityParentLifecycle.lockAssignmentsForEmployment({
              employmentId: input.employmentId,
              command: "pause",
            })
          : [];
        return { ...context, selectedAssignments };
      },
      () => {
        if (authorization?.kind === "scoped") {
          authorization.denyMutation({
            operationId: input.command === "pause" ? "admin.employment.pause" : "admin.employment.resume",
            resourceIdentifier: input.employmentId,
            reason: "RESOURCE_OUT_OF_SCOPE",
            concealExistence: true,
          });
        }
        return new EmploymentNotFoundError();
      },
      async (tx, context) => {
        const { employment, selectedAssignments } = context;
        if (authorization?.kind === "scoped" && !authorization.organizationIds.includes(employment.orgId)) {
          authorization.denyMutation({
            operationId: input.command === "pause" ? "admin.employment.pause" : "admin.employment.resume",
            resourceIdentifier: employment.id,
            reason: "RESOURCE_OUT_OF_SCOPE",
            concealExistence: true,
          });
        }
        const targetStatus = input.command === "pause" ? EmploymentStatus.Pause : EmploymentStatus.Enable;
        if (employment.status === targetStatus) {
          await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
            input.command === "pause" ? "admin.employment.pause" : "admin.employment.resume",
            employment,
            { changed: false, fromStatus: employment.status, toStatus: targetStatus },
            auditContext,
          ));
          return { changed: false, result: null };
        }
        if (input.command === "pause") {
          if (employment.status !== EmploymentStatus.Enable)
            throw new EmploymentNotEditableError("当前任职状态不允许暂停");
          await persistAvailabilityChange(
            tx,
            employment,
            EmploymentStatus.Enable,
            EmploymentStatus.Pause,
            "admin.employment.pause",
            auditContext,
            selectedAssignments,
          );
          return { changed: true, result: null };
        }

        if (employment.status !== EmploymentStatus.Pause) {
          throw new EmploymentNotEditableError("当前任职状态不允许恢复");
        }
        if (
          context.organization === null
          || context.organization.status !== OrganizationStatus.Enable
          || context.organization.isDelete
        ) {
          throw new OrganizationNotFoundError("组织未启用或不存在");
        }
        if (
          context.position === null
          || context.position.status !== PositionStatus.Enable
          || context.position.isDelete
        ) {
          throw new PositionNotFoundError("岗位未启用或不存在");
        }
        await assertEmploymentOrganizationScope(
          tx.organizationReader,
          context.organization.orgCode,
          input.expectedAncestorOrgCode,
          "任职组织不属于期望组织范围",
        );

        const conflict = await tx.employmentStore.getOpenEmploymentByUserOrgPosId(
          employment.userId,
          employment.orgId,
          employment.posId,
          employment.id,
        );
        if (conflict !== null) {
          throw new EmploymentAlreadyExistsError();
        }

        await persistAvailabilityChange(
          tx,
          employment,
          EmploymentStatus.Pause,
          EmploymentStatus.Enable,
          "admin.employment.resume",
          auditContext,
          selectedAssignments,
        );
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return { execute };
}

export type ChangeEmploymentAvailabilityUseCase = ReturnType<
  typeof createChangeEmploymentAvailabilityUseCase
>;

async function persistAvailabilityChange(
  tx: ChangeEmploymentAvailabilityTransactionPorts,
  employment: EmploymentLifecycleContext["employment"],
  fromStatus: EmploymentStatus.Enable | EmploymentStatus.Pause,
  toStatus: EmploymentStatus.Enable | EmploymentStatus.Pause,
  action: "admin.employment.pause" | "admin.employment.resume",
  auditContext: ChangeEmploymentAvailabilityOptions["auditContext"],
  selectedAssignments: Awaited<ReturnType<ChangeEmploymentAvailabilityTransactionPorts["responsibilityParentLifecycle"]["lockAssignmentsForEmployment"]>>,
) {
  const updated = await tx.employmentStore.updateEmploymentRecord(employment.id, { status: toStatus });
  if (updated == null)
    throw new Error("Locked Employment status update returned no row");
  const assignmentChanged = action === "admin.employment.pause"
    ? await tx.responsibilityParentLifecycle.pauseEnabledAssignmentsForEmployment({
        auditContext,
        employmentId: employment.id,
        selectedAssignments,
      })
    : false;
  await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
    action,
    employment,
    { changed: true, fromStatus, toStatus },
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
}
