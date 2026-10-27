import { OrganizationResponsibilityTypeCode } from "@iam/contracts";
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
import { StoredUserDocumentSchema } from "@iam/user-document/document";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { HrAdminOutcomeOwner, HrAdminOutcomeScenario } from "./hr-admin-outcome.ts";
import { HR_ADMIN_RESPONSIBILITY_AUDIT_ACTIONS } from "./hr-admin-outcome.ts";

export function createProductionHrAdminOutcomeOwner(db: typeof database): HrAdminOutcomeOwner {
  return {
    async readBack(scenario: HrAdminOutcomeScenario) {
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
          row.typeCode === OrganizationResponsibilityTypeCode.Supervising,
      );
      const hiddenBlockers = assignmentRows.filter(
        (row) =>
          row.holderPositionCode === scenario.outsideResponsibilityHolderPositionCode &&
          row.targetOrganizationCode === scenario.hrResponsibilityTargetOrganizationCode &&
          row.typeCode === OrganizationResponsibilityTypeCode.Head,
      );
      const deniedCombinationAssignments = assignmentRows.filter(
        (row) =>
          row.typeCode === OrganizationResponsibilityTypeCode.Supervising &&
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
      return {
        assignment:
          assignment === undefined
            ? null
            : {
                id: assignment.id,
                status: assignment.status,
                ended: assignment.endTime !== null,
                typeCode: assignment.typeCode,
                actorVisibleTargetCode: assignment.targetOrganizationCode,
                holderPositionCode: assignment.holderPositionCode,
              },
        assignmentAudits: assignmentAudits.map((audit) => ({
          action: audit.action,
          actorUsername: audit.actorUsername,
          outcome: audit.outcome,
        })),
        rebuildState:
          publication === undefined
            ? null
            : {
                version: publication.version,
                reasonCodes: publication.reasonCodes,
                status: publication.status,
              },
        document:
          publication === undefined
            ? null
            : {
                sourceVersion: publication.sourceVersion,
                containsEndedTargetResponsibility: containsResponsibilityTarget(
                  publication.document,
                  scenario.hrResponsibilityTargetOrganizationCode,
                ),
              },
        hiddenBlocker: {
          count: hiddenBlockers.length,
          status: hiddenBlockers[0]?.status ?? null,
        },
        deniedCombinationAssignments,
        deniedAssignmentAudits: hrResponsibilityAudits.length - assignmentAudits.length,
        adminMixedRoleAssignmentExists: adminMixedRoleAssignment.length !== 0,
        secondScopeRoleAssignmentExists: secondScopeRoleAssignment.length !== 0,
      };
    },
  };
}

function containsResponsibilityTarget(document: unknown, code: string) {
  const parsed = StoredUserDocumentSchema.parse(document);
  return parsed.employments.some((employment) =>
    employment.responsibilities.some((responsibility) => responsibility.targetOrganization.code === code),
  );
}
