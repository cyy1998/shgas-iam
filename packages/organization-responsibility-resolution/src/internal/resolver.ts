import type { DbClient } from "@iam/db";
import type {
  EffectiveOrganizationResponsibility,
  OrganizationResponsibilityResolver,
} from "../index.ts";
import {
  EmploymentStatus,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationStatus,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
} from "@iam/db/schema";
import {
  getOrganizationResponsibilityOpenCardinalityViolation,
  getOrganizationResponsibilityParentLifecycleViolation,
} from "@iam/domain/organization-responsibility";
import { eq, inArray } from "drizzle-orm";
import { OrganizationResponsibilityIntegrityError } from "../index.ts";

const KNOWN_EMPLOYMENT_STATUSES = new Set<EmploymentStatus>([
  EmploymentStatus.Enable,
  EmploymentStatus.Pause,
  EmploymentStatus.Disable,
]);
const KNOWN_ORGANIZATION_STATUSES = new Set<OrganizationStatus>([
  OrganizationStatus.Enable,
  OrganizationStatus.Pause,
  OrganizationStatus.Disable,
]);
const KNOWN_TYPE_CODES = new Set(ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(type => type.code));
const KNOWN_ASSIGNMENT_STATUSES = new Set<OrganizationResponsibilityAssignmentStatus>([
  OrganizationResponsibilityAssignmentStatus.Enable,
  OrganizationResponsibilityAssignmentStatus.Pause,
  OrganizationResponsibilityAssignmentStatus.Disable,
]);

interface AssignmentRow {
  assignmentId: number;
  employmentId: number;
  typeCode: EffectiveOrganizationResponsibility["typeCode"];
  targetOrganizationId: number;
  assignmentStatus: OrganizationResponsibilityAssignmentStatus;
  assignmentStartTime: Date;
  assignmentEndTime: Date | null;
  holderEmploymentId: number | null;
  holderEmploymentStatus: EmploymentStatus | null;
  holderEmploymentStartTime: Date | null;
  holderEmploymentEndTime: Date | null;
  holderEmploymentIsDelete: boolean | null;
  targetOrganizationRecordId: number | null;
  targetOrganizationStatus: OrganizationStatus | null;
  targetOrganizationIsDelete: boolean | null;
}

export function createResolver(db: DbClient): OrganizationResponsibilityResolver {
  return {
    async resolveEffectiveResponsibilities(input) {
      const employmentIds = unique(input.employmentIds);
      const result = new Map<number, EffectiveOrganizationResponsibility[]>(
        employmentIds.map(id => [id, []]),
      );
      if (employmentIds.length === 0)
        return result;

      const rows = await loadAssignmentsByEmploymentIds(db, employmentIds);
      await assertBatchIntegrity(db, rows, input.at);
      for (const row of rows) {
        if (!isEffective(row, input.at))
          continue;
        result.get(row.employmentId)?.push({
          typeCode: row.typeCode,
          targetOrganizationId: row.targetOrganizationId,
        });
      }
      for (const responsibilities of result.values())
        responsibilities.sort(compareResponsibilities);
      return result;
    },

    async resolveHolderEmploymentIds(input) {
      const targetOrganizationIds = unique(input.targetOrganizationIds);
      const typeCodes = input.typeCodes === undefined ? undefined : unique(input.typeCodes);
      if (targetOrganizationIds.length === 0 || typeCodes?.length === 0)
        return [];

      const targetRows = await db
        .select({ targetOrganizationId: organizationClosures.descendantId })
        .from(organizationClosures)
        .where(inArray(organizationClosures.ancestorId, targetOrganizationIds));
      const affectedTargetIds = unique(targetRows.map(row => row.targetOrganizationId));
      if (affectedTargetIds.length === 0)
        return [];

      const rows = await loadAssignmentsByTargetIds(db, affectedTargetIds);
      await assertBatchIntegrity(db, rows, input.at);
      return unique(rows
        .filter(row => isEffective(row, input.at))
        .filter(row => typeCodes === undefined || typeCodes.includes(row.typeCode))
        .map(row => row.employmentId))
        .sort((left, right) => left - right);
    },

    async resolveHolderEmploymentIdsByTypes(input) {
      const typeCodes = unique(input.typeCodes);
      if (typeCodes.length === 0)
        return [];
      const rows = await assignmentQuery(db).where(
        inArray(organizationResponsibilityAssignments.typeCode, typeCodes),
      );
      await assertBatchIntegrity(db, rows, input.at);
      return unique(rows
        .filter(row => isEffective(row, input.at))
        .map(row => row.employmentId))
        .sort((left, right) => left - right);
    },
  };
}

async function loadAssignmentsByEmploymentIds(db: DbClient, employmentIds: number[]) {
  return await assignmentQuery(db)
    .where(inArray(organizationResponsibilityAssignments.employmentId, employmentIds));
}

async function loadAssignmentsByTargetIds(db: DbClient, targetOrganizationIds: number[]) {
  return await assignmentQuery(db)
    .where(inArray(organizationResponsibilityAssignments.targetOrganizationId, targetOrganizationIds));
}

function assignmentQuery(db: DbClient) {
  return db
    .select({
      assignmentId: organizationResponsibilityAssignments.id,
      employmentId: organizationResponsibilityAssignments.employmentId,
      typeCode: organizationResponsibilityAssignments.typeCode,
      targetOrganizationId: organizationResponsibilityAssignments.targetOrganizationId,
      assignmentStatus: organizationResponsibilityAssignments.status,
      assignmentStartTime: organizationResponsibilityAssignments.startTime,
      assignmentEndTime: organizationResponsibilityAssignments.endTime,
      holderEmploymentId: employments.id,
      holderEmploymentStatus: employments.status,
      holderEmploymentStartTime: employments.startTime,
      holderEmploymentEndTime: employments.endTime,
      holderEmploymentIsDelete: employments.isDelete,
      targetOrganizationRecordId: organizations.id,
      targetOrganizationStatus: organizations.status,
      targetOrganizationIsDelete: organizations.isDelete,
    })
    .from(organizationResponsibilityAssignments)
    .leftJoin(employments, eq(employments.id, organizationResponsibilityAssignments.employmentId))
    .leftJoin(organizations, eq(
      organizations.id,
      organizationResponsibilityAssignments.targetOrganizationId,
    ));
}

async function assertBatchIntegrity(db: DbClient, rows: AssignmentRow[], at: Date) {
  for (const row of rows)
    assertAssignmentIntegrity(row, at);

  const targetOrganizationIds = unique(rows.map(row => row.targetOrganizationId));
  if (targetOrganizationIds.length === 0)
    return;
  const targetRows = await loadAssignmentsByTargetIds(db, targetOrganizationIds);
  for (const row of targetRows)
    assertAssignmentIntegrity(row, at);
  assertCardinality(targetRows.filter(isOpenAssignment));
}

function assertAssignmentIntegrity(row: AssignmentRow, at: Date) {
  if (!KNOWN_TYPE_CODES.has(row.typeCode))
    throw new OrganizationResponsibilityIntegrityError("assignment-type-unknown");
  if (!KNOWN_ASSIGNMENT_STATUSES.has(row.assignmentStatus))
    throw new OrganizationResponsibilityIntegrityError("assignment-status-unknown");
  if (row.holderEmploymentId === null)
    throw new OrganizationResponsibilityIntegrityError("holder-employment-missing");
  if (
    row.holderEmploymentStatus === null
    || !KNOWN_EMPLOYMENT_STATUSES.has(row.holderEmploymentStatus)
  ) {
    throw new OrganizationResponsibilityIntegrityError("holder-employment-status-unknown");
  }
  if (row.targetOrganizationRecordId === null)
    throw new OrganizationResponsibilityIntegrityError("target-organization-missing");
  if (
    row.targetOrganizationStatus === null
    || !KNOWN_ORGANIZATION_STATUSES.has(row.targetOrganizationStatus)
  ) {
    throw new OrganizationResponsibilityIntegrityError("target-organization-status-unknown");
  }
  if (!Number.isFinite(row.assignmentStartTime.getTime()))
    throw new OrganizationResponsibilityIntegrityError("open-assignment-period-invalid");
  if (row.assignmentStatus === OrganizationResponsibilityAssignmentStatus.Disable) {
    if (
      row.assignmentEndTime === null
      || !Number.isFinite(row.assignmentEndTime.getTime())
      || row.assignmentEndTime.getTime() < row.assignmentStartTime.getTime()
    ) {
      throw new OrganizationResponsibilityIntegrityError("open-assignment-period-invalid");
    }
    if (
      row.assignmentStartTime.getTime() > at.getTime()
      || row.assignmentEndTime.getTime() > at.getTime()
    ) {
      throw new OrganizationResponsibilityIntegrityError(
        "assignment-period-outside-observation",
      );
    }
    return;
  }
  if (row.holderEmploymentIsDelete) {
    throw new OrganizationResponsibilityIntegrityError("holder-employment-not-open");
  }
  if (row.targetOrganizationIsDelete) {
    throw new OrganizationResponsibilityIntegrityError("target-organization-not-effective");
  }
  const parentLifecycleViolation = getOrganizationResponsibilityParentLifecycleViolation({
    assignmentStatus: row.assignmentStatus,
    holderEmploymentStatus: row.holderEmploymentStatus,
    targetOrganizationStatus: row.targetOrganizationStatus,
  });
  if (parentLifecycleViolation === "open-assignment-with-ended-employment")
    throw new OrganizationResponsibilityIntegrityError("holder-employment-not-open");
  if (parentLifecycleViolation === "open-assignment-without-enabled-target")
    throw new OrganizationResponsibilityIntegrityError("target-organization-not-effective");
  if (parentLifecycleViolation === "enabled-assignment-without-enabled-employment") {
    throw new OrganizationResponsibilityIntegrityError(
      "enabled-assignment-without-effective-employment",
    );
  }
  if (
    row.assignmentEndTime !== null
  ) {
    throw new OrganizationResponsibilityIntegrityError("open-assignment-period-invalid");
  }
  if (
    row.assignmentStartTime.getTime() > at.getTime()
  ) {
    throw new OrganizationResponsibilityIntegrityError(
      "assignment-period-outside-observation",
    );
  }
  if (
    row.assignmentStatus === OrganizationResponsibilityAssignmentStatus.Enable
    && !isHolderEmploymentEffective(row, at)
  ) {
    throw new OrganizationResponsibilityIntegrityError(
      "enabled-assignment-without-effective-employment",
    );
  }
}

function assertCardinality(rows: Array<{
  assignmentId: number;
  employmentId: number;
  typeCode: EffectiveOrganizationResponsibility["typeCode"];
  targetOrganizationId: number;
}>) {
  const rowsByTarget = new Map<number, typeof rows>();
  for (const row of rows) {
    if (!KNOWN_TYPE_CODES.has(row.typeCode))
      throw new OrganizationResponsibilityIntegrityError("assignment-type-unknown");
    const targetRows = rowsByTarget.get(row.targetOrganizationId) ?? [];
    targetRows.push(row);
    rowsByTarget.set(row.targetOrganizationId, targetRows);
  }
  for (const targetRows of rowsByTarget.values()) {
    const violation = getOrganizationResponsibilityOpenCardinalityViolation(
      targetRows.map(row => ({
        id: row.assignmentId,
        typeCode: row.typeCode,
        employmentId: row.employmentId,
      })),
    );
    if (violation === "multiple-heads")
      throw new OrganizationResponsibilityIntegrityError("head-cardinality-violated");
    if (violation === "duplicate-supervising-holder")
      throw new OrganizationResponsibilityIntegrityError("supervising-holder-duplicated");
    if (violation === "missing-employment")
      throw new OrganizationResponsibilityIntegrityError("holder-employment-missing");
  }
}

function isEffective(row: AssignmentRow, at: Date) {
  return row.assignmentStatus === OrganizationResponsibilityAssignmentStatus.Enable
    && row.assignmentStartTime.getTime() <= at.getTime()
    && (row.assignmentEndTime === null || at.getTime() < row.assignmentEndTime.getTime())
    && isHolderEmploymentEffective(row, at)
    && row.targetOrganizationStatus === OrganizationStatus.Enable
    && row.targetOrganizationIsDelete === false;
}

function isOpenAssignment(row: AssignmentRow) {
  return row.assignmentStatus === OrganizationResponsibilityAssignmentStatus.Enable
    || row.assignmentStatus === OrganizationResponsibilityAssignmentStatus.Pause;
}

function isHolderEmploymentEffective(row: AssignmentRow, at: Date) {
  return row.holderEmploymentStatus === EmploymentStatus.Enable
    && row.holderEmploymentStartTime !== null
    && row.holderEmploymentStartTime.getTime() <= at.getTime()
    && (row.holderEmploymentEndTime === null || at.getTime() < row.holderEmploymentEndTime.getTime())
    && row.holderEmploymentIsDelete === false;
}

function compareResponsibilities(
  left: EffectiveOrganizationResponsibility,
  right: EffectiveOrganizationResponsibility,
) {
  if (left.typeCode < right.typeCode)
    return -1;
  if (left.typeCode > right.typeCode)
    return 1;
  return left.targetOrganizationId - right.targetOrganizationId;
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}
