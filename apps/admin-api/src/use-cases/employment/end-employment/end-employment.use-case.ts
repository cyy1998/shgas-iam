import type { EndEmploymentUseCaseDeps } from "./end-employment.port";
import type { EndEmploymentInput, EndEmploymentOptions } from "./end-employment.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { EmploymentStatus } from "@iam/contracts";
import {
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";

export function createEndEmploymentUseCase(deps: EndEmploymentUseCaseDeps) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(
    input: EndEmploymentInput,
    options: EndEmploymentOptions = {},
  ) {
    const { auditContext, authorization } = options;
    return await mutation.locked(
      async (tx) => {
        const context = await tx.employmentStore.lockEmploymentLifecycleContextById(input.employmentId);
        if (context === null)
          return null;
        const selectedAssignments = await tx.responsibilityParentLifecycle.lockAssignmentsForEmployment({
          employmentId: input.employmentId,
          command: "end",
        });
        return { ...context, selectedAssignments };
      },
      () => {
        if (authorization?.kind === "scoped") {
          authorization.denyMutation({
            operationId: "admin.employment.end",
            resourceIdentifier: input.employmentId,
            reason: "RESOURCE_OUT_OF_SCOPE",
            concealExistence: true,
          });
        }
        return new EmploymentNotFoundError();
      },
      async (tx, { employment, selectedAssignments }) => {
        if (authorization?.kind === "scoped" && !authorization.organizationIds.includes(employment.orgId)) {
          authorization.denyMutation({
            operationId: "admin.employment.end",
            resourceIdentifier: employment.id,
            reason: "RESOURCE_OUT_OF_SCOPE",
            concealExistence: true,
          });
        }
        if (employment.status === EmploymentStatus.Disable) {
          await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
            "admin.employment.end",
            employment,
            { changed: false, fromStatus: employment.status, toStatus: employment.status, endTime: employment.endTime },
            auditContext,
          ));
          return { changed: false, result: null };
        }
        if (
          employment.status !== EmploymentStatus.Enable
          && employment.status !== EmploymentStatus.Pause
        ) {
          throw new EmploymentNotEditableError("当前任职状态不允许结束");
        }

        const transactionTime = deps.clock.nowDate();
        const updated = await tx.employmentStore.updateEmploymentRecord(employment.id, {
          status: EmploymentStatus.Disable,
          endTime: transactionTime,
          isPrimary: false,
        });
        if (updated == null)
          throw new Error("Locked Employment end returned no row");
        const assignmentChanged
          = await tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
            action: "end",
            selectedAssignments,
            auditContext,
            employmentId: employment.id,
            endTime: transactionTime,
          });
        await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
          "admin.employment.end",
          employment,
          {
            changed: true,
            fromStatus: employment.status,
            toStatus: EmploymentStatus.Disable,
            endTime: transactionTime,
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
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return { execute };
}

export type EndEmploymentUseCase = ReturnType<typeof createEndEmploymentUseCase>;
