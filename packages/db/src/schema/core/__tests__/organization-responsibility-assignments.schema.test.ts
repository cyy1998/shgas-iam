import {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
} from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  insertOrganizationResponsibilityAssignmentSchema,
  organizationResponsibilityAssignments,
  selectOrganizationResponsibilityAssignmentSchema,
} from "../organization-responsibility-assignments";

function tableConfig() {
  return getTableConfig(organizationResponsibilityAssignments);
}

describe("organization responsibility assignment schema", () => {
  test("owns immutable bindings and lifecycle without runtime source or soft delete fields", () => {
    expect(tableConfig().columns.map(column => column.name)).toEqual([
      "id",
      "employment_id",
      "type_code",
      "target_organization_id",
      "status",
      "start_time",
      "end_time",
      "create_time",
      "update_time",
    ]);

    expect(selectOrganizationResponsibilityAssignmentSchema.parse({
      id: 1,
      employmentId: 2,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 3,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-08-20T00:00:00.000Z"),
      endTime: null,
      createTime: new Date("2026-08-20T00:00:00.000Z"),
      updateTime: new Date("2026-08-20T00:00:00.000Z"),
    })).toMatchObject({ id: 1, employmentId: 2, targetOrganizationId: 3 });

    expect(insertOrganizationResponsibilityAssignmentSchema.keyof().options.sort()).toEqual([
      "employmentId",
      "endTime",
      "startTime",
      "status",
      "targetOrganizationId",
      "typeCode",
    ]);
  });

  test("keeps head single and supervising duplicate slots unique while pause remains open", () => {
    const indexes = Object.fromEntries(
      tableConfig().indexes.map(index => [index.config.name, index.config]),
    ) as Record<string, any>;
    const head = indexes.org_resp_assignment_open_head_unique_idx;
    const supervising
      = indexes.org_resp_assignment_open_supervising_unique_idx;

    expect(head.unique).toBe(true);
    expect(head.columns.map((column: any) => column.name)).toEqual([
      "target_organization_id",
      "type_code",
    ]);
    expect(head.where.queryChunks).toContain(OrganizationResponsibilityTypeCode.Head);
    expect(head.where.queryChunks).toContain(OrganizationResponsibilityAssignmentStatus.Enable);
    expect(head.where.queryChunks).toContain(OrganizationResponsibilityAssignmentStatus.Pause);

    expect(supervising.unique).toBe(true);
    expect(supervising.columns.map((column: any) => column.name)).toEqual([
      "target_organization_id",
      "type_code",
      "employment_id",
    ]);
    expect(supervising.where.queryChunks).toContain(
      OrganizationResponsibilityTypeCode.Supervising,
    );
    expect(supervising.where.queryChunks).toContain(
      OrganizationResponsibilityAssignmentStatus.Enable,
    );
    expect(supervising.where.queryChunks).toContain(
      OrganizationResponsibilityAssignmentStatus.Pause,
    );
  });

  test("constrains type, lifecycle, and period invariants at the row boundary", () => {
    expect(tableConfig().checks.map(check => check.name).sort()).toEqual([
      "organization_responsibility_assignment_period_check",
      "organization_responsibility_assignment_status_check",
      "organization_responsibility_assignment_type_code_check",
    ]);
  });
});
