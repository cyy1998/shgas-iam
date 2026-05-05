import type { RelationsConfig, RelationsHelper } from "../types";

export function posOrgRolesRelations(r: RelationsHelper) {
  return {
    posOrgRoles: {
      posOrg: r.one.posOrgCompositions({
        from: r.posOrgRoles.posOrgId,
        to: r.posOrgCompositions.id,
      }),
      role: r.one.roles({
        from: r.posOrgRoles.roleId,
        to: r.roles.id,
      }),
    },
  } satisfies RelationsConfig;
}
