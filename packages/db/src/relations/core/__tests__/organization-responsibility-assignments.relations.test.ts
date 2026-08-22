import type { RelationsHelper } from "../../types";
import { describe, expect, test } from "bun:test";
import { organizationResponsibilityAssignmentsRelations } from "../organization-responsibility-assignments";

function relationStub(kind: "one" | "many", tableName: string) {
  return (options?: unknown) => ({ kind, tableName, options });
}

const r = {
  one: new Proxy({}, {
    get: (_target, property) => relationStub("one", String(property)),
  }),
  many: new Proxy({}, {
    get: (_target, property) => relationStub("many", String(property)),
  }),
  employments: { id: "employments.id" },
  organizations: { id: "organizations.id" },
  organizationResponsibilityAssignments: {
    employmentId: "assignments.employmentId",
    targetOrganizationId: "assignments.targetOrganizationId",
  },
} as unknown as RelationsHelper;

describe("organizationResponsibilityAssignmentsRelations", () => {
  test("links each assignment to its holder employment and target organization", () => {
    const assignmentRelations = organizationResponsibilityAssignmentsRelations(r)
      .organizationResponsibilityAssignments;

    expect(assignmentRelations.holderEmployment).toMatchObject({
      kind: "one",
      tableName: "employments",
    });
    expect(assignmentRelations.targetOrganization).toMatchObject({
      kind: "one",
      tableName: "organizations",
    });
  });
});
