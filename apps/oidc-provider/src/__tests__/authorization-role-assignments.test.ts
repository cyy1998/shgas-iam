import { describe, expect, it } from "vitest";
import { resolveRoleIdsByEmploymentFromAssignments } from "../repositories/authorization.repository";

describe("resolveRoleIdsByEmploymentFromAssignments", () => {
  it("aggregates direct, position, organization exact, descendant roles, dedupes, and filters inactive roles", () => {
    const result = resolveRoleIdsByEmploymentFromAssignments({
      activeRoleIds: new Set([1, 2, 3, 4]),
      employments: [
        { id: 100, orgId: 10, posId: 20 },
      ],
      directRoleRows: [
        { targetId: 100, roleId: 1 },
        { targetId: 100, roleId: 99 },
      ],
      positionRoleRows: [
        { targetId: 20, roleId: 2 },
        { targetId: 20, roleId: 1 },
      ],
      organizationRoleRows: [
        { targetId: 10, roleId: 3, includeDescendants: false },
        { targetId: 1, roleId: 4, includeDescendants: true },
        { targetId: 1, roleId: 5, includeDescendants: false },
      ],
      pathByOrg: new Map([
        [10, [{ id: 1 }, { id: 10 }]],
      ]),
    });

    expect(result.get(100)).toEqual([1, 2, 3, 4]);
  });
});
