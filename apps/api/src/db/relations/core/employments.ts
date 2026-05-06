import type { RelationsConfig, RelationsHelper } from "../types";

export function employmentsRelations(r: RelationsHelper) {
  return {
    employments: {
      user: r.one.users({
        from: r.employments.userId,
        to: r.users.id,
      }),
      deptartment: r.one.organizations({
        from: r.employments.orgId,
        to: r.organizations.id,
        alias: "employment_dept",
      }),
      company: r.one.organizations({
        from: r.employments.compId,
        to: r.organizations.id,
        alias: "employment_comp",
      }),
      position: r.one.positions({
        from: r.employments.posId,
        to: r.positions.id,
      }),
      roles: r.many.employmentRoles({
        from: r.employments.id,
        to: r.employmentRoles.employmentId,
      }),
    },
  } satisfies RelationsConfig;
}
