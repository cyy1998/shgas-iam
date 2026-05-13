import type { RelationsConfig, RelationsHelper } from "../types";

export function employmentRolesRelations(r: RelationsHelper) {
  return {
    employmentRoles: {
      employment: r.one.employments({
        from: r.employmentRoles.employmentId,
        to: r.employments.id,
      }),
      role: r.one.roles({
        from: r.employmentRoles.roleId,
        to: r.roles.id,
      }),
    },
  } satisfies RelationsConfig;
}
