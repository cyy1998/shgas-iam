import type { RelationsConfig, RelationsHelper } from "../types";

export function userProfilesRelations(r: RelationsHelper) {
  return {
    userProfiles: {
      user: r.one.users({
        from: r.userProfiles.userId,
        to: r.users.id,
      }),
    },
  } satisfies RelationsConfig;
}
