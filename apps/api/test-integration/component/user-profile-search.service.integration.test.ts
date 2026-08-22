import { createV3UserProfileSearchAdapter } from "@api/services/user-profile-search/user-profile-search-v3.adapter";
import { createUserProfileSearchService } from "@api/services/user-profile-search/user-profile-search.service";
import { UserStatus, UserType } from "@iam/contracts";
import { createV3UserProfileQueryService } from "@iam/user-profile-read-model/v3";
import { expect, mock, test } from "bun:test";

test("exposes the active DSL and legacy search providers through one service", async () => {
  const dslInput = {
    filter: {
      exists: {
        path: "employments",
        where: { field: "position.code", op: "eq", value: "MANAGER" },
      },
    },
  };
  const legacyInput = { usernames: ["zhangsan"] };
  const searchDsl = mock(async () => []);
  const searchLegacyUsers = mock(async () => []);
  const service = createUserProfileSearchService({
    dslSearch: { searchDsl },
    legacySearch: { searchLegacyUsers },
  });

  const dslResult = await service.searchDsl(dslInput);
  const legacyResult = await service.searchLegacyUsers(legacyInput);

  expect(dslResult).toEqual([]);
  expect(legacyResult).toEqual([]);
  expect(searchDsl).toHaveBeenCalledWith(dslInput);
  expect(searchLegacyUsers).toHaveBeenCalledWith(legacyInput);
});

test("maps legacy user search to one canonical Filter and preserves the UserDto response", async () => {
  const detail = {
    id: 101,
    username: "zhangsan",
    wxId: "wx-zhangsan",
    name: "张三",
    mobile: "13800000000",
    userType: UserType.Formal,
    orderNum: 1,
    status: UserStatus.Pause,
    isDelete: false,
    createTime: new Date("2026-08-22T00:00:00.000Z"),
    updateTime: new Date("2026-08-22T01:00:00.000Z"),
    employments: [],
    privileges: [],
    roles: [],
  };
  const search = mock(async () => [detail]);
  const adapter = createV3UserProfileSearchAdapter({ search });

  const result = await adapter.searchLegacyUsers({
    usernames: ["zhangsan", "lisi"],
    names: ["张三"],
    phones: ["13800000000"],
    wxIds: ["wx-zhangsan"],
    ancestorOrgCodes: ["ORG-A", "ORG-B"],
    ancestorOrgDepths: [0, 1],
    positionCodes: ["MANAGER"],
    roleCodes: ["role:a", "role:b"],
  });

  expect(search).toHaveBeenCalledWith({
    filter: {
      and: [
        { field: "user.username", op: "in", value: ["zhangsan", "lisi"] },
        { field: "user.name", op: "in", value: ["张三"] },
        { field: "user.mobile", op: "in", value: ["13800000000"] },
        { field: "user.wxId", op: "in", value: ["wx-zhangsan"] },
        {
          exists: {
            path: "employments",
            where: {
              and: [
                { field: "position.code", op: "in", value: ["MANAGER"] },
                { field: "roles", op: "containsAny", value: ["role:a", "role:b"] },
                {
                  exists: {
                    path: "organization.path",
                    where: {
                      and: [
                        { field: "code", op: "in", value: ["ORG-A", "ORG-B"] },
                        { field: "distanceToTarget", op: "in", value: [0, 1] },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    },
  });
  expect(result).toEqual([{
    id: 101,
    username: "zhangsan",
    wxId: "wx-zhangsan",
    name: "张三",
    mobile: "13800000000",
    userType: UserType.Formal,
    orderNum: 1,
    status: UserStatus.Pause,
    isDelete: false,
    createTime: new Date("2026-08-22T00:00:00.000Z"),
    updateTime: new Date("2026-08-22T01:00:00.000Z"),
  }]);
});

test("rejects legacy requests without real conditions before querying profiles", async () => {
  const searchCurrentProfiles = mock(async () => []);
  const query = createV3UserProfileQueryService({
    profileRepository: { searchCurrentProfiles },
  });
  const adapter = createV3UserProfileSearchAdapter(query);

  for (const input of [
    {},
    { usernames: [] },
    { usernames: [], names: ["张三"] },
  ]) {
    const error = await adapter.searchLegacyUsers(input).catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: "COMMON.VALIDATION_FAILED",
      httpStatus: 422,
    });
  }
  expect(searchCurrentProfiles).not.toHaveBeenCalled();
});

test("maps a lone ancestor parameter to one Organization Path node condition", async () => {
  const cases = [
    {
      input: { ancestorOrgCodes: ["ORG-A"] },
      condition: { field: "code", op: "in", value: ["ORG-A"] },
    },
    {
      input: { ancestorOrgDepths: [0, 2] },
      condition: { field: "distanceToTarget", op: "in", value: [0, 2] },
    },
  ];

  for (const { input, condition } of cases) {
    const search = mock(async () => []);
    const adapter = createV3UserProfileSearchAdapter({ search });

    await adapter.searchLegacyUsers(input);

    expect(search).toHaveBeenCalledWith({
      filter: {
        exists: {
          path: "employments",
          where: {
            exists: {
              path: "organization.path",
              where: condition,
            },
          },
        },
      },
    });
  }
});
