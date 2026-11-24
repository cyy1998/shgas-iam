import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { employments, organizationResponsibilityAssignments, organizations, positions, users } from "@iam/db/schema";
import { createMigratedPostgresTestHarness } from "../support/migrated-postgres-harness";

describe("Employment and responsibility relations through PostgreSQL", () => {
  let harness: Awaited<ReturnType<typeof createMigratedPostgresTestHarness>>;
  let assignmentId: number;

  beforeAll(async () => {
    harness = await createMigratedPostgresTestHarness();
    await harness.db.insert(users).values([
      { id: 10, username: "holder", name: "Holder" },
      { id: 11, username: "other", name: "Other" },
    ]);
    await harness.db.insert(organizations).values([
      {
        id: 20,
        orgCode: "DEPT",
        orgName: "Department",
        path: "/DEPT",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Department,
      },
      {
        id: 30,
        orgCode: "TARGET",
        orgName: "Target",
        path: "/TARGET",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Department,
      },
    ]);
    await harness.db.insert(positions).values([
      { id: 40, posCode: "HOLDER", posName: "Holder position" },
      { id: 41, posCode: "OTHER", posName: "Other position" },
    ]);
    await harness.db.insert(employments).values([
      { id: 100, userId: 10, orgId: 20, posId: 40 },
      { id: 101, userId: 11, orgId: 30, posId: 41 },
    ]);
    const assignments = await harness.db
      .insert(organizationResponsibilityAssignments)
      .values([
        {
          employmentId: 100,
          targetOrganizationId: 30,
          typeCode: OrganizationResponsibilityTypeCode.Supervising,
          status: OrganizationResponsibilityAssignmentStatus.Enable,
          startTime: new Date("2026-01-01T00:00:00Z"),
        },
        {
          employmentId: 101,
          targetOrganizationId: 20,
          typeCode: OrganizationResponsibilityTypeCode.Supervising,
          status: OrganizationResponsibilityAssignmentStatus.Enable,
          startTime: new Date("2026-01-01T00:00:00Z"),
        },
      ])
      .returning();
    assignmentId = assignments.find((assignment) => assignment.employmentId === 100)!.id;
  });
  afterAll(async () => {
    await harness?.close();
  });

  test("loads the employment's department and only its own responsibility assignments", async () => {
    const employment = await harness.db.query.employments.findFirst({
      where: { id: 100 },
      columns: { id: true },
      with: {
        department: { columns: { id: true, orgCode: true } },
        responsibilityAssignments: { columns: { id: true } },
      },
    });

    expect(employment).toEqual({
      id: 100,
      department: { id: 20, orgCode: "DEPT" },
      responsibilityAssignments: [{ id: assignmentId }],
    });
  });

  test("loads the holder employment separately from the responsibility target organization", async () => {
    const assignment = await harness.db.query.organizationResponsibilityAssignments.findFirst({
      where: { id: assignmentId },
      columns: { id: true },
      with: {
        holderEmployment: {
          columns: { id: true },
          with: { department: { columns: { id: true, orgCode: true } } },
        },
        targetOrganization: { columns: { id: true, orgCode: true } },
      },
    });

    expect(assignment).toEqual({
      id: assignmentId,
      holderEmployment: { id: 100, department: { id: 20, orgCode: "DEPT" } },
      targetOrganization: { id: 30, orgCode: "TARGET" },
    });
  });
});
