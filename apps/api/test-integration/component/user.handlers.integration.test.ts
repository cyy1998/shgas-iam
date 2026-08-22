import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { usersSearchDsl } from "@api/routes/internal/user/user.routes";
import { OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

function createHandlers() {
  const deps = {
    registerPurveyorContact: {
      execute: mock(async () => true),
    },
    userProfileQuery: {
      searchDsl: mock(async () => []),
    },
    internalUserProfileQuery: {
      getDetailByUsername: mock(async () => ({})),
      searchDsl: mock(async () => []),
    },
    userService: {
      getUserDetailByUsername: mock(async () => ({})),
      searchUsers: mock(async () => [{ username: "zhangsan" }]),
      searchUsersWithPrivilegeDelegation: mock(async () => ({ users: [], delegations: [] })),
    },
  };

  return {
    deps,
    handlers: createUserHandlers(deps as never),
  };
}

describe("createUserHandlers", () => {
  test("delegates supplier contact registration to the application use-case", async () => {
    const { deps, handlers } = createHandlers();
    const input = { username: "newuser", mobile: "13900000000", name: "新用户", orgCode: "SUP" };
    const context = {
      get: mock(() => undefined),
      req: {
        valid: mock(() => input),
        header: mock((name: string) => name === "Client" ? "portal" : undefined),
        method: "POST",
        path: "/internal/users/purveyor/contacts",
      },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.contactRegister(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: true,
    });

    expect(deps.registerPurveyorContact.execute).toHaveBeenCalledWith(input, {
      actor: {
        actorClientCode: "portal",
        actorSystemKey: null,
        actorType: "client",
        actorUserId: null,
        actorUsername: null,
      },
      requestContext: expect.objectContaining({
        method: "POST",
        route: "/internal/users/purveyor/contacts",
        sourceApp: "iam",
      }),
    });
  });

  test("delegates legacy search through user service facade", async () => {
    const { deps, handlers } = createHandlers();
    const query = { usernames: ["zhangsan"] };
    const context = {
      req: { valid: mock(() => query) },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.usersSearch(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: [{ username: "zhangsan" }],
    });

    expect(deps.userService.searchUsers).toHaveBeenCalledWith(query);
  });

  test("delegates strict V2 responsibility DSL search to the active profile query service", async () => {
    const { deps, handlers } = createHandlers();
    const input = {
      filter: {
        nested: "employments",
        where: {
          nested: "responsibilities",
          where: {
            field: "responsibility.type.code",
            op: "eq",
            value: OrganizationResponsibilityTypeCode.Head,
          },
        },
      },
    };
    const context = {
      req: { valid: mock(() => input) },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.usersSearchDsl(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: [],
    });

    expect(deps.internalUserProfileQuery.searchDsl).toHaveBeenCalledWith(input);
    expect(deps.userProfileQuery.searchDsl).not.toHaveBeenCalled();
  });

  test("applies the fixed handler deadline to Internal Detail", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((callback: () => void) => {
      callback();
      return 1;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
    try {
      const { deps } = createHandlers();
      deps.internalUserProfileQuery.getDetailByUsername
        = mock(async () => await new Promise<never>(() => {}));
      const handlers = createUserHandlers(deps as never);
      const context = {
        req: { valid: mock(() => ({ username: "user-1" })) },
        json: mock(() => {
          throw new Error("not reached");
        }),
      };

      const error = await Promise.resolve(handlers.userInfo(
        context as never,
        undefined as never,
      )).catch((error: unknown) => error);

      expect(error).toMatchObject({
        code: "USER_SEARCH_UNAVAILABLE",
        httpStatus: 503,
      });
    }
    finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});

describe("active usersSearchDsl route", () => {
  test("rejects V1 filters and caller-controlled limits", () => {
    const schema = usersSearchDsl.request.body.content["application/json"].schema;

    expect(schema.safeParse({
      filter: { field: "user.username", op: "eq", value: "zhangsan" },
    }).success).toBe(false);
    expect(schema.safeParse({
      filter: {
        nested: "employments",
        where: {
          nested: "responsibilities",
          where: {
            field: "responsibility.type.code",
            op: "eq",
            value: OrganizationResponsibilityTypeCode.Head,
          },
        },
      },
      limit: 1,
    }).success).toBe(false);
    expect(schema.safeParse({ filter: {}, version: 2 }).success).toBe(false);
  });
});
