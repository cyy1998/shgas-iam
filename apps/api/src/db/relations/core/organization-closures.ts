import type { RelationsConfig, RelationsHelper } from "../types";

export function organizationClosuresRelations(r: RelationsHelper) {
  return {
    organizationClosures: {
      ancestor: r.one.organizations({
        from: r.organizationClosures.ancestorId,
        to: r.organizations.id,
        alias: "org_ancestor",
      }),
      descendant: r.one.organizations({
        from: r.organizationClosures.descendantId,
        to: r.organizations.id,
        alias: "org_descendant",
      }),
    },
  } satisfies RelationsConfig;
}
