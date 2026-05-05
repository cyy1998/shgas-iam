import type { RelationsConfig, RelationsHelper } from "../types";

export function positionsRelations(r: RelationsHelper) {
  return {
    positions: {
      employments: r.many.employments({
        from: r.positions.id,
        to: r.employments.posId,
      }),
      roles: r.many.positionRoles({
        from: r.positions.id,
        to: r.positionRoles.positionId,
      }),
      posOrgComposition: r.many.posOrgCompositions({
        from: r.positions.id,
        to: r.posOrgCompositions.posId,
      }),
    },
  } satisfies RelationsConfig;
}
