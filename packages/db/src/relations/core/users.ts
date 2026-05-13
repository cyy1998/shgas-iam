import type { RelationsConfig, RelationsHelper } from "../types";

export function usersRelations(r: RelationsHelper) {
  return {
    users: {
      employments: r.many.employments({
        from: r.users.id,
        to: r.employments.userId,
      }),
      delegationTo: r.many.privilegeDelegations({
        from: r.users.id,
        to: r.privilegeDelegations.delegatorUserId,
        alias: "delegationTo",
      }),
      delegationFrom: r.many.privilegeDelegations({
        from: r.users.id,
        to: r.privilegeDelegations.delegateeUserId,
        alias: "delegationFrom",
      }),
      loginLogs: r.many.loginLogs({
        from: r.users.id,
        to: r.loginLogs.userId,
      }),
    },
  } satisfies RelationsConfig;
}
