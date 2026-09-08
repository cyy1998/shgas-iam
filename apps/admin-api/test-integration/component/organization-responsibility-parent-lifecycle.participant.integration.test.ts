import type { CreateOrganizationResponsibilityParentLifecycleParticipantDeps } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.participant";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.type";
import { createOrganizationResponsibilityParentLifecycleParticipant } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.participant";
import {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";
import { OrganizationHasOpenResponsibilityAssignmentError } from "@iam/domain/organization";
import { describe, expect, mock, test } from "bun:test";

const assignmentStartTime = new Date("2026-01-01T00:00:00.000Z");
const transactionTime = new Date("2026-02-01T00:00:00.000Z");

function changedAssignment(id: number) {
  return {
    id,
    employmentId: 11,
    targetOrganizationId: 20 + id,
    typeCode: OrganizationResponsibilityTypeCode.Supervising,
    startTime: assignmentStartTime,
    beforeStatus: OrganizationResponsibilityAssignmentStatus.Enable,
    beforeEndTime: null,
    afterStatus: OrganizationResponsibilityAssignmentStatus.Pause,
    afterEndTime: null,
  };
}

describe("Organization Responsibility parent lifecycle participant", () => {
  test("rechecks the complete locked selection and audits only actual cascade changes", async () => {
    const selectedAssignments: OrganizationResponsibilityAssignmentWriteTarget[] = [
      { ...changedAssignment(1), status: OrganizationResponsibilityAssignmentStatus.Enable, endTime: null },
      { ...changedAssignment(2), status: OrganizationResponsibilityAssignmentStatus.Pause, endTime: null },
      { ...changedAssignment(3), status: OrganizationResponsibilityAssignmentStatus.Disable, endTime: transactionTime },
    ];
    const deps: CreateOrganizationResponsibilityParentLifecycleParticipantDeps = {
      assignmentStore: {
        lockAssignmentsForEmployments: mock(async () => []),
        lockAssignmentsForEmployment: mock(async () => selectedAssignments),
        updateLockedAssignmentLifecycle: mock(async ({ assignment, status, endTime }) => ({
          ...changedAssignment(assignment.id),
          beforeStatus: assignment.status,
          beforeEndTime: assignment.endTime,
          afterStatus: status,
          afterEndTime: endTime,
        })),
        hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
      },
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    };
    const participant = createOrganizationResponsibilityParentLifecycleParticipant(deps);
    const selected = await participant.lockAssignmentsForEmployment({ employmentId: 11, command: "pause" });
    const changed = await participant.pauseEnabledAssignmentsForEmployment({
      employmentId: 11,
      selectedAssignments: selected,
    });
    expect(changed).toBe(true);
    expect(deps.assignmentStore.updateLockedAssignmentLifecycle).toHaveBeenCalledTimes(1);
    expect(deps.auditLogWriter.recordAuditLog).toHaveBeenCalledTimes(1);
    expect(deps.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ targetId: 1 }));
  });

  test("an already-ended locked selection preserves its original endTime without writing or auditing", async () => {
    const deps: CreateOrganizationResponsibilityParentLifecycleParticipantDeps = {
      assignmentStore: {
        lockAssignmentsForEmployments: mock(async () => []),
        lockAssignmentsForEmployment: mock(async () => []),
        updateLockedAssignmentLifecycle: mock(async () => changedAssignment(1)),
        hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
      },
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    };
    const participant = createOrganizationResponsibilityParentLifecycleParticipant(deps);
    const result = await participant.endOpenAssignmentsForEmployment({
      action: "end",
      employmentId: 11,
      endTime: new Date("2026-03-01"),
      selectedAssignments: [{
        ...changedAssignment(1),
        status: OrganizationResponsibilityAssignmentStatus.Disable,
        endTime: transactionTime,
      }],
    });
    expect(result).toBe(false);
    expect(deps.assignmentStore.updateLockedAssignmentLifecycle).not.toHaveBeenCalled();
    expect(deps.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
  });
  test("pauses every selected Assignment and writes one allowlisted cascade audit per change", async () => {
    const selectedAssignments = [31, 32].map(id => ({
      ...changedAssignment(id),
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      endTime: null,
    }));
    const assignmentStore = {
      lockAssignmentsForEmployments: mock(async () => []),
      lockAssignmentsForEmployment: mock(async () => []),
      updateLockedAssignmentLifecycle: mock(async (
        { assignment }: { assignment: OrganizationResponsibilityAssignmentWriteTarget },
      ) => changedAssignment(assignment.id)),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
    };
    const auditLogWriter = {
      recordAuditLog: mock(async () => undefined),
    };
    const participant = createOrganizationResponsibilityParentLifecycleParticipant({
      assignmentStore,
      auditLogWriter,
    });
    const auditContext = {
      actorType: "admin" as const,
      actorUserId: 1001,
      requestId: "req-1",
      traceId: "trace-1",
    };

    const changed = await participant.pauseEnabledAssignmentsForEmployment({
      auditContext,
      employmentId: 11,
      selectedAssignments,
    });
    expect(changed).toBe(true);
    expect(assignmentStore.updateLockedAssignmentLifecycle).toHaveBeenCalledTimes(2);
    for (const [index, assignment] of selectedAssignments.entries()) {
      expect(assignmentStore.updateLockedAssignmentLifecycle).toHaveBeenNthCalledWith(index + 1, {
        assignment,
        status: OrganizationResponsibilityAssignmentStatus.Pause,
        endTime: null,
      });
    }
    expect(auditLogWriter.recordAuditLog).toHaveBeenCalledTimes(2);
    expect(auditLogWriter.recordAuditLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        ...auditContext,
        action: "admin.organization_responsibility_assignment.pause",
        targetId: 31,
        details: expect.objectContaining({
          cause: {
            action: "pause",
            employmentId: 11,
            kind: "employment",
          },
        }),
      }),
    );
  });

  test("ends every selected Assignment at the parent transaction time", async () => {
    const assignment = {
      ...changedAssignment(41),
      status: OrganizationResponsibilityAssignmentStatus.Pause,
      endTime: null,
    };
    const assignmentStore = {
      lockAssignmentsForEmployments: mock(async () => []),
      lockAssignmentsForEmployment: mock(async () => []),
      updateLockedAssignmentLifecycle: mock(async () => ({
        ...changedAssignment(41),
        beforeStatus: OrganizationResponsibilityAssignmentStatus.Pause,
        afterStatus: OrganizationResponsibilityAssignmentStatus.Disable,
        afterEndTime: transactionTime,
      })),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
    };
    const auditLogWriter = {
      recordAuditLog: mock(async () => undefined),
    };
    const participant = createOrganizationResponsibilityParentLifecycleParticipant({
      assignmentStore,
      auditLogWriter,
    });

    const changed = await participant.endOpenAssignmentsForEmployment({
      action: "end",
      employmentId: 11,
      endTime: transactionTime,
      selectedAssignments: [assignment],
    });
    expect(changed).toBe(true);

    expect(assignmentStore.updateLockedAssignmentLifecycle).toHaveBeenCalledWith({
      assignment,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      endTime: transactionTime,
    });
    expect(auditLogWriter.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.organization_responsibility_assignment.end",
        targetId: 41,
        details: expect.objectContaining({
          after: expect.objectContaining({ endTime: transactionTime }),
          cause: {
            action: "end",
            employmentId: 11,
            kind: "employment",
          },
        }),
      }),
    );
  });

  test("attributes every resignation cascade to the initiating User and shared Admin context", async () => {
    const assignmentStore = {
      lockAssignmentsForEmployments: mock(async () => []),
      lockAssignmentsForEmployment: mock(async () => []),
      updateLockedAssignmentLifecycle: mock(async () => ({
        ...changedAssignment(51),
        afterStatus: OrganizationResponsibilityAssignmentStatus.Disable,
        afterEndTime: transactionTime,
      })),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
    };
    const auditLogWriter = { recordAuditLog: mock(async () => undefined) };
    const participant = createOrganizationResponsibilityParentLifecycleParticipant({
      assignmentStore,
      auditLogWriter,
    });
    const auditContext = {
      actorType: "admin" as const,
      actorUserId: 1001,
      requestId: "req-resign",
      traceId: "trace-resign",
    };

    await expect(participant.endOpenAssignmentsForUserResignation({
      auditContext,
      endTime: transactionTime,
      userId: 9,
      selectedAssignments: [{
        ...changedAssignment(51),
        status: OrganizationResponsibilityAssignmentStatus.Enable,
        endTime: null,
      }],
    })).resolves.toBe(true);

    expect(assignmentStore.updateLockedAssignmentLifecycle).toHaveBeenCalledTimes(1);
    expect(auditLogWriter.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        ...auditContext,
        targetId: 51,
        details: expect.objectContaining({
          cause: { action: "resignation", kind: "user", userId: 9 },
        }),
      }),
    );
  });

  test("blocks an Organization subtree only when its repository finds an Open target", async () => {
    const assignmentStore = {
      lockAssignmentsForEmployments: mock(async () => []),
      lockAssignmentsForEmployment: mock(async () => []),
      updateLockedAssignmentLifecycle: mock(async () => changedAssignment(1)),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => true),
    };
    const participant = createOrganizationResponsibilityParentLifecycleParticipant({
      assignmentStore,
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    });

    await expect(
      participant.assertNoOpenAssignmentsTargetingOrganizationSubtree({
        organizationId: 3,
      }),
    ).rejects.toBeInstanceOf(OrganizationHasOpenResponsibilityAssignmentError);
  });
});
