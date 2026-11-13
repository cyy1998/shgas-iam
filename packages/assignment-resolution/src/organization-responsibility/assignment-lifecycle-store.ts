import { OrganizationResponsibilityAssignmentStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { firstRow } from "@iam/db/query-utils";
import { organizationResponsibilityAssignments } from "@iam/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  OrganizationResponsibilityAssignmentLifecycleChange,
  OrganizationResponsibilityAssignmentWriteTarget,
} from "./assignment-lifecycle";

const OPEN_ASSIGNMENT_STATUSES = [
  OrganizationResponsibilityAssignmentStatus.Enable,
  OrganizationResponsibilityAssignmentStatus.Pause,
] as const;

export function createOrganizationResponsibilityAssignmentLifecycleStore(db: DbClient) {
  async function lockAssignmentsByIds(
    ids: readonly number[],
  ): Promise<OrganizationResponsibilityAssignmentWriteTarget[]> {
    if (ids.length === 0) return [];
    const selectedIds = [...new Set(ids)];
    const rows = await db
      .select({
        id: organizationResponsibilityAssignments.id,
        employmentId: organizationResponsibilityAssignments.employmentId,
        targetOrganizationId: organizationResponsibilityAssignments.targetOrganizationId,
        typeCode: organizationResponsibilityAssignments.typeCode,
        status: organizationResponsibilityAssignments.status,
        startTime: organizationResponsibilityAssignments.startTime,
        endTime: organizationResponsibilityAssignments.endTime,
      })
      .from(organizationResponsibilityAssignments)
      .where(inArray(organizationResponsibilityAssignments.id, selectedIds))
      .orderBy(asc(organizationResponsibilityAssignments.id))
      .for("update");
    if (rows.length !== selectedIds.length)
      throw new Error("Selected Organization Responsibility Assignment disappeared before locking");
    return rows;
  }

  async function lockAssignmentsForEmployment(input: { employmentId: number; command: "pause" | "end" }) {
    return lockAssignmentsForEmployments({ employmentIds: [input.employmentId], command: input.command });
  }

  async function lockAssignmentsForEmployments(input: { employmentIds: readonly number[]; command: "pause" | "end" }) {
    if (input.employmentIds.length === 0) return [];
    // Select once, then lock by identity: a concurrent lifecycle change must be
    // rechecked on the returned row instead of removing it from the write set.
    const selected = await db
      .select({ id: organizationResponsibilityAssignments.id })
      .from(organizationResponsibilityAssignments)
      .where(
        and(
          inArray(organizationResponsibilityAssignments.employmentId, [...input.employmentIds]),
          input.command === "pause"
            ? eq(organizationResponsibilityAssignments.status, OrganizationResponsibilityAssignmentStatus.Enable)
            : inArray(organizationResponsibilityAssignments.status, OPEN_ASSIGNMENT_STATUSES),
        ),
      );
    return lockAssignmentsByIds(selected.map((row) => row.id));
  }

  async function updateLockedAssignmentLifecycle(input: {
    assignment: OrganizationResponsibilityAssignmentWriteTarget;
    status: OrganizationResponsibilityAssignmentStatus;
    endTime: Date | null;
  }): Promise<OrganizationResponsibilityAssignmentLifecycleChange> {
    const { assignment } = input;
    const updated = firstRow(
      await db
        .update(organizationResponsibilityAssignments)
        .set({ status: input.status, endTime: input.endTime })
        .where(eq(organizationResponsibilityAssignments.id, assignment.id))
        .returning({
          afterStatus: organizationResponsibilityAssignments.status,
          afterEndTime: organizationResponsibilityAssignments.endTime,
        }),
    );
    if (updated === null) throw new Error("Locked Organization Responsibility Assignment update affected no row");
    return {
      id: assignment.id,
      employmentId: assignment.employmentId,
      targetOrganizationId: assignment.targetOrganizationId,
      typeCode: assignment.typeCode,
      startTime: assignment.startTime,
      beforeStatus: assignment.status,
      beforeEndTime: assignment.endTime,
      ...updated,
    };
  }

  return {
    lockAssignmentsByIds,
    lockAssignmentsForEmployment,
    lockAssignmentsForEmployments,
    updateLockedAssignmentLifecycle,
  };
}
