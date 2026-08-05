import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUsersSearchDslRoute } from "@api/routes/internal/user/user.routes";
import { describe, expect, mock, test } from "bun:test";

function createHandlers() {
  const deps = {
    registerPurveyorContact: {
      execute: mock(async () => true),
    },
    userProfileQuery: {
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

  test("delegates internal DSL search to profile query service", async () => {
    const { deps, handlers } = createHandlers();
    const input = {
      filter: { field: "user.username", op: "eq", value: "zhangsan" },
      limit: 10,
    };
    const context = {
      req: { valid: mock(() => input) },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.usersSearchDsl(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: [],
    });

    expect(deps.userProfileQuery.searchDsl).toHaveBeenCalledWith(input.filter, { limit: 10 });
  });
});

describe("createUsersSearchDslRoute", () => {
  test("bounds request limit with configured DSL max", () => {
    const route = createUsersSearchDslRoute(2);
    const schema = route.request.body.content["application/json"].schema;

    expect(schema.safeParse({
      filter: { field: "user.username", op: "eq", value: "zhangsan" },
      limit: 3,
    }).success).toBe(false);
  });
});
