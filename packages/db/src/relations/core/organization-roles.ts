import type { RelationsConfig, RelationsHelper } from "../types";

export function organizationRolesRelations(r: RelationsHelper) {
  return {
    organizationRoles: {
      organization: r.one.organizations({
        from: r.organizationRoles.organizationId,
        to: r.organizations.id,
      }),
      role: r.one.roles({
        from: r.organizationRoles.roleId,
        to: r.roles.id,
      }),
    },
  } satisfies RelationsConfig;
}
