import {
  EmploymentStatus,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from "@iam/contracts";
import {
  assertOrganizationResponsibilityAssignmentResumeAvailable,
  assertOrganizationResponsibilityAssignmentSlotAvailable,
  getOrganizationResponsibilityOpenCardinalityViolation,
  getOrganizationResponsibilityParentLifecycleViolation,
  OrganizationResponsibilityAssignmentCardinalityConflictError,
  OrganizationResponsibilityAssignmentDuplicateOpenError,
  OrganizationResponsibilityAssignmentNotOpenError,
  OrganizationResponsibilityHolderEmploymentUnavailableError,
  OrganizationResponsibilityTargetOrganizationUnavailableError,
  resolveOrganizationResponsibilityAssignmentTransition,
} from "@iam/domain/organization-responsibility";
import { describe, expect, test } from "bun:test";

describe("Organization Responsibility Assignment cardinality policy", () => {
  test("classifies an occupied head slot by holder identity", () => {
    expect(() =>
      assertOrganizationResponsibilityAssignmentSlotAvailable({
        typeCode: OrganizationResponsibilityTypeCode.Head,
        employmentId: 10,
        existing: { id: 1, employmentId: 20 },
      }),
    ).toThrow(OrganizationResponsibilityAssignmentCardinalityConflictError);

    expect(() =>
      assertOrganizationResponsibilityAssignmentSlotAvailable({
        typeCode: OrganizationResponsibilityTypeCode.Head,
        employmentId: 10,
        existing: { id: 1, employmentId: 10 },
      }),
    ).toThrow(OrganizationResponsibilityAssignmentDuplicateOpenError);
  });

  test("classifies an occupied supervising slot as a duplicate", () => {
    expect(() =>
      assertOrganizationResponsibilityAssignmentSlotAvailable({
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        employmentId: 10,
        existing: { id: 1, employmentId: 10 },
      }),
    ).toThrow(OrganizationResponsibilityAssignmentDuplicateOpenError);
  });

  test("reports invalid Open cardinality without persistence knowledge", () => {
    expect(
      getOrganizationResponsibilityOpenCardinalityViolation([
        {
          id: 1,
          typeCode: OrganizationResponsibilityTypeCode.Head,
          employmentId: 10,
        },
        {
          id: 2,
          typeCode: OrganizationResponsibilityTypeCode.Head,
          employmentId: 20,
        },
      ]),
    ).toBe("multiple-heads");
    expect(
      getOrganizationResponsibilityOpenCardinalityViolation([
        {
          id: 1,
          typeCode: OrganizationResponsibilityTypeCode.Supervising,
          employmentId: 10,
        },
        {
          id: 2,
          typeCode: OrganizationResponsibilityTypeCode.Supervising,
          employmentId: 10,
        },
      ]),
    ).toBe("duplicate-supervising-holder");
    expect(
      getOrganizationResponsibilityOpenCardinalityViolation([
        {
          id: 1,
          typeCode: OrganizationResponsibilityTypeCode.Supervising,
          employmentId: null,
        },
      ]),
    ).toBe("missing-employment");
  });

  test("reports parent lifecycle drift only for Open Assignments", () => {
    expect(
      getOrganizationResponsibilityParentLifecycleViolation({
        assignmentStatus: OrganizationResponsibilityAssignmentStatus.Enable,
        holderEmploymentStatus: EmploymentStatus.Pause,
        targetOrganizationStatus: OrganizationStatus.Enable,
      }),
    ).toBe("enabled-assignment-without-enabled-employment");
    expect(
      getOrganizationResponsibilityParentLifecycleViolation({
        assignmentStatus: OrganizationResponsibilityAssignmentStatus.Pause,
        holderEmploymentStatus: EmploymentStatus.Disable,
        targetOrganizationStatus: OrganizationStatus.Enable,
      }),
    ).toBe("open-assignment-with-ended-employment");
    expect(
      getOrganizationResponsibilityParentLifecycleViolation({
        assignmentStatus: OrganizationResponsibilityAssignmentStatus.Pause,
        holderEmploymentStatus: EmploymentStatus.Pause,
        targetOrganizationStatus: OrganizationStatus.Pause,
      }),
    ).toBe("open-assignment-without-enabled-target");
    expect(
      getOrganizationResponsibilityParentLifecycleViolation({
        assignmentStatus: OrganizationResponsibilityAssignmentStatus.Pause,
        holderEmploymentStatus: EmploymentStatus.Pause,
        targetOrganizationStatus: OrganizationStatus.Enable,
      }),
    ).toBeNull();
    expect(
      getOrganizationResponsibilityParentLifecycleViolation({
        assignmentStatus: OrganizationResponsibilityAssignmentStatus.Disable,
        holderEmploymentStatus: EmploymentStatus.Disable,
        targetOrganizationStatus: OrganizationStatus.Disable,
      }),
    ).toBeNull();
  });
});

describe("Organization Responsibility Assignment lifecycle policy", () => {
  test("requires an enabled holder and target before Resume", () => {
    expect(() =>
      assertOrganizationResponsibilityAssignmentResumeAvailable({
        holderEmployment: {
          status: EmploymentStatus.Pause,
          isDelete: false,
        },
        targetOrganization: {
          status: OrganizationStatus.Enable,
          isDelete: false,
        },
      }),
    ).toThrow(OrganizationResponsibilityHolderEmploymentUnavailableError);
    expect(() =>
      assertOrganizationResponsibilityAssignmentResumeAvailable({
        holderEmployment: {
          status: EmploymentStatus.Enable,
          isDelete: false,
        },
        targetOrganization: {
          status: OrganizationStatus.Pause,
          isDelete: false,
        },
      }),
    ).toThrow(OrganizationResponsibilityTargetOrganizationUnavailableError);
    expect(() =>
      assertOrganizationResponsibilityAssignmentResumeAvailable({
        holderEmployment: {
          status: EmploymentStatus.Enable,
          isDelete: false,
        },
        targetOrganization: {
          status: OrganizationStatus.Enable,
          isDelete: false,
        },
      }),
    ).not.toThrow();
  });

  test("plans only the requested Open lifecycle transition", () => {
    expect(
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "pause",
        status: OrganizationResponsibilityAssignmentStatus.Enable,
      }),
    ).toEqual({
      changed: true,
      fromStatus: OrganizationResponsibilityAssignmentStatus.Enable,
      toStatus: OrganizationResponsibilityAssignmentStatus.Pause,
    });
    expect(
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "resume",
        status: OrganizationResponsibilityAssignmentStatus.Pause,
      }),
    ).toEqual({
      changed: true,
      fromStatus: OrganizationResponsibilityAssignmentStatus.Pause,
      toStatus: OrganizationResponsibilityAssignmentStatus.Enable,
    });
    expect(
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "end",
        status: OrganizationResponsibilityAssignmentStatus.Pause,
      }),
    ).toEqual({
      changed: true,
      fromStatus: OrganizationResponsibilityAssignmentStatus.Pause,
      toStatus: OrganizationResponsibilityAssignmentStatus.Disable,
    });
  });

  test("treats the requested target state as an idempotent no-op", () => {
    expect(
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "pause",
        status: OrganizationResponsibilityAssignmentStatus.Pause,
      }),
    ).toEqual({ changed: false });
    expect(
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "resume",
        status: OrganizationResponsibilityAssignmentStatus.Enable,
      }),
    ).toEqual({ changed: false });
    expect(
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "end",
        status: OrganizationResponsibilityAssignmentStatus.Disable,
      }),
    ).toEqual({ changed: false });
  });

  test("rejects Pause or Resume after an Assignment has ended", () => {
    expect(() =>
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "pause",
        status: OrganizationResponsibilityAssignmentStatus.Disable,
      }),
    ).toThrow(OrganizationResponsibilityAssignmentNotOpenError);
    expect(() =>
      resolveOrganizationResponsibilityAssignmentTransition({
        command: "resume",
        status: OrganizationResponsibilityAssignmentStatus.Disable,
      }),
    ).toThrow(OrganizationResponsibilityAssignmentNotOpenError);
  });
});
