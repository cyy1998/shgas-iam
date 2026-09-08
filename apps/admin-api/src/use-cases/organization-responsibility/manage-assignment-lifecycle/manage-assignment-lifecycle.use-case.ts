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
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildOrganizationResponsibilityAssignmentLifecycleAudit } from "@admin-api/services/audit/events/organization-responsibility-assignment.audit";
import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS,
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
} from "@iam/contracts";
import {
  assertOrganizationResponsibilityAssignmentResumeAvailable,
  assertOrganizationResponsibilityAssignmentSlotAvailable,
  OrganizationResponsibilityAssignmentNotFoundError,
  OrganizationResponsibilityAssignmentUnmanageableConflictError,
  OrganizationResponsibilityHolderEmploymentUnavailableError,
  resolveOrganizationResponsibilityAssignmentTransition,
} from "@iam/domain/organization-responsibility";

export function createManageOrganizationResponsibilityAssignmentLifecycleUseCase(
  deps: ManageOrganizationResponsibilityAssignmentLifecycleUseCaseDeps,
) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(
    input: ManageOrganizationResponsibilityAssignmentLifecycleInput,
    options: ManageOrganizationResponsibilityAssignmentLifecycleOptions,
  ) {
    const { auditContext, authorization } = options;
    return await mutation.locked(
      tx => tx.assignmentStore.lockAssignmentLifecycleContextById(input.id),
      () => new OrganizationResponsibilityAssignmentNotFoundError(),
      async (tx, context) => {
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
        if (!transition.changed) {
          const state = {
            status: context.assignment.status,
            startTime: context.assignment.startTime,
            endTime: context.assignment.endTime,
          };
          await tx.auditLogWriter.recordAuditLog(
            buildOrganizationResponsibilityAssignmentLifecycleAudit({
              action: ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS[input.command],
              assignment: context.assignment,
              before: state,
              after: state,
              changed: false,
              auditContext,
            }),
          );
          return { changed: false, result: null };
        }

        if (employment === null)
          throw new OrganizationResponsibilityHolderEmploymentUnavailableError();
        if (
          input.command
          === ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.Resume
        ) {
          await assertResumeAvailable(tx, context, authorization);
        }

        const endTime
          = input.command === ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS.End
            ? deps.clock.nowDate()
            : null;
        await tx.assignmentStore.updateLockedAssignmentLifecycle({
          assignment: context.assignment,
          status: transition.toStatus,
          endTime,
        });

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
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return { execute };
}

async function assertResumeAvailable(
  tx: ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts,
  context: OrganizationResponsibilityAssignmentLifecycleContext,
  authorization: ManageOrganizationResponsibilityAssignmentLifecycleOptions["authorization"],
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
    readScope: authorization.readScope,
  });
  if (existing !== null && !existing.isManageable)
    throw new OrganizationResponsibilityAssignmentUnmanageableConflictError();
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
