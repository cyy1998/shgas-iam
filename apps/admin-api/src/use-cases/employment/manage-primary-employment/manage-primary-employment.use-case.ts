import type { ManagePrimaryEmploymentUseCaseDeps } from "./manage-primary-employment.port";
import type {
  ManagePrimaryEmploymentInput,
  ManagePrimaryEmploymentOptions,
} from "./manage-primary-employment.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { EmploymentStatus } from "@iam/contracts";
import {
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";

export function createManagePrimaryEmploymentUseCase(
  deps: ManagePrimaryEmploymentUseCaseDeps,
) {
  async function execute(
    input: ManagePrimaryEmploymentInput,
    options: ManagePrimaryEmploymentOptions = {},
  ) {
    const { auditContext } = options;
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
        throw new EmploymentNotEditableError("已结束任职不能调整主任职");
      }

      const nextPrimary = input.command === "set";
      if (employment.isPrimary === nextPrimary) {
        return true;
      }

      if (nextPrimary) {
        await tx.employmentStore.unsetOpenPrimariesByUserId(employment.userId);
      }
      await tx.employmentStore.updateEmploymentRecord(employment.id, {
        isPrimary: nextPrimary,
      });
      await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
        nextPrimary
          ? "admin.employment.set_primary"
          : "admin.employment.clear_primary",
        employment,
        { primary: nextPrimary },
        auditContext,
      ));
      await tx.userProfileInvalidation.recordChanges([
        { kind: "employment", userId: employment.userId },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type ManagePrimaryEmploymentUseCase = ReturnType<
  typeof createManagePrimaryEmploymentUseCase
>;
