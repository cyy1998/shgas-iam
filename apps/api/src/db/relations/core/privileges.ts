import type { RelationsConfig, RelationsHelper } from "../types";

export function privilegesRelations(r: RelationsHelper) {
  return {
    privileges: {
      roles: r.many.rolePrivileges({
        from: r.privileges.id,
        to: r.rolePrivileges.privilegeId,
      }),
      delegations: r.many.delegationDetails({
        from: r.privileges.id,
        to: r.delegationDetails.privilegeId,
      }),
    },
  } satisfies RelationsConfig;
}
