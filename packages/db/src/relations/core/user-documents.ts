import type { RelationsConfig, RelationsHelper } from "../types";

export function userDocumentsRelations(r: RelationsHelper) {
  return {
    userDocuments: {
      user: r.one.users({
        from: r.userDocuments.userId,
        to: r.users.id,
      }),
    },
  } satisfies RelationsConfig;
}
