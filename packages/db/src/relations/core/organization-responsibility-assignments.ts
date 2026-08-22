import type { RelationsConfig, RelationsHelper } from "../types";

export function organizationResponsibilityAssignmentsRelations(r: RelationsHelper) {
  return {
    organizationResponsibilityAssignments: {
      holderEmployment: r.one.employments({
        from: r.organizationResponsibilityAssignments.employmentId,
        to: r.employments.id,
        alias: "organization_responsibility_holder",
      }),
      targetOrganization: r.one.organizations({
        from: r.organizationResponsibilityAssignments.targetOrganizationId,
        to: r.organizations.id,
        alias: "organization_responsibility_target",
      }),
    },
  } satisfies RelationsConfig;
}
