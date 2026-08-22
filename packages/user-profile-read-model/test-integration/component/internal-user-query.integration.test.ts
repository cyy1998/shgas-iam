import { ApiErrorCode } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import {
  createInternalUserProfileQueryService,
} from "../../src/internal-user-query.service";

test("rejects invalid strict V2 DSL before accessing the profile repository", async () => {
  const searchCurrentVisibleProfiles = mock(async () => []);
  const service = createInternalUserProfileQueryService({
    profileRepository: {
      getCurrentByUsername: mock(async () => null),
      searchCurrentVisibleProfiles,
    },
  });

  await expect(service.searchDsl({
    filter: {
      nested: "responsibilities",
      where: {
        field: "responsibility.type.name",
        op: "containsAny",
        value: [],
      },
    },
  })).rejects.toBeInstanceOf(Error);

  expect(searchCurrentVisibleProfiles).not.toHaveBeenCalled();
});

test("rejects the whole V2 result when the fixed 500 user limit is exceeded", async () => {
  const searchCurrentVisibleProfiles = mock(async () =>
    Array.from({ length: 501 }, () => ({ detail: null })));
  const service = createInternalUserProfileQueryService({
    profileRepository: {
      getCurrentByUsername: mock(async () => null),
      searchCurrentVisibleProfiles,
    },
  });

  await expect(service.searchDsl({
    filter: {
      nested: "employments",
      where: {
        nested: "responsibilities",
        where: {
          field: "responsibility.type.code",
          op: "eq",
          value: "head",
        },
      },
    },
  })).rejects.toMatchObject({
    code: ApiErrorCode.UserSearchResultTooLarge,
    httpStatus: 422,
  });

  expect(searchCurrentVisibleProfiles).toHaveBeenCalledTimes(1);
});

test("maps database failures to a sanitized stable unavailable error", async () => {
  const searchCurrentVisibleProfiles = mock(async () => {
    throw new Error("database failed for SECRET-ORG-CODE");
  });
  const service = createInternalUserProfileQueryService({
    profileRepository: {
      getCurrentByUsername: mock(async () => null),
      searchCurrentVisibleProfiles,
    },
  });

  let failure: unknown;
  try {
    await service.searchDsl({
      filter: {
        nested: "employments",
        where: {
          nested: "responsibilities",
          where: {
            field: "responsibility.targetOrganization.code",
            op: "eq",
            value: "SECRET-ORG-CODE",
          },
        },
      },
    });
  }
  catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({
    code: ApiErrorCode.UserSearchUnavailable,
    httpStatus: 503,
  });
  expect(failure).not.toHaveProperty("cause");
  expect(String(failure)).not.toContain("SECRET-ORG-CODE");
});

test("maps identity database failures to the same sanitized unavailable error", async () => {
  const profileRepository = {
    getCurrentByUsername: mock(async () => {
      throw new Error("postgresql://user:secret@database/internal-detail");
    }),
    searchCurrentVisibleProfiles: mock(async () => []),
  };
  const service = createInternalUserProfileQueryService({ profileRepository });

  const error = await service.getDetailByUsername("user-1").catch(error => error);

  expect(error).toMatchObject({
    code: ApiErrorCode.UserSearchUnavailable,
    httpStatus: 503,
    message: "用户搜索暂时不可用",
  });
  expect(error).not.toHaveProperty("cause");
  expect(JSON.stringify(error)).not.toContain("secret");
});

test("fails closed on a bad V2 Detail without carrying the persisted DTO", async () => {
  const service = createInternalUserProfileQueryService({
    profileRepository: {
      getCurrentByUsername: mock(async () => null),
      searchCurrentVisibleProfiles: mock(async () => [{
        detail: { leakedValue: "SECRET-PERSISTED-DTO" },
      }]),
    },
  });

  let failure: unknown;
  try {
    await service.searchDsl({
      filter: {
        nested: "employments",
        where: {
          nested: "responsibilities",
          where: {
            field: "responsibility.type.code",
            op: "eq",
            value: "head",
          },
        },
      },
    });
  }
  catch (error) {
    failure = error;
  }

  expect(failure).toMatchObject({
    name: "InternalUserProfileDetailIntegrityError",
  });
  expect(failure).not.toHaveProperty("cause");
  expect(failure).not.toHaveProperty("code");
  expect(String(failure)).not.toContain("SECRET-PERSISTED-DTO");
});
