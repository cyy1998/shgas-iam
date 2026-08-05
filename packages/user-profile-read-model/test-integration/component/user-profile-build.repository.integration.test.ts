import type { UserProfileEffectiveRoleResolverPort } from "../../src/user-profile-build.repository";
import {
  employments,
  organizationClosures,
  positions,
  rolePrivileges,
  roles,
  users,
} from "@iam/db/schema";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileBuildRepository } from "../../src/user-profile-build.repository";

interface BuildQueryRows {
  readonly users: readonly unknown[];
  readonly employments: readonly unknown[];
  readonly positions: readonly unknown[];
  readonly organizationPaths: readonly unknown[];
  readonly roleClients: readonly unknown[];
  readonly privileges: readonly unknown[];
}

function createBuildDb(rows: BuildQueryRows) {
  return {
    select: mock(() => {
      let selectedRows: readonly unknown[] | undefined;
      const query = {
        from: mock((table: unknown) => {
          if (table === users)
            selectedRows = rows.users;
          else if (table === employments)
            selectedRows = rows.employments;
          else if (table === positions)
            selectedRows = rows.positions;
          else if (table === organizationClosures)
            selectedRows = rows.organizationPaths;
          else if (table === roles)
            selectedRows = rows.roleClients;
          else if (table === rolePrivileges)
            selectedRows = rows.privileges;
          else
            throw new Error("Unexpected User Profile build query table");

          return query;
        }),
        innerJoin: mock(() => query),
        where: mock(async () => selectedRows ?? []),
      };
      return query;
    }),
  };
}

describe("UserProfileBuildRepository", () => {
  test("builds role and privilege rows from one batch Effective Role resolution", async () => {
    const db = createBuildDb({
      users: [{ id: 1, username: "alice" }],
      employments: [
        { id: 10, userId: 1, posId: 100, orgId: 1000 },
        { id: 11, userId: 1, posId: 101, orgId: 1001 },
      ],
      positions: [
        { id: 100, posCode: "P100" },
        { id: 101, posCode: "P101" },
      ],
      organizationPaths: [
        { descendantId: 1000, depth: 0, id: 1000, orgCode: "ORG1000" },
        { descendantId: 1001, depth: 0, id: 1001, orgCode: "ORG1001" },
      ],
      roleClients: [
        { roleId: 7, clientCode: "portal" },
        { roleId: 8, clientCode: "backoffice" },
      ],
      privileges: [
        { roleId: 7, privilegeCode: "user:read" },
        { roleId: 8, privilegeCode: "user:write" },
      ],
    });
    const resolveEffectiveRoles = mock(async () => new Map([
      [10, [
        { id: 7, roleCode: "role-a" },
        { id: 8, roleCode: "role-b" },
      ]],
      [11, [{ id: 7, roleCode: "role-a" }]],
    ]));
    const roleAssignmentResolver: UserProfileEffectiveRoleResolverPort = {
      resolveEffectiveRoles,
    };
    const repository = createUserProfileBuildRepository(
      db as never,
      roleAssignmentResolver,
    );

    const dataset = await repository.loadByUserIds([1, 1]);

    expect(resolveEffectiveRoles).toHaveBeenCalledWith({ employmentIds: [10, 11] });
    expect(dataset.roleRows).toEqual([
      { employmentId: 10, roleId: 7, roleCode: "role-a", clientCode: "portal" },
      { employmentId: 10, roleId: 8, roleCode: "role-b", clientCode: "backoffice" },
      { employmentId: 11, roleId: 7, roleCode: "role-a", clientCode: "portal" },
    ]);
    expect(dataset.privilegeRows).toEqual([
      { roleId: 7, privilegeCode: "user:read" },
      { roleId: 8, privilegeCode: "user:write" },
    ]);
  });
});
