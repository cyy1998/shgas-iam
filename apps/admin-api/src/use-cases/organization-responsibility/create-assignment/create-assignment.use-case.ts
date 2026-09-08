import type { CreateOrganizationResponsibilityAssignmentUseCaseDeps } from "./create-assignment.port";
import type {
  CreateOrganizationResponsibilityAssignmentInput,
  CreateOrganizationResponsibilityAssignmentOptions,
} from "./create-assignment.type";
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildOrganizationResponsibilityAssignmentCreateAudit } from "@admin-api/services/audit/events/organization-responsibility-assignment.audit";
import {
  OrganizationResponsibilityAssignmentStatus,
} from "@iam/contracts";
import { EmploymentNotFoundError } from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import {
  assertOrganizationResponsibilityAssignmentSlotAvailable,
  getOrganizationResponsibilityParentLifecycleViolation,
  OrganizationResponsibilityAssignmentUnmanageableConflictError,
  OrganizationResponsibilityHolderEmploymentUnavailableError,
  OrganizationResponsibilityTargetOrganizationUnavailableError,
} from "@iam/domain/organization-responsibility";

export function createCreateOrganizationResponsibilityAssignmentUseCase(
  deps: CreateOrganizationResponsibilityAssignmentUseCaseDeps,
) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(
    input: CreateOrganizationResponsibilityAssignmentInput,
    options: CreateOrganizationResponsibilityAssignmentOptions,
  ) {
    const { auditContext, authorization } = options;
    return await mutation.transaction(async (tx) => {
      const employment = await tx.employmentReader.getEmploymentForResponsibilityById(input.employmentId);
      if (employment === null)
        throw new EmploymentNotFoundError();
      const targetOrganization = await tx.organizationReader.getOrganizationForResponsibilityByCode(
        input.targetOrganizationCode,
      );
      if (targetOrganization === null)
        throw new OrganizationNotFoundError();
      const endpointsWithinScope
        = tx.assignmentStore.isEndpointPairWithinReadScope({
          readScope: authorization.readScope,
          holderOrganizationId: employment.organizationId,
          targetOrganizationId: targetOrganization.id,
        });
      if (!endpointsWithinScope) {
        authorization.denyMutation({
          operationId: "admin.organizationResponsibility.createAssignment",
          resourceIdentifier: "create-request",
          reason: "RESOURCE_OUT_OF_SCOPE",
        });
      }
      const parentViolation = getOrganizationResponsibilityParentLifecycleViolation({
        assignmentStatus: OrganizationResponsibilityAssignmentStatus.Enable,
        holderEmploymentStatus: employment.isDelete ? null : employment.status,
        targetOrganizationStatus: targetOrganization.isDelete ? null : targetOrganization.status,
      });
      if (parentViolation === "open-assignment-without-enabled-target")
        throw new OrganizationResponsibilityTargetOrganizationUnavailableError();
      if (parentViolation !== null)
        throw new OrganizationResponsibilityHolderEmploymentUnavailableError();

      const slot = {
        employmentId: employment.id,
        targetOrganizationId: targetOrganization.id,
        typeCode: input.typeCode,
      };
      const existing = await tx.assignmentStore.findOpenAssignmentForSlot({
        ...slot,
        readScope: authorization.readScope,
      });
      if (
        existing !== null
        && !existing.isManageable
      ) {
        throw new OrganizationResponsibilityAssignmentUnmanageableConflictError();
      }
      assertOrganizationResponsibilityAssignmentSlotAvailable({
        typeCode: input.typeCode,
        employmentId: employment.id,
        existing,
      });

      const transactionTime = deps.clock.nowDate();
      const record = {
        ...slot,
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        startTime: transactionTime,
        endTime: null,
      } as const;
      const created = await tx.assignmentStore.createAssignmentRecord(record, authorization.readScope);
      await tx.auditLogWriter.recordAuditLog(
        buildOrganizationResponsibilityAssignmentCreateAudit({
          id: created.id,
          ...record,
        }, auditContext),
      );
      await tx.userProfileInvalidation.recordChanges([{
        kind: "organization-responsibility-assignment",
        userId: employment.userId,
      }]);
      return { changed: true, result: { id: created.id } };
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type CreateOrganizationResponsibilityAssignmentUseCase = ReturnType<
  typeof createCreateOrganizationResponsibilityAssignmentUseCase
>;
