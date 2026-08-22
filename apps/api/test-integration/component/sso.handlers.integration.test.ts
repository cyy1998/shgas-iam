import { createSsoHandlers } from "@api/routes/sso/sso.handlers";
import {
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import { PrincipalSessionInspectionUnavailableError } from "@api/services/session/principal-session-inspection.error";
import { createAuthorizeSsoUseCase } from "@api/use-cases/sso/authorize-sso/authorize-sso.use-case";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { createErrorHandler } from "@iam/api-core/middlewares";
import {
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import {
  CustomSsoSubjectProjectionInvariantError,
} from "@iam/client-subject-projection/custom-sso";
import {
  ApiErrorCode,
  CustomSsoClientMode,
  LoginPageGuardDecision,
} from "@iam/contracts";
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

const authorize = mock(async (): Promise<
  | { isLogin: false; code: null }
  | {
    isLogin: true;
    code: string;
    callbackEndpoint?: string;
    clientCode: string;
    mode: CustomSsoClientMode;
    redirectUrl: string;
    state?: string;
  }
> => ({ isLogin: false, code: null }));
const callback = mock(async (): Promise<{
  token: string;
  orcasSessionId: string | null;
  state?: string;
}> => ({
  token: "local-session",
  orcasSessionId: null,
}));
const loginOA = mock(async () => ({ token: "global-session", isMobileSet: true }));
const loginWX = mock(async () => ({ token: "global-session", isMobileSet: true }));
const logout = mock(async () => true as const);
const checkLoginContinuation = mock(async (): Promise<{
  clearGlobalSessionCookie: boolean;
  decision: LoginPageGuardDecision;
}> => ({
  clearGlobalSessionCookie: false,
  decision: LoginPageGuardDecision.Continue,
}));
const setToken = mock(async () => ({
  sid: "local-session",
  ttl: 3600,
  subject: {
    version: 2 as const,
    subjectIdentifier: "00000000-0000-4000-8000-000000001001",
  },
}));
function createHandlers(
  authorizeUseCase: Parameters<typeof createSsoHandlers>[0]["sso"]["authorize"] = { execute: authorize },
) {
  return createSsoHandlers({
    logger,
    sso: {
      authorize: authorizeUseCase,
      completeCallback: { execute: callback },
      exchangeCode: { execute: setToken },
      checkLoginContinuation: { execute: checkLoginContinuation },
      loginWithOa: { execute: loginOA },
      loginWithWechat: { execute: loginWX },
      logout: { execute: logout },
    },
    config: {
      authCodeExpireSeconds: 60,
      authorizationEndpoint: "/sso/authorize",
      loginEndpoint: "/login",
      logoutEndpoint: "/sso/logout",
      projectionRetryAfterSeconds: 3,
      redisExpireSeconds: 3600,
      ssoExternalOrigin: "https://iam.example.com/",
      ssoInternalOrigin: "https://iam.internal.example.com/",
      thirdPartyOAEndpoint: "/sso/thirdparty/oa",
    },
  });
}

function createLoginGuardContext(cookie = "principal-session") {
  const responseHeaders: unknown[][] = [];
  const raw = new Request("https://iam.example.test/sso/login-guard", {
    headers: cookie ? { Cookie: `global_session=${cookie}` } : {},
  });
  const query = {
    client: "independent",
    redirectUrl: "https://app.example.com/home?from=iam",
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
    get: mock((key: string) => key === "requestId" ? "req-login-guard" : undefined),
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    json: mock((body: unknown, status: number) => ({ body, status })),
  };
}

function createAuthorizeContext(options: {
  authorization?: string;
  client?: string;
  cookie?: string;
  queryToken?: string;
  state?: string;
} = {}) {
  const {
    authorization = "header-session",
    client = "independent",
    cookie = "cookie-session",
    queryToken = "query-session",
    state,
  } = options;
  const query: {
    client: string;
    redirectUrl: string;
    state?: string;
    token: string;
  } = {
    client,
    redirectUrl: "https://app.example.com/home?from=iam",
    token: queryToken,
  };
  if (state !== undefined)
    query.state = state;
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
        state: "untrusted-callback-state",
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
  const raw = new Request("https://iam.example.test/sso/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from("independent:secret").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: "auth-code",
      redirect_uri: "https://app.example.com/callback",
    }),
  });
  return {
    req: {
      header: mock((name: string) => raw.headers.get(name) ?? undefined),
      method: "POST",
      path: "/sso/token",
      raw,
      url: raw.url,
      valid: mock((target: string) => target === "header"
        ? { authorization: raw.headers.get("Authorization")! }
        : {
            code: "auth-code",
            redirect_uri: "https://app.example.com/callback",
          }),
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
            state: "opaque state !/?:&=%",
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
        state: "opaque state !/?:&=%",
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

function createHttpHandlerApp(
  path: string,
  handler: (context: never, next: never) => unknown,
  validInput: Record<string, string>,
) {
  const app = new Hono();
  app.get(path, async (context) => {
    (context.req as unknown as {
      valid: () => Record<string, string>;
    }).valid = () => validInput;
    return await handler(context as never, undefined as never) as Response;
  });
  app.onError(createErrorHandler(errorLogger as never));
  return app;
}

function createOaHandlerApp(
  handler: (context: never, next: never) => unknown,
) {
  const app = new Hono();
  app.get("/sso/thirdparty/oa/:clientCode", async (context) => {
    (context.req as unknown as {
      valid: (target: string) => Record<string, string>;
    }).valid = (target): Record<string, string> => {
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
    return await handler(context as never, undefined as never) as Response;
  });
  app.onError(createErrorHandler(errorLogger as never));
  return app;
}

function createTokenHandlerApp(
  handler: (context: never, next: never) => unknown,
) {
  const app = new Hono();
  app.post("/sso/token", async (context) => {
    (context.req as unknown as {
      valid: (target: string) => Record<string, string>;
    }).valid = (target) => {
      if (target === "header") {
        return {
          authorization:
            `Basic ${Buffer.from("independent:secret").toString("base64")}`,
        } as Record<string, string>;
      }
      return {
        code: "auth-code",
        redirect_uri: "https://app.example.com/callback",
      } as Record<string, string>;
    };
    return await handler(context as never, undefined as never) as Response;
  });
  app.onError(createErrorHandler(errorLogger as never));
  return app;
}

beforeEach(() => {
  errorLogger.error.mockClear();
  errorLogger.info.mockClear();
  errorLogger.warn.mockClear();
  logger.warn.mockClear();
  authorize.mockClear();
  callback.mockClear();
  loginOA.mockClear();
  loginWX.mockClear();
  logout.mockClear();
  setToken.mockClear();
  checkLoginContinuation.mockClear();
});

describe("createSsoHandlers protocol adaptation", () => {
  test("login guard continues a valid Custom SSO request without exposing session data", async () => {
    const handlers = createHandlers();
    const context = createLoginGuardContext();

    const response = await handlers.loginGuard(context as never, async () => {}) as unknown;

    expect(checkLoginContinuation).toHaveBeenCalledWith({
      clientCode: "independent",
      globalSessionToken: "principal-session",
      redirectUrl: "https://app.example.com/home?from=iam",
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

  test("login guard clears an explicitly invalid Principal Session before showing login", async () => {
    checkLoginContinuation.mockResolvedValueOnce({
      clearGlobalSessionCookie: true,
      decision: LoginPageGuardDecision.Login,
    });
    const handlers = createHandlers();
    const context = createLoginGuardContext("stale-session");

    const response = await handlers.loginGuard(context as never, async () => {});

    expect(response).toEqual(expect.objectContaining({
      body: expect.objectContaining({
        data: { decision: LoginPageGuardDecision.Login },
      }),
      status: 200,
    }));
    expect(context.responseHeaders).toContainEqual([
      "Set-Cookie",
      expect.stringMatching(
        /global_session=;.*Max-Age=0;.*Path=\/.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/iu,
      ),
      { append: true },
    ]);
  });

  test("login guard maps an uncertain Principal Session to Subject Access unavailable without clearing it", async () => {
    checkLoginContinuation.mockRejectedValueOnce(
      new PrincipalSessionInspectionUnavailableError(),
    );
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
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectAccessUnavailable,
    });
  });

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
    authorize.mockResolvedValueOnce({
      isLogin: true,
      code: "auth-code",
      callbackEndpoint: "https://app.example.com/sso/callback",
      clientCode: "independent",
      mode: CustomSsoClientMode.Independent,
      redirectUrl: "https://app.example.com/home?from=iam",
    });

    await handlers.authorize(context as never, async () => {});

    expect(context.redirect).toHaveBeenCalledWith(
      "https://app.example.com/sso/callback?code=auth-code&client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome%3Ffrom%3Diam",
    );
  });

  test("authorize keeps Gateway state only in the Grant until the trusted callback completes", async () => {
    const handlers = createHandlers();
    const context = createAuthorizeContext({
      client: "gateway",
      state: "opaque-gateway-state",
    });
    authorize.mockResolvedValueOnce({
      isLogin: true,
      code: "auth-code",
      clientCode: "gateway",
      mode: CustomSsoClientMode.Gateway,
      redirectUrl: "https://gateway.example.com/home?from=iam",
      state: "opaque-gateway-state",
    });

    await handlers.authorize(context as never, async () => {});

    expect(context.redirect).toHaveBeenCalledWith(
      "https://gateway.example.com/sso/callback?code=auth-code&client=gateway&redirectUrl=https%3A%2F%2Fgateway.example.com%2Fhome%3Ffrom%3Diam",
    );
  });

  test("callback writes local and ORCAS cookies before redirecting with both tokens", async () => {
    const handlers = createHandlers();
    const context = createCallbackContext();
    callback.mockResolvedValueOnce({
      token: "local-token",
      orcasSessionId: "orcas-token",
      state: "trusted-grant-state",
    });

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
      "https://gateway.example.com/home?from=iam&token=local-token&orcasToken=orcas-token&state=trusted-grant-state",
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

  test("token adapts Basic and form input to the narrow Independent Credential envelope", async () => {
    const handlers = createHandlers();
    const context = createTokenContext();
    setToken.mockResolvedValueOnce({
      sid: "independent-token",
      ttl: 7200,
      subject: {
        version: 2,
        subjectIdentifier: "00000000-0000-4000-8000-000000001001",
      },
    });

    await expect(handlers.token(context as never, async () => {})).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          sid: "independent-token",
          ttl: 7200,
          subject: {
            version: 2,
            subjectIdentifier: "00000000-0000-4000-8000-000000001001",
          },
        },
      },
    });
    expect(setToken).toHaveBeenCalledWith({
      clientCode: "independent",
      clientSecret: "secret",
      code: "auth-code",
      redirectUri: "https://app.example.com/callback",
    }, { requestContext: expect.objectContaining({ requestId: "req-token", route: "/sso/token" }) });
  });

  test.each([
    ["empty sid", { sid: "", ttl: 7200 }],
    ["non-positive ttl", { sid: "independent-token", ttl: 0 }],
  ])("token rejects a response with %s at the final HTTP Contract boundary", async (
    _invalidField,
    invalidCredential,
  ) => {
    const handlers = createHandlers();
    const context = createTokenContext();
    setToken.mockResolvedValueOnce({
      ...invalidCredential,
      subject: {
        version: 2,
        subjectIdentifier: "00000000-0000-4000-8000-000000001001",
      },
    } as never);

    await expect(
      handlers.token(context as never, async () => {}),
    ).rejects.toThrow();
  });

  test("authorize returns stable Subject Access errors and only clears its global cookie when disabled", async () => {
    const handlers = createHandlers();
    const app = createHttpHandlerApp("/sso/authorize", handlers.authorize, {
      client: "independent",
      redirectUrl: "https://app.example.com/home",
      token: "",
    });
    const url = "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome";

    authorize.mockRejectedValueOnce(new SubjectAccessSessionInvalidHttpError());
    const disabled = await app.request(url, {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(disabled.status).toBe(401);
    await expect(disabled.json()).resolves.toMatchObject({
      code: ApiErrorCode.SessionInvalid,
    });
    expect(disabled.headers.getSetCookie()).toHaveLength(1);
    expect(disabled.headers.getSetCookie()[0]).toContain("global_session=");
    expect(disabled.headers.getSetCookie()[0]).toContain("Path=/");
    expect(disabled.headers.getSetCookie()[0]).toContain("Max-Age=0");

    authorize.mockRejectedValueOnce(new SubjectAccessUnavailableError());
    const unavailable = await app.request(url, {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Retry-After")).toBe("3");
    await expect(unavailable.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectAccessUnavailable,
    });
    expect(unavailable.headers.getSetCookie()).toEqual([]);

    authorize.mockRejectedValueOnce(new SubjectProjectionNotReadyError());
    const projectionUnavailable = await app.request(url);
    expect(projectionUnavailable.status).toBe(503);
    expect(projectionUnavailable.headers.get("Retry-After")).toBe("3");
    await expect(projectionUnavailable.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectProjectionNotReady,
    });
  });

  test("authorize maps client runtime uncertainty before entering authorization grant issuance", async () => {
    const issueAuthorizationCode = mock(async () => ({ isLogin: false as const, code: null }));
    const authorizeUseCase = createAuthorizeSsoUseCase({
      authorizationGrants: { issueAuthorizationCode },
      clients: {
        findRuntimeRecord: mock(async () => {
          throw new CustomSsoClientRuntimeUnavailableError({
            cause: new Error("redis://secret@runtime-reader"),
          });
        }),
      },
      redirectUrls: {
        normalizeAllowed: mock(() => "https://app.example.com/home"),
      },
      trafficGate: {
        assertIssuanceAllowed: async () => undefined,
      },
    });
    const handlers = createHandlers(authorizeUseCase);
    const app = createHttpHandlerApp("/sso/authorize", handlers.authorize, {
      client: "independent",
      redirectUrl: "https://app.example.com/home",
      token: "",
    });

    const response = await app.request(
      "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome",
      { headers: { Cookie: "global_session=global-token" } },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(body).toEqual({
      code: ApiErrorCode.InternalError,
      data: null,
      message: "服务暂时不可用",
    });
    expect(issueAuthorizationCode).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("runtime-reader");
  });

  test("callback maps Subject Access errors and expires global, target local, and ORCAS cookies only when disabled", async () => {
    const handlers = createHandlers();
    const app = createHttpHandlerApp("/sso/callback", handlers.callback, {
      client: "gateway",
      code: "auth-code",
      redirectUrl: "https://gateway.example.com/home",
    });

    callback.mockRejectedValueOnce(new SubjectAccessSessionInvalidHttpError());
    const disabled = await app.request("/sso/callback", {
      headers: {
        Cookie: "global_session=global-token; local_gateway_session=local-token; orcas_sso_sessionid=orcas-token",
      },
    });
    expect(disabled.status).toBe(401);
    expect(disabled.headers.getSetCookie()).toHaveLength(3);
    for (const cookie of disabled.headers.getSetCookie()) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }

    callback.mockRejectedValueOnce(new SubjectAccessUnavailableError());
    const unavailable = await app.request("/sso/callback", {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Retry-After")).toBe("3");
    expect(unavailable.headers.getSetCookie()).toEqual([]);

    callback.mockRejectedValueOnce(new SubjectProjectionNotReadyError());
    const projectionUnavailable = await app.request("/sso/callback");
    expect(projectionUnavailable.status).toBe(503);
    expect(projectionUnavailable.headers.get("Retry-After")).toBe("3");
    await expect(projectionUnavailable.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectProjectionNotReady,
    });
  });

  test("token maps disabled and unavailable credentials without emitting browser cookie deletion", async () => {
    const handlers = createHandlers();
    const app = createTokenHandlerApp(handlers.token);
    const request = {
      method: "POST",
      headers: {
        "Authorization":
          `Basic ${Buffer.from("independent:secret").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: "auth-code",
        redirect_uri: "https://app.example.com/callback",
      }),
    };

    setToken.mockRejectedValueOnce(new SubjectAccessSessionInvalidHttpError());
    const disabled = await app.request("/sso/token", request);
    expect(disabled.status).toBe(401);
    await expect(disabled.json()).resolves.toMatchObject({
      code: ApiErrorCode.SessionInvalid,
    });
    expect(disabled.headers.getSetCookie()).toEqual([]);

    setToken.mockRejectedValueOnce(new SubjectAccessUnavailableError());
    const unavailable = await app.request("/sso/token", request);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Retry-After")).toBe("3");
    await expect(unavailable.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectAccessUnavailable,
    });
    expect(unavailable.headers.getSetCookie()).toEqual([]);
  });

  test("authorize, callback, and token expose Maintenance as retryable 503 without clearing cookies", async () => {
    const handlers = createHandlers();
    const authorizeApp = createHttpHandlerApp(
      "/sso/authorize",
      handlers.authorize,
      {
        client: "independent",
        redirectUrl: "https://app.example.com/home",
        token: "",
      },
    );
    const callbackApp = createHttpHandlerApp(
      "/sso/callback",
      handlers.callback,
      {
        client: "gateway",
        code: "auth-code",
        redirectUrl: "https://gateway.example.com/home",
      },
    );
    const tokenApp = createTokenHandlerApp(handlers.token);
    const requests = [
      [authorize, () => authorizeApp.request(
        "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome",
        { headers: { Cookie: "global_session=global-token" } },
      )],
      [callback, () => callbackApp.request("/sso/callback", {
        headers: {
          Cookie: "global_session=global-token; local_gateway_session=local-token; orcas_sso_sessionid=orcas-token",
        },
      })],
      [setToken, () => tokenApp.request("/sso/token", {
        method: "POST",
        headers: {
          "Authorization":
            `Basic ${Buffer.from("independent:secret").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code: "auth-code",
          redirect_uri: "https://app.example.com/callback",
        }),
      })],
    ] as const;

    for (const [operation, request] of requests) {
      operation.mockRejectedValueOnce(new AuthzMaintenanceError());
      const response = await request();
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      await expect(response.json()).resolves.toMatchObject({
        code: ApiErrorCode.Maintenance,
      });
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  test("sanitizes unknown authorize, callback, and token failures", async () => {
    const handlers = createHandlers();
    const authorizeApp = createHttpHandlerApp(
      "/sso/authorize",
      handlers.authorize,
      {
        client: "independent",
        redirectUrl: "https://app.example.com/home",
        token: "",
      },
    );
    const callbackApp = createHttpHandlerApp(
      "/sso/callback",
      handlers.callback,
      {
        client: "gateway",
        code: "auth-code",
        redirectUrl: "https://gateway.example.com/home",
      },
    );
    const tokenApp = createTokenHandlerApp(handlers.token);

    for (const [operation, request, error] of [
      [
        authorize,
        () => authorizeApp.request(
          "/sso/authorize?client=independent&redirectUrl=https%3A%2F%2Fapp.example.com%2Fhome",
        ),
        new Error("redis://user:secret@internal/sensitive"),
      ],
      [
        callback,
        () => callbackApp.request("/sso/callback"),
        new Error("redis://user:secret@internal/sensitive"),
      ],
      [
        setToken,
        () => tokenApp.request("/sso/token", {
          method: "POST",
          headers: {
            "Authorization":
              `Basic ${Buffer.from("independent:secret").toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            code: "auth-code",
            redirect_uri: "https://app.example.com/callback",
          }),
        }),
        new CustomSsoSubjectProjectionInvariantError("subject_mismatch"),
      ],
    ] as const) {
      operation.mockRejectedValueOnce(error);
      const response = await request();
      expect(response.status).toBe(500);
      const body = JSON.stringify(await response.json());
      expect(body).toContain(ApiErrorCode.InternalError);
      expect(body).not.toContain("redis://");
      expect(body).not.toContain("sensitive");
      expect(body).not.toContain("subject_mismatch");
    }
    expect(JSON.stringify(errorLogger.error.mock.calls)).toContain(
      "subject_mismatch",
    );
  });

  test("logout prefers the global-session cookie, deletes it, and preserves the requested redirect", async () => {
    const handlers = createHandlers();
    const context = createLogoutContext();

    await handlers.logout(context as never, async () => {});

    expect(logout).toHaveBeenCalledWith({ sessionToken: "cookie-session" });
    expect(context.responseHeaders).toContainEqual([
      "Set-Cookie",
      expect.stringMatching(
        /global_session=;.*Max-Age=0;.*Path=\/.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/iu,
      ),
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

    logout.mockRejectedValueOnce(new CustomSsoClientRuntimeUnavailableError());
    const clientRuntimeUnavailable = await app.request("/sso/logout", {
      headers: { Cookie: "global_session=global-token" },
    });
    expect(clientRuntimeUnavailable.status).toBe(503);
    expect(clientRuntimeUnavailable.headers.get("Retry-After")).toBe("3");
    expect(clientRuntimeUnavailable.headers.getSetCookie()).toEqual([]);
    await expect(clientRuntimeUnavailable.json()).resolves.toMatchObject({
      code: ApiErrorCode.InternalError,
    });
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
