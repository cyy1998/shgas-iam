import type { RelationsConfig, RelationsHelper } from "../types";

export function rolePrivilegesRelations(r: RelationsHelper) {
  return {
    rolePrivileges: {
      role: r.one.roles({
        from: r.rolePrivileges.roleId,
        to: r.roles.id,
      }),
      privilege: r.one.privileges({
        from: r.rolePrivileges.privilegeId,
        to: r.privileges.id,
      }),
    },
  } satisfies RelationsConfig;
}
