import type { RelationsConfig, RelationsHelper } from "../types";

export function employmentsRelations(r: RelationsHelper) {
  return {
    employments: {
      user: r.one.users({
        from: r.employments.userId,
        to: r.users.id,
      }),
      department: r.one.organizations({
        from: r.employments.orgId,
        to: r.organizations.id,
        alias: "employment_dept",
      }),
      position: r.one.positions({
        from: r.employments.posId,
        to: r.positions.id,
      }),
      responsibilityAssignments: r.many.organizationResponsibilityAssignments({
        from: r.employments.id,
        to: r.organizationResponsibilityAssignments.employmentId,
        alias: "organization_responsibility_holder",
      }),
    },
  } satisfies RelationsConfig;
}
