import type { RelationsConfig, RelationsHelper } from "../types";

export function usersRelations(r: RelationsHelper) {
  return {
    users: {
      employments: r.many.employments({
        from: r.users.id,
        to: r.employments.userId,
      }),
      document: r.one.userDocuments({
        from: r.users.id,
        to: r.userDocuments.userId,
      }),
      rebuildState: r.one.userDocumentRebuildStates({
        from: r.users.id,
        to: r.userDocumentRebuildStates.userId,
      }),
      delegationTo: r.many.clientDelegations({
        from: r.users.id,
        to: r.clientDelegations.delegatorUserId,
        alias: "delegationTo",
      }),
      delegationFrom: r.many.clientDelegations({
        from: r.users.id,
        to: r.clientDelegations.delegateeUserId,
        alias: "delegationFrom",
      }),
    },
  } satisfies RelationsConfig;
}
