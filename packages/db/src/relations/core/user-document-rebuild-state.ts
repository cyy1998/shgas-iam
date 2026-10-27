import type { RelationsConfig, RelationsHelper } from "../types";

export function userDocumentRebuildStatesRelations(r: RelationsHelper) {
  return {
    userDocumentRebuildStates: {
      user: r.one.users({
        from: r.userDocumentRebuildStates.userId,
        to: r.users.id,
      }),
    },
  } satisfies RelationsConfig;
}
