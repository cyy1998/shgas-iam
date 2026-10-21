import type { RelationsConfig, RelationsHelper } from "../types";

export function usersRelations(r: RelationsHelper) {
  return {
    users: {
      employments: r.many.employments({
        from: r.users.id,
        to: r.employments.userId,
      }),
      profile: r.one.userProfiles({
        from: r.users.id,
        to: r.userProfiles.userId,
      }),
      profileDirty: r.one.userProfileDirty({
        from: r.users.id,
        to: r.userProfileDirty.userId,
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
