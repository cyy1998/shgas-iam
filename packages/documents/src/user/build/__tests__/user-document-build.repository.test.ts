import { describe, expect, mock, test } from "bun:test";
import { RoleType } from "@iam/contracts";
import { employments, organizationClosures, positions, roles, users } from "@iam/db/schema";
import type { UserDocumentEffectiveRoleResolverPort } from "../user-document-build.repository";
import { createUserDocumentBuildRepository } from "../user-document-build.repository";

interface BuildQueryRows {
  readonly users: readonly unknown[];
  readonly employments: readonly unknown[];
  readonly positions: readonly unknown[];
  readonly organizationPaths: readonly unknown[];
  readonly roleClients: readonly unknown[];
}

function createBuildDb(rows: BuildQueryRows) {
  return {
    select: mock(() => {
      let selectedRows: readonly unknown[] | undefined;
      const query = {
        from: mock((table: unknown) => {
          if (table === users) selectedRows = rows.users;
          else if (table === employments) selectedRows = rows.employments;
          else if (table === positions) selectedRows = rows.positions;
          else if (table === organizationClosures) selectedRows = rows.organizationPaths;
          else if (table === roles) selectedRows = rows.roleClients;
          else throw new Error("Unexpected User Document build query table");

          return query;
        }),
        innerJoin: mock(() => query),
        leftJoin: mock(() => query),
        where: mock(async () => selectedRows ?? []),
      };
      return query;
    }),
  };
}

describe("UserDocumentBuildRepository", () => {
  test("builds client-scoped role rows from one batch Effective Role resolution", async () => {
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
        { roleId: 7, roleType: RoleType.Client, clientCode: "portal" },
        { roleId: 8, roleType: RoleType.Client, clientCode: "backoffice" },
      ],
    });
    const resolveEffectiveRoles = mock(
      async () =>
        new Map([
          [
            10,
            [
              { id: 7, roleCode: "role-a" },
              { id: 8, roleCode: "role-b" },
            ],
          ],
          [11, [{ id: 7, roleCode: "role-a" }]],
        ]),
    );
    const roleAssignmentResolver: UserDocumentEffectiveRoleResolverPort = {
      resolveEffectiveRoles,
    };
    const repository = createUserDocumentBuildRepository(db as never, roleAssignmentResolver);

    const dataset = await repository.loadByUserIds([1, 1]);

    expect(resolveEffectiveRoles).toHaveBeenCalledWith({ employmentIds: [10, 11] });
    expect(dataset.roleRows).toEqual([
      { employmentId: 10, roleId: 7, roleCode: "role-a", roleType: RoleType.Client, clientCode: "portal" },
      { employmentId: 10, roleId: 8, roleCode: "role-b", roleType: RoleType.Client, clientCode: "backoffice" },
      { employmentId: 11, roleId: 7, roleCode: "role-a", roleType: RoleType.Client, clientCode: "portal" },
    ]);
  });
});
