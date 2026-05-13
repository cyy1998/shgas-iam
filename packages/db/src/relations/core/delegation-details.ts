import type { RelationsConfig, RelationsHelper } from "../types";

export function delegationDetailsRelations(r: RelationsHelper) {
  return {
    delegationDetails: {
      delegation: r.one.privilegeDelegations({
        from: r.delegationDetails.delegationId,
        to: r.privilegeDelegations.id,
      }),
      privilege: r.one.privileges({
        from: r.delegationDetails.privilegeId,
        to: r.privileges.id,
      }),
    },
  } satisfies RelationsConfig;
}
