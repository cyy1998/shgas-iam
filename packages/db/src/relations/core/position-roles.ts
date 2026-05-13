import type { RelationsConfig, RelationsHelper } from "../types";

export function positionRolesRelations(r: RelationsHelper) {
  return {
    positionRoles: {
      position: r.one.positions({
        from: r.positionRoles.positionId,
        to: r.positions.id,
      }),
      role: r.one.roles({
        from: r.positionRoles.roleId,
        to: r.roles.id,
      }),
    },
  } satisfies RelationsConfig;
}
