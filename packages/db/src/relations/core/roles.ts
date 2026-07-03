import type { RelationsConfig, RelationsHelper } from "../types";

export function rolesRelations(r: RelationsHelper) {
  return {
    roles: {
      client: r.one.clients({
        from: r.roles.clientId,
        to: r.clients.id,
      }),
      assignments: r.many.roleAssignments({
        from: r.roles.id,
        to: r.roleAssignments.roleId,
      }),
      privileges: r.many.rolePrivileges({
        from: r.roles.id,
        to: r.rolePrivileges.roleId,
      }),
    },
  } satisfies RelationsConfig;
}
