import type { EndEmploymentUseCaseDeps } from "./end-employment.port";
import type { EndEmploymentInput, EndEmploymentOptions } from "./end-employment.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { EmploymentStatus } from "@iam/contracts";
import {
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";

export function createEndEmploymentUseCase(deps: EndEmploymentUseCaseDeps) {
  async function execute(
    input: EndEmploymentInput,
    options: EndEmploymentOptions = {},
  ) {
    const { auditContext } = options;
    return await deps.uow.transaction(async (tx) => {
      const context = await tx.employmentStore.getEmploymentLifecycleContextById(input.employmentId);
      if (context === null) {
        throw new EmploymentNotFoundError();
      }

      const { employment } = context;
      if (employment.status === EmploymentStatus.Disable) {
        return true;
      }
      if (
        employment.status !== EmploymentStatus.Enable
        && employment.status !== EmploymentStatus.Pause
      ) {
        throw new EmploymentNotEditableError("当前任职状态不允许结束");
      }

      const transactionTime = deps.clock.nowDate();
      await tx.employmentStore.updateEmploymentRecord(employment.id, {
        status: EmploymentStatus.Disable,
        endTime: transactionTime,
        isPrimary: false,
      });
      const assignmentChanged
        = await tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
          action: "end",
          auditContext,
          employmentId: employment.id,
          endTime: transactionTime,
        });
      await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
        "admin.employment.end",
        employment,
        {
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
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type EndEmploymentUseCase = ReturnType<typeof createEndEmploymentUseCase>;
