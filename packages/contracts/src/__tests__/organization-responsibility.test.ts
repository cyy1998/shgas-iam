import { describe, expect, test } from "bun:test";
import {
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityAssignmentCardinality,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "../organization-responsibility";

describe("Organization Responsibility Type Catalog", () => {
  test("publishes the closed, stably ordered head and supervising vocabulary", () => {
    expect(ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG).toEqual([
      {
        code: OrganizationResponsibilityTypeCode.Head,
        name: "负责人",
        description: "对目标组织承担负责人责任。",
        assignmentCardinality: OrganizationResponsibilityAssignmentCardinality.Single,
        displayOrder: 10,
      },
      {
        code: OrganizationResponsibilityTypeCode.Supervising,
        name: "分管领导",
        description: "对目标组织承担分管领导责任。",
        assignmentCardinality: OrganizationResponsibilityAssignmentCardinality.Multiple,
        displayOrder: 20,
      },
    ]);
  });

  test("keeps the code-owned catalog immutable", () => {
    expect(Object.isFrozen(ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG)).toBe(true);
    for (const entry of ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  test("publishes a dedicated enable-pause-disable assignment lifecycle", () => {
    expect(OrganizationResponsibilityAssignmentStatus.Enable).toBe(1);
    expect(OrganizationResponsibilityAssignmentStatus.Pause).toBe(2);
    expect(OrganizationResponsibilityAssignmentStatus.Disable).toBe(3);
  });

  test("publishes the stable Assignment lifecycle command vocabulary", () => {
    expect(ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLE_COMMANDS).toEqual({
      Pause: "pause",
      Resume: "resume",
      End: "end",
    });
  });
});
