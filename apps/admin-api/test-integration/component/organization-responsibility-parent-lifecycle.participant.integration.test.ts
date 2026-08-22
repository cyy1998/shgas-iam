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
  test("pauses every selected Assignment and writes one allowlisted cascade audit per change", async () => {
    const assignmentStore = {
      endOpenAssignmentsForEmployment: mock(async () => []),
      endOpenAssignmentsForUser: mock(async () => []),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
      pauseEnabledAssignmentsForEmployment: mock(async () => [
        changedAssignment(31),
        changedAssignment(32),
      ]),
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

    await expect(
      participant.pauseEnabledAssignmentsForEmployment({
        auditContext,
        employmentId: 11,
      }),
    ).resolves.toBe(true);

    expect(assignmentStore.pauseEnabledAssignmentsForEmployment).toHaveBeenCalledWith(11);
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
    const assignmentStore = {
      endOpenAssignmentsForEmployment: mock(async () => [{
        ...changedAssignment(41),
        beforeStatus: OrganizationResponsibilityAssignmentStatus.Pause,
        afterStatus: OrganizationResponsibilityAssignmentStatus.Disable,
        afterEndTime: transactionTime,
      }]),
      endOpenAssignmentsForUser: mock(async () => []),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
      pauseEnabledAssignmentsForEmployment: mock(async () => []),
    };
    const auditLogWriter = {
      recordAuditLog: mock(async () => undefined),
    };
    const participant = createOrganizationResponsibilityParentLifecycleParticipant({
      assignmentStore,
      auditLogWriter,
    });

    await expect(participant.endOpenAssignmentsForEmployment({
      action: "end",
      employmentId: 11,
      endTime: transactionTime,
    })).resolves.toBe(true);

    expect(assignmentStore.endOpenAssignmentsForEmployment).toHaveBeenCalledWith(
      11,
      transactionTime,
    );
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
      endOpenAssignmentsForEmployment: mock(async () => []),
      endOpenAssignmentsForUser: mock(async () => [{
        ...changedAssignment(51),
        afterStatus: OrganizationResponsibilityAssignmentStatus.Disable,
        afterEndTime: transactionTime,
      }]),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => false),
      pauseEnabledAssignmentsForEmployment: mock(async () => []),
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
    })).resolves.toBe(true);

    expect(assignmentStore.endOpenAssignmentsForUser).toHaveBeenCalledWith(
      9,
      transactionTime,
    );
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
      endOpenAssignmentsForEmployment: mock(async () => []),
      endOpenAssignmentsForUser: mock(async () => []),
      hasOpenAssignmentTargetingOrganizationSubtree: mock(async () => true),
      pauseEnabledAssignmentsForEmployment: mock(async () => []),
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
