import type { RelationsConfig, RelationsHelper } from "../types";

export function clientDelegationsRelations(r: RelationsHelper) {
  return {
    clientDelegations: {
      delegatorUser: r.one.users({
        from: r.clientDelegations.delegatorUserId,
        to: r.users.id,
        alias: "delegationTo",
      }),
      delegateeUser: r.one.users({
        from: r.clientDelegations.delegateeUserId,
        to: r.users.id,
        alias: "delegationFrom",
      }),
      organizationScope: r.one.organizations({
        from: r.clientDelegations.organizationScopeId,
        to: r.organizations.id,
      }),
      client: r.one.clients({ from: r.clientDelegations.clientId, to: r.clients.id }),
    },
  } satisfies RelationsConfig;
}
