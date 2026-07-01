import type { RelationsConfig, RelationsHelper } from "../types";

export function userProfileDirtyRelations(r: RelationsHelper) {
  return {
    userProfileDirty: {
      user: r.one.users({
        from: r.userProfileDirty.userId,
        to: r.users.id,
      }),
    },
  } satisfies RelationsConfig;
}
