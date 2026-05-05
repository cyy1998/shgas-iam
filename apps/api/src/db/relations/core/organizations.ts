import type { RelationsConfig, RelationsHelper } from "../types";

export function organizationsRelations(r: RelationsHelper) {
  return {
    organizations: {
      parent: r.one.organizations({
        from: r.organizations.parentId,
        to: r.organizations.id,
        optional: true,
        alias: "org_parent",
      }),
      children: r.many.organizations({
        from: r.organizations.id,
        to: r.organizations.parentId,
        alias: "org_parent",
      }),
      deptEmployments: r.many.employments({
        from: r.organizations.id,
        to: r.employments.orgId,
        alias: "employment_dept",
      }),
      compEmployments: r.many.employments({
        from: r.organizations.id,
        to: r.employments.compId,
        alias: "employment_comp",
      }),
      roles: r.many.organizationRoles({
        from: r.organizations.id,
        to: r.organizationRoles.organizationId,
      }),
      posOrgComposition: r.many.posOrgCompositions({
        from: r.organizations.id,
        to: r.posOrgCompositions.orgId,
      }),
      ancestorClosures: r.many.organizationClosures({
        from: r.organizations.id,
        to: r.organizationClosures.descendantId,
        alias: "org_ancestor",
      }),
      descendantClosures: r.many.organizationClosures({
        from: r.organizations.id,
        to: r.organizationClosures.ancestorId,
        alias: "org_descendant",
      }),
      privilegeDelegations: r.many.privilegeDelegations({
        from: r.organizations.id,
        to: r.privilegeDelegations.organizationScopeId,
      }),
    },
  } satisfies RelationsConfig;
}
