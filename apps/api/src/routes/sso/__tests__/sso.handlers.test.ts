import { ApiErrorCode, ClientManagementLevel } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createSsoHandlers } from "../sso.handlers";

const logger = {
  warn: mock(() => undefined),
};

const authorize = mock(async (): Promise<
  | { isLogin: false; code: null }
  | { isLogin: true; code: string }
> => ({ isLogin: false, code: null }));
const callback = mock(async (): Promise<{ token: string; orcasSessionId: string | null }> => ({
  token: "local-session",
  orcasSessionId: null,
}));
const loginOA = mock(async () => ({ token: "global-session", isMobileSet: true }));
const loginWX = mock(async () => ({ token: "global-session", isMobileSet: true }));
const logout = mock(async () => true);
const setToken = mock(async () => ({ sid: "local-session", ttl: 3600, userInfo: {} }));
const getClientByCode = mock(async () => ({
  extAttributes: {
    callbackEndpoint: "https://app.example.com/sso/callback",
    managementLevel: ClientManagementLevel.Independent,
  },
}));

function createHandlers() {
  return createSsoHandlers({
    clientService: {
      getClientByCode,
    },
    logger,
    sso: {
      authorize: { execute: authorize },
      completeCallback: { execute: callback },
      exchangeCode: { execute: setToken },
      loginWithOa: { execute: loginOA },
      loginWithWechat: { execute: loginWX },
      logout: { execute: logout },
    },
    config: {
      authCodeExpireSeconds: 60,
      authorizationEndpoint: "/sso/authorize",
      loginEndpoint: "/login",
      logoutEndpoint: "/sso/logout",
      redisExpireSeconds: 3600,
      ssoExternalOrigin: "https://iam.example.com/",
      ssoInternalOrigin: "https://iam.internal.example.com/",
      thirdPartyOAEndpoint: "/sso/thirdparty/oa",
    },
  } as any);
}

function createAuthorizeContext(options: {
  authorization?: string;
  cookie?: string;
  queryToken?: string;
} = {}) {
  const {
    authorization = "header-session",
    cookie = "cookie-session",
    queryToken = "query-session",
  } = options;
  const query = {
    client: "independent",
    redirectUrl: "https://app.example.com/home?from=iam",
    token: queryToken,
  };
  const headers = new Headers();
  if (authorization)
    headers.set("Authorization", authorization);
  if (cookie)
    headers.set("Cookie", `global_session=${cookie}`);
  const raw = new Request("https://iam.example.test/sso/authorize", {
    headers,
  });
  return {
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      method: "GET",
      path: "/sso/authorize",
      query: mock(() => query),
      raw,
      valid: mock(() => query),
    },
    get: mock((key: string) => key === "requestId" ? "req-sso" : undefined),
    redirect: mock((url: string) => url),
  };
}

function createCallbackContext() {
  const responseHeaders: unknown[][] = [];
  const raw = new Request("https://iam.example.test/sso/callback");
  return {
    responseHeaders,
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      method: "GET",
      path: "/sso/callback",
      raw,
      valid: mock(() => ({
        client: "gateway",
        code: "auth-code",
        redirectUrl: "https://gateway.example.com/home?from=iam",
      })),
    },
    get: mock((key: string) => key === "requestId" ? "req-callback" : undefined),
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    redirect: mock((url: string) => url),
  };
}

function createTokenContext() {
  const raw = new Request("https://iam.example.test/sso/token");
  return {
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      method: "GET",
      path: "/sso/token",
      raw,
      valid: mock(() => ({ client: "independent", clientSecret: "secret", code: "auth-code" })),
    },
    get: mock((key: string) => key === "requestId" ? "req-token" : undefined),
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
      valid: mock((target: string) => target === "param"
        ? { clientCode: "oa" }
        : {
            client: "independent",
            loginid: "138550",
            redirectUrl: "https://app.example.com/home",
            token: "oa-signature",
            ts: "1700000000000",
          }),
    },
    get: mock((key: string) => key === "requestId" ? "req-oa" : undefined),
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
      })),
    },
    get: mock((key: string) => key === "requestId" ? "req-wechat" : undefined),
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    redirect: mock((url: string) => url),
  };
}

function createContext(entryNetwork?: string) {
  return {
    req: {
      header: mock((name: string) => name.toLowerCase() === "x-iam-entry-network" ? entryNetwork : undefined),
      raw: new Request("https://untrusted.example.test/sso/.well-known/authentication-configuration"),
      url: "https://untrusted.example.test/sso/.well-known/authentication-configuration",
    },
    json: mock((body: unknown, status = 200) => ({ body, status })),
  };
}

beforeEach(() => {
  logger.warn.mockClear();
  authorize.mockClear();
  callback.mockClear();
  loginOA.mockClear();
  loginWX.mockClear();
  logout.mockClear();
  setToken.mockClear();
  getClientByCode.mockClear();
});

describe("createSsoHandlers protocol adaptation", () => {
  test("authorize prefers the global-session cookie and preserves the login redirect query", async () => {
    const handlers = createHandlers();
    const context = createAuthorizeContext();

    await handlers.authorize(context as never, async () => {});

    expect(authorize).toHaveBeenCalledWith(
      {
        clientCode: "independent",
        globalSessionToken: "cookie-session",
        redirectUrl: "https://app.example.com/home?from=iam",
        tokenSource: "cookie",
      },
      { requestContext: expect.objectContaining({ requestId: "req-sso", route: "/sso/authorize" }) },
    );
    expect(context.redirect).toHaveBeenCalledWith(
      "/login?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome%3Ffrom%3Diam&token=query-session",
    );
  });

  test("authorize prefers the Authorization header when the global-session cookie is absent", async () => {
    const handlers = createHandlers();
    const context = createAuthorizeContext({ cookie: "" });

    await handlers.authorize(context as never, async () => {});

    expect(authorize).toHaveBeenCalledWith(
      {
        clientCode: "independent",
        globalSessionToken: "header-session",
        redirectUrl: "https://app.example.com/home?from=iam",
        tokenSource: "authorization_header",
      },
      expect.any(Object),
    );
  });

  test("authorize uses the query token when cookie and Authorization header are absent", async () => {
    const handlers = createHandlers();
    const context = createAuthorizeContext({ authorization: "", cookie: "" });

    await handlers.authorize(context as never, async () => {});

    expect(authorize).toHaveBeenCalledWith(
      {
        clientCode: "independent",
        globalSessionToken: "query-session",
        redirectUrl: "https://app.example.com/home?from=iam",
        tokenSource: "query",
      },
      expect.any(Object),
    );
  });

  test("authorize redirects a logged-in Independent client to its configured callback", async () => {
    const handlers = createHandlers();
    const context = createAuthorizeContext();
    authorize.mockResolvedValueOnce({ isLogin: true, code: "auth-code" });

    await handlers.authorize(context as never, async () => {});

    expect(context.redirect).toHaveBeenCalledWith(
      "https://app.example.com/sso/callback?code=auth-code&client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome%3Ffrom%3Diam",
    );
  });

  test("callback writes local and ORCAS cookies before redirecting with both tokens", async () => {
    const handlers = createHandlers();
    const context = createCallbackContext();
    callback.mockResolvedValueOnce({ token: "local-token", orcasSessionId: "orcas-token" });

    await handlers.callback(context as never, async () => {});

    expect(callback).toHaveBeenCalledWith(
      {
        clientCode: "gateway",
        code: "auth-code",
        redirectUrl: "https://gateway.example.com/home?from=iam",
      },
      { requestContext: expect.objectContaining({ requestId: "req-callback", route: "/sso/callback" }) },
    );
    expect(context.responseHeaders).toEqual(expect.arrayContaining([
      expect.arrayContaining(["Set-Cookie", expect.stringContaining("local_gateway_session=local-token")]),
      expect.arrayContaining(["Set-Cookie", expect.stringContaining("orcas_sso_sessionid=orcas-token")]),
    ]));
    expect(context.redirect).toHaveBeenCalledWith(
      "https://gateway.example.com/home?from=iam&token=local-token&orcasToken=orcas-token",
    );
  });

  test("callback failure does not write cookies or redirect", async () => {
    const handlers = createHandlers();
    const context = createCallbackContext();
    callback.mockRejectedValueOnce(new Error("ORCAS unavailable"));

    await expect(handlers.callback(context as never, async () => {})).rejects.toThrow("ORCAS unavailable");

    expect(context.responseHeaders).toHaveLength(0);
    expect(context.redirect).not.toHaveBeenCalled();
  });

  test("token returns the existing Independent Client Credential envelope", async () => {
    const handlers = createHandlers();
    const context = createTokenContext();
    setToken.mockResolvedValueOnce({ sid: "independent-token", ttl: 7200, userInfo: { id: 1001 } });

    await expect(handlers.token(context as never, async () => {})).resolves.toMatchObject({
      status: 200,
      body: {
        data: { sid: "independent-token", ttl: 7200, userInfo: { id: 1001 } },
      },
    });
    expect(setToken).toHaveBeenCalledWith({
      clientCode: "independent",
      clientSecret: "secret",
      code: "auth-code",
    }, { requestContext: expect.objectContaining({ requestId: "req-token", route: "/sso/token" }) });
  });

  test("logout prefers the global-session cookie, deletes it, and preserves the requested redirect", async () => {
    const handlers = createHandlers();
    const context = createLogoutContext();

    await handlers.logout(context as never, async () => {});

    expect(logout).toHaveBeenCalledWith({ sessionToken: "cookie-session" });
    expect(context.responseHeaders).toContainEqual([
      "Set-Cookie",
      expect.stringContaining("global_session=;"),
      { append: true },
    ]);
    expect(context.redirect).toHaveBeenCalledWith("https://app.example.com/signed-out");
  });

  test("OA login replaces the previous session and redirects through authorize", async () => {
    const handlers = createHandlers();
    const context = createOaContext();
    loginOA.mockResolvedValueOnce({ token: "oa-session", isMobileSet: true });

    await handlers.loginOA(context as never, async () => {});

    expect(logout).toHaveBeenCalledWith({ sessionToken: "previous-session" });
    expect(loginOA).toHaveBeenCalledWith({
      clientCode: "oa",
      loginId: "138550",
      timestamp: "1700000000000",
      token: "oa-signature",
    }, { requestContext: expect.objectContaining({ requestId: "req-oa", route: "/sso/thirdparty/:clientCode" }) });
    expect(context.responseHeaders).toContainEqual([
      "Set-Cookie",
      expect.stringContaining("global_session=oa-session"),
      { append: true },
    ]);
    expect(context.redirect).toHaveBeenCalledWith(
      "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome&token=oa-session",
    );
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
      "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome&token=wechat-session",
    );
  });
});

describe("createSsoHandlers endpointsConfiguration", () => {
  test("returns external endpoints for external entry network", async () => {
    const handlers = createHandlers();
    const context = createContext("external");

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
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

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
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

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
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

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
      status: 400,
      body: {
        code: ApiErrorCode.BadRequest,
        message: "非法 SSO 入口",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({ entryNetwork: "private" }, "invalid sso entry network header");
  });
});
