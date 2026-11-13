import { endLockedEmployments, updateLockedEmployment } from "@iam/assignment-resolution/employment-lifecycle";
import {
  buildResponsibilityAssignmentCascadeAuditDetails,
  endLockedResponsibilityAssignments,
} from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import {
  AuditActions,
  EmploymentStatus,
  isOpenEmploymentStatus,
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS,
} from "@iam/contracts";
import { getEmploymentDate, getEmploymentStatusForDate } from "@iam/domain/employment/employment-date";
import type { EmploymentSweepPhase, SweepEmploymentsUseCaseDeps } from "./sweep-employments.port";

const phases = ["end", "enable"] as const;

export function createSweepEmploymentsUseCase({ uow, clock, reportTransitionFailure }: SweepEmploymentsUseCaseDeps) {
  async function execute(date: string, signal: AbortSignal) {
    const result = { ended: 0, enabled: 0, failed: 0 };
    const sameDay = () => date === getEmploymentDate(clock.nowDate());
    for (const phase of phases) {
      let afterId: number | undefined;
      while (!signal.aborted && sameDay()) {
        const candidates = await uow.transaction(({ selectCandidates }) => selectCandidates(date, phase, afterId));
        const last = candidates.at(-1);
        if (!last) break;
        for (const { id } of candidates) {
          if (signal.aborted || !sameDay()) return result;
          try {
            const outcome = await transition(id, date, phase);
            if (outcome) result[outcome]++;
          } catch (error) {
            result.failed++;
            reportTransitionFailure({ date, employmentId: id, phase }, error);
          }
        }
        afterId = last.id;
      }
    }
    return result;
  }

  async function transition(id: number, scanDate: string, phase: EmploymentSweepPhase) {
    return await uow.transaction(
      async ({ lockEmployment, employmentStore, assignments, recordAudit, invalidateDocuments }) => {
        const employment = await lockEmployment(id);
        if (!employment || employment.isDelete || !isOpenEmploymentStatus(employment.status)) return;
        const observedAfterEmploymentLock = clock.nowDate();
        if (getEmploymentDate(observedAfterEmploymentLock) !== scanDate) return;
        const desiredStatus = getEmploymentStatusForDate(employment, scanDate, {
          preservePause: employment.status === EmploymentStatus.Pause,
        });
        if (desiredStatus === EmploymentStatus.Disable) {
          const selectedAssignments = await assignments.lockAssignmentsForEmployment({
            employmentId: id,
            command: "end",
          });
          // An assignment may have been created before we acquired the Employment lock.
          const observedAt = clock.nowDate();
          const operationDate = getEmploymentDate(observedAt);
          if (operationDate !== scanDate) return;
          const result = await endLockedEmployments(employmentStore, {
            userId: employment.userId,
            employments: [employment],
            operationDate,
            async endSelectedAssignments() {
              const changes = await endLockedResponsibilityAssignments(assignments, {
                employmentId: id,
                selectedAssignments,
                endTime: observedAt,
              });
              for (const change of changes) {
                await recordAudit({
                  eventTime: observedAt,
                  action: ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_AUDIT_ACTIONS.end,
                  targetType: "organization_responsibility_assignment",
                  targetId: change.id,
                  details: {
                    ...buildResponsibilityAssignmentCascadeAuditDetails(change, {
                      kind: "employment",
                      action: "end",
                      employmentId: id,
                    }),
                    trigger: "schedule",
                  },
                });
              }
              return changes.length > 0;
            },
          });
          const [change] = result.endedEmployments;
          if (!change) throw new Error("Locked due Employment was not ended");
          await recordAudit({
            eventTime: observedAt,
            action: AuditActions["worker.employment.end"],
            targetType: "employment",
            targetId: id,
            details: {
              ...change,
              userId: employment.userId,
              changed: true,
              trigger: "schedule",
            },
          });
          await invalidateDocuments(result.documentChanges);
          return "ended";
        }

        if (
          phase !== "enable" ||
          employment.status !== EmploymentStatus.Pending ||
          desiredStatus !== EmploymentStatus.Enable
        )
          return;
        const { documentChanges, ...change } = await updateLockedEmployment(employmentStore, {
          employment,
          status: desiredStatus,
        });
        await recordAudit({
          eventTime: observedAfterEmploymentLock,
          action: AuditActions["worker.employment.enable"],
          targetType: "employment",
          targetId: id,
          details: {
            ...change,
            userId: employment.userId,
            trigger: "schedule",
          },
        });
        await invalidateDocuments(documentChanges);
        return "enabled";
      },
    );
  }

  return { execute };
}
