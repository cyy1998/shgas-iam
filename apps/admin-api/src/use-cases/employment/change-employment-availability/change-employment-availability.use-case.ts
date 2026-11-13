import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { assertEmploymentOrganizationScope } from "@admin-api/services/employment/employment-organization-scope";
import { endLockedEmployments, updateLockedEmployment } from "@iam/assignment-resolution/employment-lifecycle";
import { EmploymentStatus, isOpenEmploymentStatus, OrganizationStatus, PositionStatus } from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";
import { getEmploymentDate, getEmploymentStatusForDate } from "@iam/domain/employment/employment-date";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import type {
  ChangeEmploymentAvailabilityTransactionPorts,
  ChangeEmploymentAvailabilityUseCaseDeps,
} from "./change-employment-availability.port";
import type {
  ChangeEmploymentAvailabilityInput,
  ChangeEmploymentAvailabilityOptions,
} from "./change-employment-availability.type";

export function createChangeEmploymentAvailabilityUseCase(deps: ChangeEmploymentAvailabilityUseCaseDeps) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(input: ChangeEmploymentAvailabilityInput, options: ChangeEmploymentAvailabilityOptions = {}) {
    const { auditContext, authorization } = options;
    return await mutation.locked(
      (tx) => tx.employmentStore.lockEmploymentLifecycleContextById(input.employmentId),
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
        const { employment } = context;
        if (authorization?.kind === "scoped" && !authorization.organizationIds.includes(employment.orgId)) {
          authorization.denyMutation({
            operationId: input.command === "pause" ? "admin.employment.pause" : "admin.employment.resume",
            resourceIdentifier: employment.id,
            reason: "RESOURCE_OUT_OF_SCOPE",
            concealExistence: true,
          });
        }
        const action = input.command === "pause" ? "admin.employment.pause" : "admin.employment.resume";
        const noOpStatus = input.command === "pause" ? EmploymentStatus.Pause : EmploymentStatus.Enable;
        if (employment.status === noOpStatus) {
          await tx.auditLogWriter.recordAuditLog(
            buildEmploymentAudit(
              action,
              employment,
              {
                changed: false,
                fromStatus: employment.status,
                toStatus: employment.status,
              },
              auditContext,
            ),
          );
          return { changed: false, result: null };
        }
        if (input.command === "pause") {
          if (!isOpenEmploymentStatus(employment.status)) {
            throw new EmploymentNotEditableError("当前任职状态不允许暂停");
          }
          const selectedAssignments = await tx.responsibilityParentLifecycle.lockAssignmentsForEmployment({
            employmentId: employment.id,
            command: "pause",
          });
          const { documentChanges, ...change } = await updateLockedEmployment(tx.employmentStore, {
            employment,
            status: EmploymentStatus.Pause,
            pauseSelectedAssignments: () =>
              tx.responsibilityParentLifecycle.pauseEnabledAssignmentsForEmployment({
                auditContext,
                employmentId: employment.id,
                selectedAssignments,
              }),
          });
          await recordAvailabilityChange(tx, action, employment, change, documentChanges, auditContext);
          return { changed: true, result: null };
        }

        if (employment.status !== EmploymentStatus.Pause) {
          throw new EmploymentNotEditableError("当前任职状态不允许恢复");
        }
        if (
          context.organization === null ||
          context.organization.status !== OrganizationStatus.Enable ||
          context.organization.isDelete
        ) {
          throw new OrganizationNotFoundError("组织未启用或不存在");
        }
        if (
          context.position === null ||
          context.position.status !== PositionStatus.Enable ||
          context.position.isDelete
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

        let instant = deps.clock.nowDate();
        let operationDate = getEmploymentDate(instant);
        let status = getEmploymentStatusForDate(employment, operationDate);
        const selectedAssignments =
          status === EmploymentStatus.Disable
            ? await tx.responsibilityParentLifecycle.lockAssignmentsForEmployment({
                employmentId: employment.id,
                command: "end",
              })
            : undefined;
        if (selectedAssignments) {
          instant = deps.clock.nowDate();
          operationDate = getEmploymentDate(instant);
          status = getEmploymentStatusForDate(employment, operationDate);
        }
        if (status === EmploymentStatus.Disable) {
          if (!selectedAssignments) throw new Error("Employment resume requires a locked Assignment selection");
          const {
            documentChanges,
            endedEmployments: [ended],
          } = await endLockedEmployments(tx.employmentStore, {
            userId: employment.userId,
            employments: [employment],
            operationDate,
            endSelectedAssignments: () =>
              tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
                action: "resume",
                auditContext,
                employmentId: employment.id,
                endTime: instant,
                selectedAssignments,
              }),
          });
          if (!ended) throw new Error("Locked Employment resume did not end the selected row");
          await recordAvailabilityChange(
            tx,
            action,
            employment,
            {
              changed: true,
              fromStatus: ended.fromStatus,
              toStatus: ended.toStatus,
              previousPeriod: ended.previousPeriod,
              finalPeriod: ended.finalPeriod,
            },
            documentChanges,
            auditContext,
            instant,
          );
        } else {
          const { documentChanges, ...change } = await updateLockedEmployment(tx.employmentStore, {
            employment,
            status,
          });
          await recordAvailabilityChange(tx, action, employment, change, documentChanges, auditContext, instant);
        }
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return { execute };
}

export type ChangeEmploymentAvailabilityUseCase = ReturnType<typeof createChangeEmploymentAvailabilityUseCase>;

async function recordAvailabilityChange(
  tx: ChangeEmploymentAvailabilityTransactionPorts,
  action: "admin.employment.pause" | "admin.employment.resume",
  employment: Parameters<typeof buildEmploymentAudit>[1],
  details: Record<string, unknown>,
  documentChanges: Parameters<
    ChangeEmploymentAvailabilityTransactionPorts["userDocumentInvalidation"]["recordChanges"]
  >[0],
  auditContext: ChangeEmploymentAvailabilityOptions["auditContext"],
  eventTime?: Date,
) {
  await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(action, employment, details, auditContext, eventTime));
  await tx.userDocumentInvalidation.recordChanges(documentChanges);
}
