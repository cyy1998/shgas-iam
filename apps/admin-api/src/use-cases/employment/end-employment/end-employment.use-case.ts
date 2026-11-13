import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { endLockedEmployments } from "@iam/assignment-resolution/employment-lifecycle";
import { EmploymentStatus, isOpenEmploymentStatus } from "@iam/contracts";
import { EmploymentNotEditableError, EmploymentNotFoundError } from "@iam/domain/employment";
import { getEmploymentDate } from "@iam/domain/employment/employment-date";
import type { EndEmploymentUseCaseDeps } from "./end-employment.port";
import type { EndEmploymentInput, EndEmploymentOptions } from "./end-employment.type";

export function createEndEmploymentUseCase(deps: EndEmploymentUseCaseDeps) {
  const mutation = createAdminMutation(deps.uow);
  async function execute(input: EndEmploymentInput, options: EndEmploymentOptions = {}) {
    const { auditContext, authorization } = options;
    return await mutation.locked(
      async (tx) => {
        const context = await tx.employmentStore.lockEmploymentLifecycleContextById(input.employmentId);
        if (context === null) return null;
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
          await tx.auditLogWriter.recordAuditLog(
            buildEmploymentAudit(
              "admin.employment.end",
              employment,
              {
                changed: false,
                fromStatus: employment.status,
                toStatus: employment.status,
                endTime: employment.endTime,
              },
              auditContext,
            ),
          );
          return { changed: false, result: null };
        }
        if (!isOpenEmploymentStatus(employment.status)) {
          throw new EmploymentNotEditableError("当前任职状态不允许结束");
        }

        const transactionTime = deps.clock.nowDate();
        const operationDate = getEmploymentDate(transactionTime);
        const {
          documentChanges,
          endedEmployments: [ended],
        } = await endLockedEmployments(tx.employmentStore, {
          userId: employment.userId,
          employments: [employment],
          operationDate,
          endSelectedAssignments: () =>
            tx.responsibilityParentLifecycle.endOpenAssignmentsForEmployment({
              action: "end",
              selectedAssignments,
              auditContext,
              employmentId: employment.id,
              endTime: transactionTime,
            }),
        });
        if (!ended) throw new Error("Locked Employment end did not change the selected row");
        await tx.auditLogWriter.recordAuditLog(
          buildEmploymentAudit(
            "admin.employment.end",
            employment,
            {
              changed: true,
              fromStatus: employment.status,
              toStatus: EmploymentStatus.Disable,
              endTime: operationDate,
              previousPeriod: ended.previousPeriod,
              finalPeriod: ended.finalPeriod,
            },
            auditContext,
            transactionTime,
          ),
        );
        await tx.userDocumentInvalidation.recordChanges(documentChanges);
        return { changed: true, result: null };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return { execute };
}

export type EndEmploymentUseCase = ReturnType<typeof createEndEmploymentUseCase>;
