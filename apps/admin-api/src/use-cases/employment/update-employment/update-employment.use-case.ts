import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import {
  endLockedEmployments,
  mustPauseEmploymentAssignments,
  updateLockedEmployment,
} from "@iam/assignment-resolution/employment-lifecycle";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import { EmploymentStatus, isOpenEmploymentStatus } from "@iam/contracts";
import { type EmploymentDetail, EmploymentNotEditableError, EmploymentNotFoundError } from "@iam/domain/employment";
import {
  assertValidEmploymentPeriod,
  type EmploymentPeriod,
  getEmploymentDate,
  getEmploymentStatusForDate,
} from "@iam/domain/employment/employment-date";
import { BadRequestError } from "@iam/runtime/errors";
import type { UpdateEmploymentTransactionPorts, UpdateEmploymentUseCaseDeps } from "./update-employment.port";
import type { UpdateEmploymentInput, UpdateEmploymentOptions } from "./update-employment.type";

export function createUpdateEmploymentUseCase(deps: UpdateEmploymentUseCaseDeps) {
  const mutation = createAdminMutation(deps.uow);

  async function execute(input: UpdateEmploymentInput, options: UpdateEmploymentOptions = {}) {
    const { employmentId, description, startTime, endTime } = input;
    const { auditContext, authorization } = options;
    const editsPeriod = startTime !== undefined || endTime !== undefined;
    if (!editsPeriod && description === undefined) throw new BadRequestError("至少提交一个任职更新字段");
    const notFound = () => {
      if (authorization?.kind === "scoped") {
        authorization.denyMutation({
          operationId: "admin.employment.update",
          resourceIdentifier: employmentId,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
      return new EmploymentNotFoundError();
    };

    return await mutation.locked(
      (tx) => tx.employmentStore.lockEmploymentByIdForAdmin(employmentId),
      notFound,
      async (tx, employment) => {
        if (authorization?.kind === "scoped" && !authorization.organizationIds.includes(employment.orgId)) {
          throw notFound();
        }
        if (!isOpenEmploymentStatus(employment.status)) throw new EmploymentNotEditableError();

        const descriptionChanged = description !== undefined && description !== employment.description;
        const descriptionPatch = descriptionChanged ? { description } : {};
        const period = editsPeriod
          ? {
              startTime: startTime === undefined ? employment.startTime : startTime,
              endTime: endTime === undefined ? employment.endTime : endTime,
            }
          : undefined;

        let periodChange: Awaited<ReturnType<typeof persistPeriod>>;
        if (period && (period.startTime !== employment.startTime || period.endTime !== employment.endTime)) {
          assertValidEmploymentPeriod(period);
          periodChange = await persistPeriod(tx, employment, period, descriptionPatch, deps.clock, auditContext);
        }
        if (!descriptionChanged && !periodChange) return { changed: false, result: null };

        if (!periodChange) {
          const updated = await tx.employmentStore.updateEmploymentRecord(employmentId, descriptionPatch);
          if (updated == null) throw new Error("Locked Employment update returned no row");
        }
        await tx.auditLogWriter.recordAuditLog(
          buildEmploymentAudit(
            "admin.employment.update",
            employment,
            {
              changed: true,
              patch: { ...descriptionPatch, ...(periodChange ? periodChange.finalPeriod : {}) },
              ...(periodChange && {
                cause: "editPeriod",
                fromStatus: periodChange.fromStatus,
                toStatus: periodChange.toStatus,
                previousPeriod: periodChange.previousPeriod,
                finalPeriod: periodChange.finalPeriod,
              }),
            },
            auditContext,
            periodChange?.observedAt,
          ),
        );
        await tx.userDocumentInvalidation.recordChanges(
          periodChange?.documentChanges ?? [{ kind: "employment", userId: employment.userId }],
        );
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return { execute };
}

export type UpdateEmploymentUseCase = ReturnType<typeof createUpdateEmploymentUseCase>;

async function persistPeriod(
  tx: UpdateEmploymentTransactionPorts,
  employment: EmploymentDetail,
  period: EmploymentPeriod,
  descriptionPatch: { description?: string | null },
  clock: UpdateEmploymentUseCaseDeps["clock"],
  auditContext: UpdateEmploymentOptions["auditContext"],
) {
  const { id: employmentId } = employment;
  const statusForDate = (date: string) =>
    getEmploymentStatusForDate(period, date, { preservePause: employment.status === EmploymentStatus.Pause });
  let operationTime = clock.nowDate();
  let operationDate = getEmploymentDate(operationTime);
  let status = statusForDate(operationDate);
  let selectedAssignments: OrganizationResponsibilityAssignmentWriteTarget[] | undefined;
  if (status === EmploymentStatus.Disable || mustPauseEmploymentAssignments(employment.status, status)) {
    // A date change can turn a pending transition into an end while waiting for an Assignment.
    selectedAssignments = await tx.responsibilityParentLifecycle.lockAssignmentsForEmployment({
      employmentId,
      command: "end",
    });
    operationTime = clock.nowDate();
    operationDate = getEmploymentDate(operationTime);
    status = statusForDate(operationDate);
  }
  const store: Pick<UpdateEmploymentTransactionPorts["employmentStore"], "updateEmploymentRecord"> = {
    updateEmploymentRecord: (id, patch) =>
      tx.employmentStore.updateEmploymentRecord(id, { ...patch, ...descriptionPatch }),
  };

  if (status === EmploymentStatus.Disable) {
    const assignmentsToEnd = selectedAssignments;
    if (!assignmentsToEnd) throw new Error("Employment end requires a locked Assignment selection");
    const {
      documentChanges,
      endedEmployments: [ended],
    } = await endLockedEmployments(store, {
      userId: employment.userId,
      employments: [employment],
      operationDate,
      replacementStartTime: period.startTime,
      endSelectedAssignments: () =>
        tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
          action: "editPeriod",
          employmentId,
          endTime: operationTime,
          selectedAssignments: assignmentsToEnd,
          auditContext,
        }),
    });
    if (!ended) throw new Error("Locked Employment end did not change the selected row");
    return { ...ended, documentChanges, observedAt: operationTime };
  }

  const shouldPauseAssignments = mustPauseEmploymentAssignments(employment.status, status);
  if (shouldPauseAssignments && !selectedAssignments)
    throw new Error("Employment date change requires a locked Assignment selection");
  const assignmentsToPause = shouldPauseAssignments ? selectedAssignments : undefined;
  const result = await updateLockedEmployment(store, {
    employment,
    status,
    period,
    pauseSelectedAssignments:
      assignmentsToPause &&
      (() =>
        tx.responsibilityParentLifecycle.pauseEnabledAssignmentsForEmployment({
          action: "editPeriod",
          employmentId,
          eventTime: operationTime,
          selectedAssignments: assignmentsToPause,
          auditContext,
        })),
  });
  return result.changed ? { ...result, observedAt: operationTime } : undefined;
}
