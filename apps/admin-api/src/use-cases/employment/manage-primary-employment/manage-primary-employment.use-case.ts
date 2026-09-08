import type { ManagePrimaryEmploymentUseCaseDeps } from "./manage-primary-employment.port";
import type {
  ManagePrimaryEmploymentInput,
  ManagePrimaryEmploymentOptions,
} from "./manage-primary-employment.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
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
  const mutation = createAdminMutation(deps.uow);
  async function execute(
    input: ManagePrimaryEmploymentInput,
    options: ManagePrimaryEmploymentOptions = {},
  ) {
    const { auditContext, authorization } = options;
    const operationId = input.command === "set" ? "admin.employment.setPrimary" : "admin.employment.clearPrimary";
    function notFound() {
      if (authorization?.kind === "scoped") {
        authorization.denyMutation({ operationId, resourceIdentifier: input.employmentId, reason: "RESOURCE_OUT_OF_SCOPE", concealExistence: true });
      }
      return new EmploymentNotFoundError();
    }
    return await mutation.transaction(async (tx) => {
      const context = await tx.employmentStore.getEmploymentLifecycleContextById(input.employmentId);
      if (context === null) {
        throw notFound();
      }

      const primaryIds = input.command === "set"
        ? await tx.employmentStore.getOpenPrimaryEmploymentIdsByUserId(context.employment.userId)
        : [];
      const selected = await tx.employmentStore.lockEmploymentsByIds([input.employmentId, ...primaryIds]);
      const employment = selected.find(row => row.id === input.employmentId);
      if (employment === undefined || employment.isDelete)
        throw notFound();
      if (authorization?.kind === "scoped" && !authorization.organizationIds.includes(employment.orgId))
        throw notFound();
      if (
        employment.status !== EmploymentStatus.Enable
        && employment.status !== EmploymentStatus.Pause
      ) {
        throw new EmploymentNotEditableError("已结束任职不能调整主任职");
      }

      const nextPrimary = input.command === "set";
      const changed = employment.isPrimary !== nextPrimary;
      const clearedPrimaryEmploymentIds: number[] = [];
      if (changed && nextPrimary) {
        for (const row of selected) {
          if (row.id === employment.id || row.isDelete || !row.isPrimary
            || (row.status !== EmploymentStatus.Enable && row.status !== EmploymentStatus.Pause)) {
            continue;
          }
          const updated = await tx.employmentStore.updateEmploymentRecord(row.id, { isPrimary: false });
          if (updated == null)
            throw new Error("Locked Employment primary update returned no row");
          clearedPrimaryEmploymentIds.push(row.id);
        }
      }
      if (changed) {
        const updated = await tx.employmentStore.updateEmploymentRecord(employment.id, { isPrimary: nextPrimary });
        if (updated == null)
          throw new Error("Locked Employment primary update returned no row");
      }
      await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
        nextPrimary
          ? "admin.employment.set_primary"
          : "admin.employment.clear_primary",
        employment,
        { changed, primary: nextPrimary, clearedPrimaryEmploymentIds },
        auditContext,
      ));
      if (changed) {
        await tx.userProfileInvalidation.recordChanges([
          { kind: "employment", userId: employment.userId },
        ]);
      }
      return { changed, result: null };
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type ManagePrimaryEmploymentUseCase = ReturnType<
  typeof createManagePrimaryEmploymentUseCase
>;
