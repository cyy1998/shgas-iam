import type { RelationsConfig, RelationsHelper } from "../types";

export function posOrgCompositionsRelations(r: RelationsHelper) {
  return {
    posOrgCompositions: {
      position: r.one.positions({
        from: r.posOrgCompositions.posId,
        to: r.positions.id,
      }),
      organization: r.one.organizations({
        from: r.posOrgCompositions.orgId,
        to: r.organizations.id,
      }),
      employments: r.many.employments({
        from: [r.posOrgCompositions.posId, r.posOrgCompositions.orgId],
        to: [r.employments.posId, r.employments.orgId],
      }),
      roles: r.many.posOrgRoles({
        from: r.posOrgCompositions.id,
        to: r.posOrgRoles.posOrgId,
      }),
    },
  } satisfies RelationsConfig;
}
