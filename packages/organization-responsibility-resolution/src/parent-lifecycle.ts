import { OrganizationResponsibilityAssignmentStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { organizationClosures, organizationResponsibilityAssignments } from "@iam/db/schema";
import { OrganizationHasOpenResponsibilityAssignmentError } from "@iam/domain/organization";
import { and, eq, inArray } from "drizzle-orm";

export function createOrganizationResponsibilityParentLifecycleReader(db: DbClient) {
  return {
    async hasOpenAssignmentTargetingOrganizationSubtree(organizationId: number) {
      const rows = await db
        .select({ id: organizationResponsibilityAssignments.id })
        .from(organizationResponsibilityAssignments)
        .innerJoin(
          organizationClosures,
          eq(organizationResponsibilityAssignments.targetOrganizationId, organizationClosures.descendantId),
        )
        .where(
          and(
            eq(organizationClosures.ancestorId, organizationId),
            inArray(organizationResponsibilityAssignments.status, [
              OrganizationResponsibilityAssignmentStatus.Enable,
              OrganizationResponsibilityAssignmentStatus.Pause,
            ]),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
  };
}

export function createOrganizationResponsibilityParentLifecycleGuard(assignmentReader: {
  hasOpenAssignmentTargetingOrganizationSubtree: (organizationId: number) => Promise<boolean>;
}) {
  return {
    async assertNoOpenAssignmentsTargetingOrganizationSubtree(input: { organizationId: number }) {
      if (await assignmentReader.hasOpenAssignmentTargetingOrganizationSubtree(input.organizationId))
        throw new OrganizationHasOpenResponsibilityAssignmentError();
    },
  };
}

export type OrganizationResponsibilityParentLifecycleGuard = ReturnType<
  typeof createOrganizationResponsibilityParentLifecycleGuard
>;
