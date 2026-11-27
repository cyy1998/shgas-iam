import { setTimeout } from "node:timers/promises";
import {
  OrganizationResponsibilityAssignmentStatus as AssignmentStatus,
  OrganizationResponsibilityTypeCode as ResponsibilityTypeCode,
  UserDocumentRebuildReason,
  UserDocumentWorkStatus,
} from "@iam/contracts";
import type { db as database } from "@iam/db";
import {
  auditLogs,
  employments,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  roles,
  userDocumentRebuildStates,
  userDocuments,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { StoredUserDocumentSchema } from "@iam/documents/user/document";
import { SystemLogEvent } from "@iam/runtime/logger";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { E2EScenarioGeneratedReferences } from "./seed.ts";

const HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS = [
  "admin.organization_responsibility_assignment.create",
  "admin.organization_responsibility_assignment.pause",
  "admin.organization_responsibility_assignment.resume",
  "admin.organization_responsibility_assignment.end",
  "admin.organization_responsibility_assignment.end",
  "admin.organization_responsibility_assignment.end",
] as const;

export interface HrAdminOutcomeScenario {
  runId: string;
  adminUsername: string;
  hrAdminUsername: string;
  hrAdminRoleCode: string;
  responsibilityHolderPositionCode: string;
  outsideResponsibilityHolderPositionCode: string;
  responsibilityTargetOrganizationCode: string;
  hrSecondScopeRootOrganizationCode: string;
  hrResponsibilityTargetOrganizationCode: string;
}

export async function verifyHrAdminOutcome(
  db: typeof database,
  scenario: HrAdminOutcomeScenario,
  options?: { timeoutMs?: number },
) {
  const deadline = Date.now() + (options?.timeoutMs ?? 30_000);
  do {
    const assignmentRows = await db
      .select({
        id: organizationResponsibilityAssignments.id,
        status: organizationResponsibilityAssignments.status,
        typeCode: organizationResponsibilityAssignments.typeCode,
        endTime: organizationResponsibilityAssignments.endTime,
        holderPositionCode: positions.posCode,
        holderUsername: users.username,
        targetOrganizationCode: organizations.orgCode,
      })
      .from(organizationResponsibilityAssignments)
      .innerJoin(employments, eq(employments.id, organizationResponsibilityAssignments.employmentId))
      .innerJoin(positions, eq(positions.id, employments.posId))
      .innerJoin(users, eq(users.id, employments.userId))
      .innerJoin(organizations, eq(organizations.id, organizationResponsibilityAssignments.targetOrganizationId));
    const assignment = assignmentRows.find(
      (row) =>
        row.holderUsername === scenario.adminUsername &&
        row.holderPositionCode === scenario.responsibilityHolderPositionCode &&
        row.targetOrganizationCode === scenario.hrResponsibilityTargetOrganizationCode &&
        row.typeCode === ResponsibilityTypeCode.Supervising,
    );
    const hiddenBlockers = assignmentRows.filter(
      (row) =>
        row.holderPositionCode === scenario.outsideResponsibilityHolderPositionCode &&
        row.targetOrganizationCode === scenario.hrResponsibilityTargetOrganizationCode &&
        row.typeCode === ResponsibilityTypeCode.Head,
    );
    const deniedCombinationAssignments = assignmentRows.filter(
      (row) =>
        row.typeCode === ResponsibilityTypeCode.Supervising &&
        (row.holderPositionCode === scenario.outsideResponsibilityHolderPositionCode ||
          row.targetOrganizationCode === scenario.responsibilityTargetOrganizationCode),
    ).length;

    const admin = await db.query.users.findFirst({
      columns: { id: true },
      where: { username: scenario.adminUsername, isDelete: false },
    });
    const publication =
      admin === undefined
        ? undefined
        : (
            await db
              .select({
                version: userDocumentRebuildStates.version,
                reasonCodes: userDocumentRebuildStates.reasonCodes,
                status: userDocumentRebuildStates.status,
                sourceVersion: userDocuments.sourceVersion,
                document: userDocuments.document,
              })
              .from(userDocumentRebuildStates)
              .innerJoin(userDocuments, eq(userDocuments.userId, userDocumentRebuildStates.userId))
              .where(eq(userDocumentRebuildStates.userId, admin.id))
              .limit(1)
          )[0];

    const hrResponsibilityAudits = await db
      .select({
        action: auditLogs.action,
        actorUsername: auditLogs.actorUsername,
        outcome: auditLogs.outcome,
        targetId: auditLogs.targetId,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorUsername, scenario.hrAdminUsername),
          eq(auditLogs.targetType, "organization_responsibility_assignment"),
          inArray(auditLogs.action, HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS),
        ),
      )
      .orderBy(asc(auditLogs.id));

    const secondScopeRoleAssignment = await db
      .select({
        id: roleAssignments.id,
      })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .innerJoin(employments, eq(employments.id, roleAssignments.targetId))
      .innerJoin(users, eq(users.id, employments.userId))
      .innerJoin(organizations, eq(organizations.id, employments.orgId))
      .where(
        and(
          eq(roles.roleCode, scenario.hrAdminRoleCode),
          eq(users.username, scenario.hrAdminUsername),
          eq(organizations.orgCode, scenario.hrSecondScopeRootOrganizationCode),
        ),
      )
      .limit(1);
    const adminMixedRoleAssignment = await db
      .select({
        id: roleAssignments.id,
      })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .innerJoin(employments, eq(employments.id, roleAssignments.targetId))
      .innerJoin(users, eq(users.id, employments.userId))
      .where(and(eq(roles.roleCode, scenario.hrAdminRoleCode), eq(users.username, scenario.adminUsername)))
      .limit(1);

    const assignmentAudits =
      assignment === undefined ? [] : hrResponsibilityAudits.filter((audit) => audit.targetId === assignment.id);
    const containsEndedTargetResponsibility =
      publication !== undefined &&
      containsResponsibilityTarget(publication.document, scenario.hrResponsibilityTargetOrganizationCode);
    if (
      assignment !== undefined &&
      assignment.status === AssignmentStatus.Disable &&
      assignment.endTime !== null &&
      assignmentAudits.length === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS.length &&
      assignmentAudits.every(
        (audit, index) =>
          audit.action === HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS[index] &&
          audit.actorUsername === scenario.hrAdminUsername &&
          audit.outcome === "success",
      ) &&
      publication !== undefined &&
      BigInt(publication.version) > 1n &&
      publication.status === UserDocumentWorkStatus.Processed &&
      publication.reasonCodes.length === 1 &&
      publication.reasonCodes[0] === UserDocumentRebuildReason.OrganizationResponsibilityAssignmentUpdated &&
      publication.sourceVersion === publication.version &&
      !containsEndedTargetResponsibility &&
      hiddenBlockers.length === 1 &&
      hiddenBlockers[0]?.status === AssignmentStatus.Enable &&
      deniedCombinationAssignments === 0 &&
      hrResponsibilityAudits.length === assignmentAudits.length &&
      adminMixedRoleAssignment.length === 0 &&
      secondScopeRoleAssignment.length === 0
    ) {
      return { status: "passed" as const, assignmentId: assignment.id, version: publication.version };
    }
    await setTimeout(250);
  } while (Date.now() < deadline);
  throw new Error(
    "HR Admin journey outcome did not confirm responsibility, audit, invalidation, revocation, and denial facts",
  );
}

function containsResponsibilityTarget(document: unknown, code: string) {
  const parsed = StoredUserDocumentSchema.parse(document);
  return parsed.employments.some((employment) =>
    employment.responsibilities.some((responsibility) => responsibility.targetOrganization.code === code),
  );
}

export function assertHrAdminDenialLog(
  rawLogs: string,
  scenario: HrAdminOutcomeScenario,
  references: E2EScenarioGeneratedReferences,
) {
  const denials = rawLogs
    .split(/\r?\n/u)
    .map((line) => parseJsonObject(line))
    .filter(
      (entry): entry is Record<string, unknown> =>
        entry?.event === SystemLogEvent.AdminAuthorizationDenied &&
        isObject(entry.actor) &&
        entry.actor.username === scenario.hrAdminUsername,
    );
  const expectedDenial = denials.find(
    (entry) =>
      entry?.action === "admin.organizationResponsibility.createAssignment" &&
      entry.resourceType === "organizationResponsibilityAssignment" &&
      entry.resourceIdentifier === "create-request" &&
      entry.reasonCode === "RESOURCE_OUT_OF_SCOPE",
  );
  if (expectedDenial === undefined) throw new Error("HR Admin denial security log was not observed");
  for (const denial of denials) {
    if (containsForbiddenScopeKey(denial)) {
      throw new Error("HR Admin denial security log leaked authorization scope");
    }
    if (concealedFixtureValues(scenario).some((value) => containsScalarValue(denial, value))) {
      throw new Error("HR Admin denial security log leaked concealed fixture value");
    }
    if (
      denial.resourceIdentifier === references.hiddenResponsibilityAssignmentId ||
      denial.resourceIdentifier === references.outsideResponsibilityHolderEmploymentId
    ) {
      throw new Error("HR Admin denial security log leaked concealed fixture value");
    }
  }
}

function concealedFixtureValues(scenario: HrAdminOutcomeScenario) {
  return [scenario.outsideResponsibilityHolderPositionCode, scenario.responsibilityTargetOrganizationCode];
}

function containsForbiddenScopeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenScopeKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      /^(?:scope|organizationIds|rootOrganizationIds|assignmentId|employmentId|holder|holderOrganizationId|targetOrganizationId|organizationPath)$/iu.test(
        key,
      ) || containsForbiddenScopeKey(nested),
  );
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function containsScalarValue(value: unknown, forbidden: number | string): boolean {
  if (value === forbidden) return true;
  if (Array.isArray(value)) return value.some((item) => containsScalarValue(item, forbidden));
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some((item) => containsScalarValue(item, forbidden));
}
