import { ApiErrorCode, UserStatus } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import { V3UserProfileSearchRequestSchema } from "../query/profile-v3-filter";
import { createV3UserProfileQueryService } from "../query/profile-v3-query.service";

test("rejects an extremely deep filter without overflowing the public schema parser", () => {
  let filter: unknown = {
    field: "user.status",
    op: "eq",
    value: UserStatus.Enable,
  };
  for (let depth = 0; depth < 10_000; depth++)
    filter = { not: filter };

  const result = V3UserProfileSearchRequestSchema.safeParse({ filter });

  expect(result.success).toBeFalse();
});

test("deduplicates membership values before applying the distinct value budget", () => {
  const scalarResult = V3UserProfileSearchRequestSchema.safeParse({
    filter: {
      field: "user.status",
      op: "in",
      value: Array.from({ length: 101 }).fill(UserStatus.Enable),
    },
  });
  const arrayResult = V3UserProfileSearchRequestSchema.safeParse({
    filter: {
      exists: {
        path: "employments",
        where: {
          field: "roles",
          op: "containsAll",
          value: Array.from({ length: 101 }).fill("role-effective"),
        },
      },
    },
  });

  expect(scalarResult.success && scalarResult.data.filter).toEqual({
    field: "user.status",
    op: "in",
    value: [UserStatus.Enable],
  });
  expect(arrayResult.success && arrayResult.data.filter).toEqual({
    exists: {
      path: "employments",
      where: {
        field: "roles",
        op: "containsAll",
        value: ["role-effective"],
      },
    },
  });
});

test("rejects every structural and value budget before calling the repository", async () => {
  const searchCurrentProfiles = mock(async () => []);
  const service = createV3UserProfileQueryService({
    profileRepository: {
      searchCurrentProfileBases: mock(async () => []),
      searchCurrentProfiles,
    },
  });
  const invalidRequests = [
    { filter: nestedNot(9) },
    { filter: filterWithNodeCount65() },
    {
      filter: {
        and: Array.from({ length: 17 }, () => ({
          field: "user.username",
          op: "eq",
          value: "alice",
        })),
      },
    },
    {
      filter: {
        field: "user.username",
        op: "in",
        value: Array.from({ length: 51 }, (_, index) => `user-${index}`),
      },
    },
    {
      filter: {
        field: "user.username",
        op: "eq",
        value: "u".repeat(129),
      },
    },
    {
      filter: {
        field: "user.username",
        op: "in",
        value: Array.from({ length: 501 }).fill("alice"),
      },
    },
  ];

  for (const request of invalidRequests) {
    const error = await service.search(request).catch(error => error);
    expect(error).toMatchObject({
      name: "V3UserProfileFilterValidationError",
      httpStatus: 422,
    });
  }
  expect(searchCurrentProfiles).not.toHaveBeenCalled();
});

test("maps repository failures to the stable sanitized unavailable error", async () => {
  const service = createV3UserProfileQueryService({
    profileRepository: {
      searchCurrentProfileBases: mock(async () => []),
      searchCurrentProfiles: mock(async () => {
        throw new Error("postgresql://user:secret@database/internal-detail");
      }),
    },
  });

  const error = await service.search({
    filter: {
      field: "user.status",
      op: "eq",
      value: UserStatus.Enable,
    },
  }).catch(error => error);

  expect(error).toMatchObject({
    name: "V3UserProfileSearchUnavailableError",
    code: ApiErrorCode.UserSearchUnavailable,
    httpStatus: 503,
    message: "用户搜索暂时不可用",
  });
  expect(error).not.toHaveProperty("cause");
  expect(JSON.stringify(error)).not.toContain("secret");
});

function nestedNot(depth: number): unknown {
  if (depth === 1) {
    return {
      field: "user.username",
      op: "eq",
      value: "alice",
    };
  }
  return { not: nestedNot(depth - 1) };
}

function filterWithNodeCount65() {
  return {
    and: Array.from({ length: 4 }, () => ({
      and: Array.from({ length: 15 }, () => ({
        field: "user.username",
        op: "eq",
        value: "alice",
      })),
    })),
  };
}
