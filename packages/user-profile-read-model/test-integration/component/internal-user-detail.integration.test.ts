import { UserStatus, UserType } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import { createInternalUserProfileQueryService } from "../../src/internal-user-query.service";

const now = new Date("2026-08-22T12:00:00.000Z");

test("maps Internal Detail database failures to a sanitized unavailable error", async () => {
  const service = createInternalUserProfileQueryService({
    profileRepository: {
      getCurrentByUsername: mock(async () => {
        throw new Error("database DSN must not escape");
      }),
    },
  });

  const error = await service.getDetailByUsername("alice").catch(error => error);

  expect(error).toMatchObject({
    code: "USER_SEARCH_UNAVAILABLE",
    httpStatus: 503,
    message: "用户搜索暂时不可用",
  });
});

test("fails closed when the published current Detail is malformed", async () => {
  const service = createInternalUserProfileQueryService({
    profileRepository: {
      getCurrentByUsername: mock(async () => ({
        detail: {
          id: 1,
          username: "alice",
          name: "Alice",
          mobile: null,
          wxId: null,
          userType: UserType.Formal,
          orderNum: 1,
          status: UserStatus.Enable,
          isDelete: false,
          createTime: now,
          updateTime: now,
          employments: [{ responsibilities: "malformed" }],
          privileges: [],
          roles: [],
        },
      })),
    },
  });

  const error = await service.getDetailByUsername("alice").catch(error => error);

  expect(error).toMatchObject({
    message: "已发布的 User Profile Detail 不符合严格契约",
  });
});
