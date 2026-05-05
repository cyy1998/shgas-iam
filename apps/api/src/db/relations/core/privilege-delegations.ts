import type { RelationsConfig, RelationsHelper } from "../types";

export function privilegeDelegationsRelations(r: RelationsHelper) {
  return {
    privilegeDelegations: {
      delegatorUser: r.one.users({
        from: r.privilegeDelegations.delegatorUserId,
        to: r.users.id,
        alias: "delegationTo",
      }),
      delegateeUser: r.one.users({
        from: r.privilegeDelegations.delegateeUserId,
        to: r.users.id,
        alias: "delegationFrom",
      }),
      organizationScope: r.one.organizations({
        from: r.privilegeDelegations.organizationScopeId,
        to: r.organizations.id,
      }),
      delegationDetails: r.many.delegationDetails({
        from: r.privilegeDelegations.id,
        to: r.delegationDetails.delegationId,
      }),
    },
  } satisfies RelationsConfig;
}
