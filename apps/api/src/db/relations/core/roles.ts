import type { RelationsConfig, RelationsHelper } from "../types";

export function rolesRelations(r: RelationsHelper) {
  return {
    roles: {
      client: r.one.clients({
        from: r.roles.clientId,
        to: r.clients.id,
      }),
      positions: r.many.positionRoles({
        from: r.roles.id,
        to: r.positionRoles.roleId,
      }),
      organizations: r.many.organizationRoles({
        from: r.roles.id,
        to: r.organizationRoles.roleId,
      }),
      positionOrganizations: r.many.posOrgRoles({
        from: r.roles.id,
        to: r.posOrgRoles.roleId,
      }),
      employments: r.many.employmentRoles({
        from: r.roles.id,
        to: r.employmentRoles.roleId,
      }),
      privileges: r.many.rolePrivileges({
        from: r.roles.id,
        to: r.rolePrivileges.roleId,
      }),
    },
  } satisfies RelationsConfig;
}
