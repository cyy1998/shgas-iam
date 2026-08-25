import type {
  ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts,
  ManageOrganizationResponsibilityAssignmentLifecycleUseCaseDeps,
  OrganizationResponsibilityAssignmentLifecycleContext,
} from "./manage-assignment-lifecycle.port";
import type {
  ManageOrganizationResponsibilityAssignmentLifecycleInput,
  ManageOrganizationResponsibilityAssignmentLifecycleOptions,
} from "./manage-assignment-lifecycle.type";
import { ADMIN_ORGANIZATION_RESPONSIBILITY_LIFECYCLE_OPERATION_IDS } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildOrganizationResponsibilityAssignmentLifecycleAudit } from "@admin-api/services/audit/events/organization-responsibility-assignment.audit";
import { CustomError } from "@iam/api-core/errors";
import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS,
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
} from "@iam/contracts";
import {
  assertOrganizationResponsibilityAssignmentResumeAvailable,
  assertOrganizationResponsibilityAssignmentSlotAvailable,
  OrganizationResponsibilityAssignmentNotFoundError,
  OrganizationResponsibilityHolderEmploymentUnavailableError,
  resolveOrganizationResponsibilityAssignmentTransition,
} from "@iam/domain/organization-responsibility";

export function createManageOrganizationResponsibilityAssignmentLifecycleUseCase(
  deps: ManageOrganizationResponsibilityAssignmentLifecycleUseCaseDeps,
) {
  async function execute(
    input: ManageOrganizationResponsibilityAssignmentLifecycleInput,
    options: ManageOrganizationResponsibilityAssignmentLifecycleOptions,
  ) {
    const { auditContext, authorization } = options;
    return await deps.uow.transaction(async (tx) => {
      const context
        = await tx.assignmentStore.getAssignmentLifecycleContextById(input.id);
      if (context === null)
        throw new OrganizationResponsibilityAssignmentNotFoundError();

      const employment = context.employment;
      const endpointsWithinScope = authorization.kind === "full"
        || (employment !== null
          && tx.assignmentStore.isEndpointPairWithinReadScope({
            readScope: authorization.readScope,
            holderOrganizationId: employment.organizationId,
            targetOrganizationId: context.assignment.targetOrganizationId,
          }));
      if (!endpointsWithinScope) {
        authorization.denyMutation({
          operationId:
            ADMIN_ORGANIZATION_RESPONSIBILITY_LIFECYCLE_OPERATION_IDS[
              input.command
            ],
          resourceIdentifier: "assignment-request",
          reason: "RESOURCE_OUT_OF_SCOPE",
        });
      }

      const transition = resolveOrganizationResponsibilityAssignmentTransition({
        command: input.command,
        status: context.assignment.status,
      });
      if (!transition.changed)
        return true;

      if (employment === null)
        throw new OrganizationResponsibilityHolderEmploymentUnavailableError();
      if (
        input.command
        === ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume
      ) {
        await assertResumeAvailable(tx, context);
      }

      const endTime
        = input.command === ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End
          ? deps.clock.nowDate()
          : null;
      const changed = await tx.assignmentStore.updateAssignmentLifecycle({
        id: context.assignment.id,
        expectedStatus: transition.fromStatus,
        status: transition.toStatus,
        endTime,
      });
      if (!changed) {
        const latest
          = await tx.assignmentStore.getAssignmentLifecycleContextById(input.id);
        if (latest === null)
          throw new OrganizationResponsibilityAssignmentNotFoundError();
        const latestTransition
          = resolveOrganizationResponsibilityAssignmentTransition({
            command: input.command,
            status: latest.assignment.status,
          });
        if (!latestTransition.changed)
          return true;
        throw new CustomError();
      }

      await tx.auditLogWriter.recordAuditLog(
        buildOrganizationResponsibilityAssignmentLifecycleAudit({
          action:
            ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS[input.command],
          assignment: context.assignment,
          before: {
            status: transition.fromStatus,
            startTime: context.assignment.startTime,
            endTime: context.assignment.endTime,
          },
          after: {
            status: transition.toStatus,
            startTime: context.assignment.startTime,
            endTime,
          },
          auditContext,
        }),
      );
      await tx.userProfileInvalidation.recordChanges([
        {
          kind: "organization-responsibility-assignment",
          userId: employment.userId,
        },
      ]);
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

async function assertResumeAvailable(
  tx: ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts,
  context: OrganizationResponsibilityAssignmentLifecycleContext,
) {
  assertOrganizationResponsibilityAssignmentResumeAvailable({
    holderEmployment: context.employment,
    targetOrganization: context.targetOrganization,
  });
  const assignment = context.assignment;
  const existing = await tx.assignmentStore.findOpenAssignmentForSlot({
    employmentId: assignment.employmentId,
    targetOrganizationId: assignment.targetOrganizationId,
    typeCode: assignment.typeCode,
    excludeAssignmentId: assignment.id,
  });
  assertOrganizationResponsibilityAssignmentSlotAvailable({
    typeCode: assignment.typeCode,
    employmentId: assignment.employmentId,
    existing,
  });
}

export type ManageOrganizationResponsibilityAssignmentLifecycleUseCase
  = ReturnType<
    typeof createManageOrganizationResponsibilityAssignmentLifecycleUseCase
  >;
