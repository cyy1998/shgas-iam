import { describe, expect, mock, test } from "bun:test";
import { createUserHandlers } from "../user.handlers";
import { createUsersSearchDslRoute } from "../user.routes";

function createHandlers() {
  const deps = {
    auditLogWriter: {
      recordAuditLogFromContext: mock(async () => undefined),
    },
    config: {
      nodeEnv: "test",
    },
    mobileService: {
      getPurveyorWelcomeMessage: mock(() => ""),
      sendMessage: mock(async () => undefined),
    },
    userProfileQuery: {
      searchDsl: mock(async () => []),
    },
    userService: {
      getUserDetailByUsername: mock(async () => ({})),
      searchUsers: mock(async () => [{ username: "zhangsan" }]),
      searchUsersWithPrivilegeDelegation: mock(async () => ({ users: [], delegations: [] })),
    },
    uow: {
      transaction: mock(async () => {
        throw new Error("uow should not be called");
      }),
    },
  };

  return {
    deps,
    handlers: createUserHandlers(deps as never),
  };
}

describe("createUserHandlers", () => {
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
