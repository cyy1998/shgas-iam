import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { employments, organizationResponsibilityAssignments, organizations, positions, users } from "@iam/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PostgresTestHarness } from "./postgres-harness";
import { createPostgresTestHarness } from "./postgres-harness";

describe("Employment and responsibility relations through PostgreSQL", () => {
  let harness: PostgresTestHarness;
  let db: ReturnType<typeof createDb>;
  let assignmentId: number;

  function createDb() {
    return drizzle({ client: harness.sql, relations });
  }

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
    db = createDb();
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../src/migrations", import.meta.url)),
      migrationsSchema: harness.schemaName,
    });
    await db.insert(users).values([
      { id: 10, username: "holder", name: "Holder" },
      { id: 11, username: "other", name: "Other" },
    ]);
    await db.insert(organizations).values([
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
    await db.insert(positions).values([
      { id: 40, posCode: "HOLDER", posName: "Holder position" },
      { id: 41, posCode: "OTHER", posName: "Other position" },
    ]);
    await db.insert(employments).values([
      { id: 100, userId: 10, orgId: 20, posId: 40 },
      { id: 101, userId: 11, orgId: 30, posId: 41 },
    ]);
    const assignments = await db
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
    const employment = await db.query.employments.findFirst({
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
    const assignment = await db.query.organizationResponsibilityAssignments.findFirst({
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
