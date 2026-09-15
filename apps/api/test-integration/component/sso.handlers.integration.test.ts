import { createRootSsoHandlers, createSsoEndpointsHandler } from "@api/routes/sso/sso.handlers";
import { createUnifiedAuthorizationHandlers } from "@api/routes/sso/unified-authorization.handlers";
import { ClientSnapshotUnavailableError } from "@iam/api-core/client-snapshot";
import { createErrorHandler } from "@iam/api-core/middlewares";
import {
  createSubjectAccessOperations,
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { ApiErrorCode, LoginPageGuardDecision } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

const logger = {
  warn: mock(() => undefined),
};
const errorLogger = {
  error: mock(() => undefined),
  info: mock(() => undefined),
  warn: mock(() => undefined),
};

const loginOA = mock(async () => ({ token: "global-session", isMobileSet: true }));
const loginWX = mock(async () => ({ token: "global-session", isMobileSet: true }));
const logout = mock(async () => true as const);
const checkLoginContinuation = mock(
  async (): Promise<{
    clearGlobalSessionCookie: boolean;
    decision: LoginPageGuardDecision;
  }> => ({
    clearGlobalSessionCookie: false,
    decision: LoginPageGuardDecision.Continue,
  }),
);
function createHandlers() {
  const unexpected = () => {
    throw new Error("Guard adapter must only call protocol continuation inspection");
  };
  return {
    ...createRootSsoHandlers({
      sso: { logout: { execute: logout } },
      authentication: { loginWithOa: { execute: loginOA }, loginWithWechat: { execute: loginWX } },
      config: { loginEndpoint: "/login", projectionRetryAfterSeconds: 3, redisExpireSeconds: 3600 },
    }),
    ...createUnifiedAuthorizationHandlers({
      authorization: { forOperation: () => ({ checkLoginContinuation, authorize: unexpected }) },
      operations: createSubjectAccessOperations({
        barrier: { readCommittedTransitionId: unexpected },
        revocation: { revokePrincipalSession: unexpected, revokeUserSessions: unexpected },
      }),
      loginEndpoint: "/login",
      retryAfterSeconds: 3,
    }),
    endpointsConfiguration: createSsoEndpointsHandler({
      logger,
      config: {
        authorizationEndpoint: "/sso/authorize",
        logoutEndpoint: "/sso/logout",
        thirdPartyOAEndpoint: "/sso/thirdparty/oa",
        ssoExternalOrigin: "https://iam.example.com/",
        ssoInternalOrigin: "https://iam.internal.example.com/",
      },
    }),
  };
}
function createLoginGuardContext(cookie = "principal-session") {
  const responseHeaders: unknown[][] = [];
  const raw = new Request("https://iam.example.test/sso/login-guard", {
    headers: {
      Authorization: "ignored-header-session",
      Cookie: [
        cookie && `global_session=${cookie}`,
        "custom_sso_continuation=browser-binding",
        "local_independent_session=ignored-local-session",
      ]
        .filter(Boolean)
        .join("; "),
    },
  });
  const query = {
    client: "independent",
    redirectUrl: "https://app.example.com/home?from=iam",
    state: "original-state",
    ssoReturn: "continuation-handle",
  };
  return {
    responseHeaders,
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      method: "GET",
      path: "/sso/login-guard",
      raw,
      valid: mock(() => query),
    },
    get: mock((key: string) => (key === "requestId" ? "req-login-guard" : undefined)),
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    json: mock((body: unknown, status: number) => ({ body, status })),
  };
}

function createLogoutContext() {
  const responseHeaders: unknown[][] = [];
  const raw = new Request("https://iam.example.test/sso/logout", {
    headers: { Cookie: "global_session=cookie-session" },
  });
  return {
    responseHeaders,
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      raw,
      valid: mock(() => ({ redirectUrl: "https://app.example.com/signed-out", token: "query-session" })),
    },
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    redirect: mock((url: string) => url),
  };
}

function createOaContext() {
  const responseHeaders: unknown[][] = [];
  const raw = new Request("https://iam.example.test/sso/thirdparty/oa", {
    headers: { Authorization: "previous-session" },
  });
  return {
    responseHeaders,
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      method: "GET",
      path: "/sso/thirdparty/:clientCode",
      raw,
      valid: mock((target: string) =>
        target === "param"
          ? { clientCode: "oa" }
          : {
              client: "independent",
              loginid: "138550",
              redirectUrl: "https://app.example.com/home",
              state: "opaque state !/?:&=%",
              token: "oa-signature",
              ts: "1700000000000",
            },
      ),
    },
    get: mock((key: string) => (key === "requestId" ? "req-oa" : undefined)),
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    redirect: mock((url: string) => url),
  };
}

function createWechatContext() {
  const responseHeaders: unknown[][] = [];
  const raw = new Request("https://iam.example.test/sso/third-party/wx");
  return {
    responseHeaders,
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      method: "GET",
      path: "/sso/third-party/wx",
      raw,
      valid: mock(() => ({
        client: "independent",
        code: "wechat-code",
        redirectUrl: "https://app.example.com/home",
        state: "opaque state !/?:&=%",
      })),
    },
    get: mock((key: string) => (key === "requestId" ? "req-wechat" : undefined)),
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    redirect: mock((url: string) => url),
  };
}

function createContext(entryNetwork?: string) {
  return {
    req: {
      header: mock((name: string) =>
        name.toLowerCase() === "x-iam-entry-network" ? entryNetwork : undefined,
      ),
      raw: new Request("https://untrusted.example.test/sso/.well-known/authentication-configuration"),
      url: "https://untrusted.example.test/sso/.well-known/authentication-configuration",
    },
    json: mock((body: unknown, status = 200) => ({ body, status })),
  };
}

function createHttpHandlerApp(
  path: string,
  handler: (context: never, next: never) => unknown,
  validInput: Record<string, string>,
) {
  const app = new Hono();
  app.get(path, async (context) => {
    (
      context.req as unknown as {
        valid: () => Record<string, string>;
      }
    ).valid = () => validInput;
    return (await handler(context as never, undefined as never)) as Response;
  });
  app.onError(createErrorHandler(errorLogger as never));
  return app;
}

function createOaHandlerApp(handler: (context: never, next: never) => unknown) {
  const app = new Hono();
  app.get("/sso/thirdparty/oa/:clientCode", async (context) => {
    (
      context.req as unknown as {
        valid: (target: string) => Record<string, string>;
      }
    ).valid = (target): Record<string, string> => {
      if (target === "param") {
        return { clientCode: "oa" };
      }
      return {
        client: "independent",
        loginid: "138550",
        redirectUrl: "https://app.example.com/home",
        token: "oa-signature",
        ts: "1700000000000",
      };
    };
    return (await handler(context as never, undefined as never)) as Response;
  });
  app.onError(createErrorHandler(errorLogger as never));
  return app;
}

beforeEach(() => {
  errorLogger.error.mockClear();
  errorLogger.info.mockClear();
  errorLogger.warn.mockClear();
  logger.warn.mockClear();
  loginOA.mockClear();
  loginWX.mockClear();
  logout.mockClear();
  checkLoginContinuation.mockClear();
});
describe("root SSO HTTP adaptation", () => {
  test("login guard continues a valid Custom SSO request without exposing session data", async () => {
    const handlers = createHandlers();
    const context = createLoginGuardContext();

    const response = (await handlers.loginGuard(context as never, async () => {})) as unknown;

    expect(checkLoginContinuation).toHaveBeenCalledWith({
      clientCode: "independent",
      globalSessionToken: "principal-session",
      redirectUrl: "https://app.example.com/home?from=iam",
      state: "original-state",
      continuation: "continuation-handle",
      browserBinding: "browser-binding",
    });
    expect(response).toEqual({
      body: {
        code: 200,
        data: { decision: LoginPageGuardDecision.Continue },
        message: "success",
      },
      status: 200,
    });
    expect(context.responseHeaders).toEqual([]);
  });

  test("login guard shows login without clearing cookies when no root cookie exists", async () => {
    checkLoginContinuation.mockResolvedValueOnce({
      clearGlobalSessionCookie: false,
      decision: LoginPageGuardDecision.Login,
    });
    const context = createLoginGuardContext("");
    const response: unknown = await createHandlers().loginGuard(context as never, async () => {});
    expect(response).toEqual({
      body: { code: 200, data: { decision: LoginPageGuardDecision.Login }, message: "success" },
      status: 200,
    });
    expect(checkLoginContinuation).toHaveBeenCalledWith({
      clientCode: "independent",
      redirectUrl: "https://app.example.com/home?from=iam",
      state: "original-state",
      continuation: "continuation-handle",
      browserBinding: "browser-binding",
      globalSessionToken: undefined,
    });
    expect(context.responseHeaders).toEqual([]);
  });

  test("login guard clears an explicitly invalid UserSession before showing login", async () => {
    checkLoginContinuation.mockResolvedValueOnce({
      clearGlobalSessionCookie: true,
      decision: LoginPageGuardDecision.Login,
    });
    const handlers = createHandlers();
    const context = createLoginGuardContext("stale-session");

    const response = await handlers.loginGuard(context as never, async () => {});

    expect(response).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          data: { decision: LoginPageGuardDecision.Login },
        }),
        status: 200,
      }),
    );
    expect(context.responseHeaders).toEqual([
      [
        "Set-Cookie",
        expect.stringMatching(
          /global_session=;.*Max-Age=0;.*Path=\/.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/iu,
        ),
        { append: true },
      ],
    ]);
  });

  test("login guard maps an uncertain Principal Session to Subject Access unavailable without clearing it", async () => {
    checkLoginContinuation.mockRejectedValueOnce(new SubjectAccessUnavailableError());
    const handlers = createHandlers();
    const app = createHttpHandlerApp("/sso/login-guard", handlers.loginGuard, {
      client: "independent",
      redirectUrl: "https://app.example.com/home?from=iam",
    });

    const response = await app.request("/sso/login-guard", {
      headers: { Cookie: "global_session=principal-session" },
    });

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      code: ApiErrorCode.SubjectAccessUnavailable,
    });
  });

  test("logout prefers the global-session cookie, deletes it, and preserves the requested redirect", async () => {
    const handlers = createHandlers();
    const context = createLogoutContext();

    await handlers.logout(context as never, async () => {});

    expect(logout).toHaveBeenCalledWith({ sessionToken: "cookie-session", allowApplicationToken: false });
    expect(context.responseHeaders).toContainEqual([
      "Set-Cookie",
      expect.stringMatching(/global_session=;.*Max-Age=0;.*Path=\/.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/iu),
      { append: true },
    ]);
    expect(context.redirect).toHaveBeenCalledWith("https://app.example.com/signed-out");
  });

  test("logout maps invalid and unavailable Subject Access before clearing a successful cookie", async () => {
    const handlers = createHandlers();
    const app = createHttpHandlerApp("/sso/logout", handlers.logout, {
      redirectUrl: "https://app.example.com/signed-out",
      token: "query-session",
    });

    logout.mockRejectedValueOnce(new SubjectAccessSessionInvalidHttpError());
    const disabled = await app.request("/sso/logout", {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(disabled.status).toBe(401);
    expect(disabled.headers.getSetCookie()).toHaveLength(1);
    expect(disabled.headers.getSetCookie()[0]).toContain("global_session=");

    logout.mockRejectedValueOnce(new SubjectAccessUnavailableError());
    const unavailable = await app.request("/sso/logout", {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.getSetCookie()).toEqual([]);

    logout.mockRejectedValueOnce(new ClientSnapshotUnavailableError());
    const clientRuntimeUnavailable = await app.request("/sso/logout", {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(clientRuntimeUnavailable.status).toBe(503);
    expect(clientRuntimeUnavailable.headers.get("Retry-After")).toBe("3");
    expect(clientRuntimeUnavailable.headers.getSetCookie()).toEqual([]);
    const unavailableBody = await clientRuntimeUnavailable.json();
    expect(unavailableBody).toMatchObject({
      code: ApiErrorCode.InternalError,
    });
  });

  test("OA login replaces the previous session and redirects through authorize", async () => {
    const handlers = createHandlers();
    const context = createOaContext();
    loginOA.mockResolvedValueOnce({ token: "oa-session", isMobileSet: true });

    await handlers.loginOA(context as never, async () => {});

    expect(logout).toHaveBeenCalledWith({ sessionToken: "previous-session" });
    expect(loginOA).toHaveBeenCalledWith(
      {
        clientCode: "oa",
        loginId: "138550",
        timestamp: "1700000000000",
        token: "oa-signature",
      },
      {
        requestContext: expect.objectContaining({
          requestId: "req-oa",
          route: "/sso/thirdparty/:clientCode",
        }),
      },
    );
    expect(context.responseHeaders).toContainEqual([
      "Set-Cookie",
      expect.stringContaining("global_session=oa-session"),
      { append: true },
    ]);
    expect(context.redirect).toHaveBeenCalledWith(
      "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome&token=oa-session&state=opaque+state+%21%2F%3F%3A%26%3D%25",
    );
  });

  test("OA login stops when replacing the old session hits invalid or unavailable Subject Access", async () => {
    const handlers = createHandlers();
    const app = createOaHandlerApp(handlers.loginOA);

    logout.mockRejectedValueOnce(new SubjectAccessSessionInvalidHttpError());
    const disabled = await app.request("/sso/thirdparty/oa/oa", {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(disabled.status).toBe(401);
    expect(disabled.headers.getSetCookie()).toHaveLength(1);
    expect(loginOA).not.toHaveBeenCalled();

    logout.mockRejectedValueOnce(new SubjectAccessUnavailableError());
    const unavailable = await app.request("/sso/thirdparty/oa/oa", {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.getSetCookie()).toEqual([]);
    expect(loginOA).not.toHaveBeenCalled();
  });

  test("WeChat login writes the global session and redirects through authorize", async () => {
    const handlers = createHandlers();
    const context = createWechatContext();
    loginWX.mockResolvedValueOnce({ token: "wechat-session", isMobileSet: true });

    await handlers.loginWX(context as never, async () => {});

    expect(loginWX).toHaveBeenCalledWith(
      { code: "wechat-code" },
      { requestContext: expect.objectContaining({ requestId: "req-wechat", route: "/sso/third-party/wx" }) },
    );
    expect(context.responseHeaders).toContainEqual([
      "Set-Cookie",
      expect.stringContaining("global_session=wechat-session"),
      { append: true },
    ]);
    expect(context.redirect).toHaveBeenCalledWith(
      "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome&token=wechat-session&state=opaque+state+%21%2F%3F%3A%26%3D%25",
    );
  });
});

describe("createSsoHandlers endpointsConfiguration", () => {
  test("returns external endpoints for external entry network", async () => {
    const handlers = createHandlers();
    const context = createContext("external");

    const result = await handlers.endpointsConfiguration(context as never, async () => {});
    expect(result).toMatchObject({
      status: 200,
      body: {
        data: {
          authorizationEndpoint: "https://iam.example.com/sso/authorize",
          logoutEndpoint: "https://iam.example.com/sso/logout",
          thirdPartyOAEndpoint: "https://iam.example.com/sso/thirdparty/oa",
        },
      },
    });

    expect(context.json.mock.calls[0]?.[0]).not.toHaveProperty("entryNetwork");
    expect(context.json.mock.calls[0]?.[0]).not.toHaveProperty("data.entryNetwork");
  });

  test("returns internal endpoints for internal entry network", async () => {
    const handlers = createHandlers();
    const context = createContext("internal");

    const result = await handlers.endpointsConfiguration(context as never, async () => {});
    expect(result).toMatchObject({
      status: 200,
      body: {
        data: {
          authorizationEndpoint: "https://iam.internal.example.com/sso/authorize",
          logoutEndpoint: "https://iam.internal.example.com/sso/logout",
          thirdPartyOAEndpoint: "https://iam.internal.example.com/sso/thirdparty/oa",
        },
      },
    });
  });

  test("rejects missing entry network", async () => {
    const handlers = createHandlers();
    const context = createContext();

    const result = await handlers.endpointsConfiguration(context as never, async () => {});
    expect(result).toMatchObject({
      status: 400,
      body: {
        code: ApiErrorCode.BadRequest,
        message: "非法 SSO 入口",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({ entryNetwork: undefined }, "invalid sso entry network header");
  });

  test("rejects invalid entry network", async () => {
    const handlers = createHandlers();
    const context = createContext("private");

    const result = await handlers.endpointsConfiguration(context as never, async () => {});
    expect(result).toMatchObject({
      status: 400,
      body: {
        code: ApiErrorCode.BadRequest,
        message: "非法 SSO 入口",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({ entryNetwork: "private" }, "invalid sso entry network header");
  });
});
