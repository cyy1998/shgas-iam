import type { db as database } from "@iam/db";
import type {
  HrAdminOutcomeOwner,
  HrAdminOutcomeScenario,
} from "./hr-admin-outcome.ts";
import {
  auditLogs,
  userProfileDirty,
  userProfiles,
} from "@iam/db/schema";
import { and, eq } from "drizzle-orm";

export function createProductionHrAdminOutcomeOwner(
  db: typeof database,
): HrAdminOutcomeOwner {
  return {
    async readBack(scenario: HrAdminOutcomeScenario) {
      const [user, successfulUserAudits, outsideOrganization, outsideOrganizationAudits] = await Promise.all([
        db.query.users.findFirst({
          columns: { id: true, name: true },
          where: { username: scenario.hrAdminUsername, isDelete: false },
        }),
        db.select({
          action: auditLogs.action,
          actorUsername: auditLogs.actorUsername,
          outcome: auditLogs.outcome,
          targetCode: auditLogs.targetCode,
        })
          .from(auditLogs)
          .where(and(
            eq(auditLogs.action, "admin.user.update"),
            eq(auditLogs.outcome, "success"),
            eq(auditLogs.targetCode, scenario.hrAdminUsername),
          )),
        db.query.organizations.findFirst({
          columns: { orgName: true },
          where: {
            orgCode: scenario.responsibilityTargetOrganizationCode,
            isDelete: false,
          },
        }),
        db.select({
          action: auditLogs.action,
          outcome: auditLogs.outcome,
        })
          .from(auditLogs)
          .where(and(
            eq(auditLogs.action, "admin.organization.update"),
            eq(
              auditLogs.targetCode,
              scenario.responsibilityTargetOrganizationCode,
            ),
          )),
      ]);
      const publication = user === undefined
        ? undefined
        : (await db.select({
            dirtyVersion: userProfileDirty.dirtyVersion,
            reasonCodes: userProfileDirty.reasonCodes,
            status: userProfileDirty.status,
            profileName: userProfiles.name,
            sourceDirtyVersion: userProfiles.sourceDirtyVersion,
          })
            .from(userProfileDirty)
            .innerJoin(
              userProfiles,
              eq(userProfiles.userId, userProfileDirty.userId),
            )
            .where(eq(userProfileDirty.userId, user.id))
            .limit(1))[0];

      return {
        user: user === undefined ? null : { name: user.name },
        successfulUserAudits,
        dirty: publication === undefined
          ? null
          : {
              dirtyVersion: publication.dirtyVersion,
              reasonCodes: publication.reasonCodes,
              status: publication.status,
            },
        profile: publication === undefined
          ? null
          : {
              name: publication.profileName,
              sourceDirtyVersion: publication.sourceDirtyVersion,
            },
        outsideOrganization: outsideOrganization === undefined
          ? null
          : { name: outsideOrganization.orgName },
        outsideOrganizationAudits,
      };
    },
  };
}
