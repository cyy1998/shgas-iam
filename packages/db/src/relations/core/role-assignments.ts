import type { RelationsConfig, RelationsHelper } from "../types";

export function roleAssignmentsRelations(r: RelationsHelper) {
  return {
    roleAssignments: {
      role: r.one.roles({
        from: r.roleAssignments.roleId,
        to: r.roles.id,
      }),
    },
  } satisfies RelationsConfig;
}
