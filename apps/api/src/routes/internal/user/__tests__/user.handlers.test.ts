import { describe, expect, mock, test } from "bun:test";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { usersSearchDsl } from "@api/routes/internal/user/user.routes";
import { OrganizationResponsibilityTypeCode } from "@iam/contracts";

function createHandlers() {
  const deps = {
    registerPurveyorContact: {
      execute: mock(async () => true),
    },
    userDocumentQuery: {
      searchDsl: mock(async () => []),
    },
    internalUserDocumentQuery: {
      getDetailByUsername: mock(async () => ({})),
      searchDsl: mock(async () => []),
    },
    userDocumentSearch: {
      searchDsl: mock(async () => []),
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
      get: mock((name: string) => (name === "clientCode" ? "portal" : undefined)),
      req: {
        valid: mock(() => input),
        header: mock((name: string) => (name === "Client" ? "forged-client" : undefined)),
        method: "POST",
        path: "/internal/users/purveyor/contacts",
      },
      json: mock((payload: unknown) => payload),
    };

    const response = await handlers.contactRegister(context as never, undefined as never);
    expect(response).toMatchObject({
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

  test("passes the authenticated Client to complete document search", async () => {
    const { deps, handlers } = createHandlers();
    const input = {
      filter: {
        exists: {
          path: "employments",
          where: {
            exists: {
              path: "responsibilities",
              where: {
                field: "type.code",
                op: "eq",
                value: OrganizationResponsibilityTypeCode.Head,
              },
            },
          },
        },
      },
    };
    const context = {
      get: mock((name: string) => (name === "clientDto" ? { clientCode: "internal" } : undefined)),
      req: { valid: mock(() => input) },
      json: mock((payload: unknown) => payload),
    };

    const response = await handlers.usersSearchDsl(context as never, undefined as never);
    expect(response).toMatchObject({
      code: 200,
      data: [],
    });

    expect(deps.userDocumentSearch.searchDsl).toHaveBeenCalledWith(input, "internal");
    expect(deps.internalUserDocumentQuery.searchDsl).not.toHaveBeenCalled();
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
      deps.internalUserDocumentQuery.getDetailByUsername = mock(async () => await new Promise<never>(() => {}));
      const handlers = createUserHandlers(deps as never);
      const context = {
        get: mock((name: string) => (name === "clientDto" ? { clientCode: "internal" } : undefined)),
        req: { valid: mock(() => ({ username: "user-1" })) },
        json: mock(() => {
          throw new Error("not reached");
        }),
      };

      const error = await Promise.resolve(handlers.userInfo(context as never, undefined as never)).catch(
        (error: unknown) => error,
      );

      expect(error).toMatchObject({
        code: "USER_SEARCH_UNAVAILABLE",
        httpStatus: 503,
      });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});

describe("active usersSearchDsl route", () => {
  test("accepts canonical conditions and rejects old aliases or caller-controlled execution", () => {
    const schema = usersSearchDsl.request.body.content["application/json"].schema;

    expect(
      schema.safeParse({
        filter: { field: "username", op: "eq", value: "zhangsan" },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
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
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ filter: {}, version: 2 }).success).toBe(false);
  });
});
