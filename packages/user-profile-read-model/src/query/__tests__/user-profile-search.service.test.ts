import { expect, mock, test } from "bun:test";
import { ApiErrorCode, UserStatus } from "@iam/contracts";
import { UserProfileSearchRequestSchema } from "../user-profile-filter";
import { createUserProfileSearchRepository } from "../user-profile-search.repository";
import { createUserProfileSearchService } from "../user-profile-search.service";

test("rejects an extremely deep filter without overflowing the public schema parser", () => {
  let filter: unknown = {
    field: "user.status",
    op: "eq",
    value: UserStatus.Enable,
  };
  for (let depth = 0; depth < 10_000; depth++) filter = { not: filter };

  const result = UserProfileSearchRequestSchema.safeParse({ filter });

  expect(result.success).toBeFalse();
});

test("deduplicates membership values before applying the distinct value budget", () => {
  const scalarResult = UserProfileSearchRequestSchema.safeParse({
    filter: {
      field: "user.status",
      op: "in",
      value: Array.from({ length: 101 }).fill(UserStatus.Enable),
    },
  });
  const arrayResult = UserProfileSearchRequestSchema.safeParse({
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

test("rejects every structural and value budget before accessing the database", async () => {
  const { query: service, select } = createValidationQuery();
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
    const error = await service.searchBase(request).catch((error) => error);
    expect(error).toMatchObject({
      name: "UserProfileFilterValidationError",
      httpStatus: 422,
    });
  }
  expect(select).not.toHaveBeenCalled();
});

test("maps repository failures to the stable sanitized unavailable error", async () => {
  const service = createUserProfileSearchService({
    profileRepository: {
      searchCurrentProfileBases: mock(async () => {
        throw new Error("postgresql://user:secret@database/internal-detail");
      }),
    },
  });

  const error = await service
    .searchBase({
      filter: {
        field: "user.status",
        op: "eq",
        value: UserStatus.Enable,
      },
    })
    .catch((error) => error);

  expect(error).toMatchObject({
    name: "UserProfileSearchUnavailableError",
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

test("strictly rejects legacy, empty, unknown, and wrongly typed expressions", async () => {
  const { query } = createValidationQuery();
  const invalidRequests = [
    undefined,
    null,
    {},
    { filter: undefined },
    { filter: { field: "user.username", op: "eq", value: "alice" }, limit: 1 },
    { filter: { all: [] } },
    { filter: { any: [] } },
    { filter: { nested: "user", where: { field: "username", op: "eq", value: "alice" } } },
    { filter: { and: [] } },
    { filter: { or: [] } },
    { filter: { field: "user.id", op: "eq", value: 1 } },
    { filter: { field: "user.username", op: "contains", value: "alice" } },
    { filter: { field: "user.username", op: "eq", value: 123 } },
    { filter: { field: "user.status", op: "eq", value: "1" } },
    { filter: { field: "user.mobile", op: "eq", value: null } },
    { filter: { field: "user.userType", op: "in", value: [] } },
    { filter: { field: "user.name", op: "eq", value: "Alice", unexpected: true } },
    { filter: nestedNot(9) },
    {
      filter: {
        and: Array.from({ length: 17 }, () => ({
          field: "user.username",
          op: "eq",
          value: "alice",
        })),
      },
    },
    { filter: filterWithNodeCount65() },
    { filter: {} },
  ];

  for (const request of invalidRequests) {
    const error = await query.searchBase(request).catch((error) => error);
    expect(error).toMatchObject({
      code: ApiErrorCode.ValidationFailed,
      httpStatus: 422,
      name: "UserProfileFilterValidationError",
    });
  }
});

test("rejects invalid Employment, Role, Privilege and Responsibility filters before reading profiles", async () => {
  const { query } = createValidationQuery();
  const invalidRequests = [
    { filter: { exists: { path: "employments", where: { field: "roles", op: "in", value: ["role-effective"] } } } },
    { filter: { exists: { path: "employments", where: { field: "privileges", op: "eq", value: "profile:read" } } } },
    { filter: { exists: { path: "employments", where: { field: "roles", op: "containsAny", value: [] } } } },
    { filter: { exists: { path: "employments", where: { field: "roles", op: "containsAll", value: [123] } } } },
    { filter: { exists: { path: "employments", where: { field: "isPrimary", op: "containsAny", value: [true] } } } },
    { filter: { exists: { path: "employments", where: { field: "user.username", op: "eq", value: "alice" } } } },
    { filter: { exists: { path: "employments", where: { field: "organization.id", op: "eq", value: 20 } } } },
    {
      filter: {
        exists: {
          path: "employments",
          where: { field: "organization.ancestorCodes", op: "containsAny", value: ["org-root"] },
        },
      },
    },
    {
      filter: {
        exists: {
          path: "employments",
          where: { field: "organization.ancestorDepths", op: "containsAny", value: [1] },
        },
      },
    },
    {
      filter: {
        exists: {
          path: "employments",
          where: { field: "organization.ancestorKeys", op: "containsAny", value: ["org-root#1"] },
        },
      },
    },
    {
      filter: {
        exists: {
          path: "employments",
          where: { field: "organization.companyCodes", op: "containsAny", value: ["org-root"] },
        },
      },
    },
    {
      filter: {
        exists: {
          path: "employments",
          where: { field: "position", op: "withinSubtreeOf", value: "position-effective" },
        },
      },
    },
    { filter: employmentResponsibilities({ field: "id", op: "eq", value: 1 }) },
    { filter: employmentResponsibilities({ field: "targetOrganization.id", op: "eq", value: 31 }) },
    {
      filter: employmentResponsibilities({
        field: "targetOrganization.ancestorCodes",
        op: "containsAny",
        value: ["target-root"],
      }),
    },
  ];
  for (const request of invalidRequests) {
    const error = await query.searchBase(request).catch((error) => error);
    expect(error).toMatchObject({
      code: ApiErrorCode.ValidationFailed,
      httpStatus: 422,
      name: "UserProfileFilterValidationError",
    });
  }
});

function createValidationQuery() {
  const select = mock(() => {
    throw new Error("Invalid filters must fail before reading profiles");
  });
  const query = createUserProfileSearchService({
    profileRepository: createUserProfileSearchRepository({ select } as never),
  });
  return { query, select };
}

function employmentResponsibilities(where: unknown) {
  return {
    exists: {
      path: "employments",
      where: {
        exists: {
          path: "responsibilities",
          where,
        },
      },
    },
  };
}
