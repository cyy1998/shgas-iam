import { UserProfileScopeType } from "@iam/contracts";
import {
  employments,
  organizationClosures,
  privileges,
  rolePrivileges,
  users,
} from "@iam/db/schema";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileScopeRepository } from "../scope.repository";

interface ScopeQueryRows {
  readonly employments?: readonly { userId: number }[];
  readonly organizationClosures?: readonly { userId: number }[];
  readonly privileges?: readonly { roleId: number }[];
  readonly rolePrivileges?: readonly { roleId: number }[];
  readonly users?: readonly { userId: number }[];
}

function createScopeDb(rows: ScopeQueryRows = {}) {
  const select = mock(() => {
    let selectedTable: unknown;
    let selectedRows: readonly unknown[] = [];
    const query = {
      from: mock((table: unknown) => {
        selectedTable = table;
        if (table === employments)
          selectedRows = rows.employments ?? [];
        else if (table === organizationClosures)
          selectedRows = rows.organizationClosures ?? [];
        else if (table === privileges)
          selectedRows = rows.privileges ?? [];
        else if (table === rolePrivileges)
          selectedRows = rows.rolePrivileges ?? [];
        else if (table === users)
          selectedRows = rows.users ?? [];
        else
          throw new Error("Unexpected User Profile scope query table");

        return query;
      }),
      innerJoin: mock(() => query),
      where: mock(() => selectedTable === users ? query : Promise.resolve(selectedRows)),
      orderBy: mock(() => query),
      limit: mock(async () => selectedRows),
    };
    return query;
  });

  return { db: { select } as never, select };
}

describe("UserProfileScopeRepository", () => {
  test("delegates Role scope directly to one reverse role resolution", async () => {
    const { db, select } = createScopeDb();
    const resolveAffectedUserIds = mock(async () => [3, 9]);
    const repository = createUserProfileScopeRepository(db, { resolveAffectedUserIds });

    await expect(repository.resolveUserIds({
      scopeType: UserProfileScopeType.RoleId,
      scopeId: 42,
    })).resolves.toEqual([3, 9]);

    expect(resolveAffectedUserIds).toHaveBeenCalledTimes(1);
    expect(resolveAffectedUserIds).toHaveBeenCalledWith({ roleIds: [42] });
    expect(select).not.toHaveBeenCalled();
  });

  test("maps Privilege ID and code to role IDs before reusing reverse resolution", async () => {
    const { db } = createScopeDb({
      rolePrivileges: [{ roleId: 7 }, { roleId: 8 }, { roleId: 7 }],
      privileges: [{ roleId: 11 }, { roleId: 12 }],
    });
    const resolveAffectedUserIds = mock(async ({ roleIds }: { roleIds: readonly number[] }) =>
      roleIds[0] === 7 ? [2, 6] : [1, 2, 6]);
    const repository = createUserProfileScopeRepository(db, { resolveAffectedUserIds });

    await expect(repository.resolveUserIds({
      scopeType: UserProfileScopeType.PrivilegeId,
      scopeId: 100,
    })).resolves.toEqual([2, 6]);
    await expect(repository.resolveUserIds({
      scopeType: UserProfileScopeType.PrivilegeCode,
      scopeId: "user:read",
    })).resolves.toEqual([1, 2, 6]);

    expect(resolveAffectedUserIds.mock.calls.map(call => call[0])).toEqual([
      { roleIds: [7, 8, 7] },
      { roleIds: [11, 12] },
    ]);
  });

  test("preserves non-role scope behavior", async () => {
    const organizationRepository = createUserProfileScopeRepository(createScopeDb({
      organizationClosures: [{ userId: 4 }, { userId: 2 }, { userId: 4 }],
    }).db, { resolveAffectedUserIds: mock(async () => []) });
    const positionRepository = createUserProfileScopeRepository(createScopeDb({
      employments: [{ userId: 5 }, { userId: 3 }, { userId: 5 }],
    }).db, { resolveAffectedUserIds: mock(async () => []) });
    const employmentRepository = createUserProfileScopeRepository(createScopeDb({
      employments: [{ userId: 8 }],
    }).db, { resolveAffectedUserIds: mock(async () => []) });
    const allUsersRepository = createUserProfileScopeRepository(createScopeDb({
      users: [{ userId: 1 }, { userId: 2 }],
    }).db, { resolveAffectedUserIds: mock(async () => []) });

    await expect(organizationRepository.resolveUserIds({
      scopeType: UserProfileScopeType.OrganizationId,
      scopeId: 10,
    })).resolves.toEqual([4, 2]);
    await expect(positionRepository.resolveUserIds({
      scopeType: UserProfileScopeType.PositionId,
      scopeId: 20,
    })).resolves.toEqual([5, 3]);
    await expect(employmentRepository.resolveUserIds({
      scopeType: UserProfileScopeType.EmploymentId,
      scopeId: 30,
    })).resolves.toEqual([8]);
    await expect(allUsersRepository.resolveUserIds({
      scopeType: UserProfileScopeType.AllUsers,
    })).resolves.toEqual([1, 2]);
    await expect(allUsersRepository.resolveUserIds({
      scopeType: UserProfileScopeType.UserIds,
      userIds: [7, 6, 7],
    })).resolves.toEqual([7, 6]);
  });
});
