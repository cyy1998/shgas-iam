import type { RelationsConfig, RelationsHelper } from "../types";

export function positionsRelations(r: RelationsHelper) {
  return {
    positions: {
      employments: r.many.employments({
        from: r.positions.id,
        to: r.employments.posId,
      }),
    },
  } satisfies RelationsConfig;
}
