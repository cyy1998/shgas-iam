import type { CreateAuthHandlersDeps } from "@api/routes/auth/auth.handlers";
import { createInternalAuthzHandler, createLocalSessionAuthzHandler, createRootAuthHandlers } from "@api/routes/auth/auth.handlers";
import {
  customSsoLocalSessionCookieName,
  encodeCustomSsoClientCode,
} from "@api/services/sso/transport/custom-sso-client-code.transport";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import { createErrorHandler } from "@iam/api-core/middlewares";
import {
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { ApiErrorCode, ClientStatus } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

type InternalTestClient = {
  clientCode: string;
  clientSecret: string;
  isDelete: boolean;
  status: ClientStatus;
};

const parseLoginPasswordCredential = mock(async () => ({
  username: "138550",
  password: "1234",
}));
const loginPasswordService = mock(async () => ({
  token: "session-id",
  isMobileSet: true,
}));
const loginMobileService = mock(async () => ({
  token: "mobile-session-id",
  isMobileSet: true,
}));
const encodedGatewaySubject = Buffer.from(JSON.stringify({
  version: 1,
  subjectIdentifier: "00000000-0000-4000-8000-000000001001",
  username: "alice",
  name: "Alice",
}), "utf8").toString("base64");
const authzService = mock(async () => encodedGatewaySubject);
const getClientBySecret = mock(async (_secret: string): Promise<InternalTestClient | null> => null);
const loggerInfo = mock(() => undefined);

function createHandlers() {
  const deps = {
    authentication: {
      loginWithMobile: { execute: loginMobileService },
      loginWithPassword: { execute: loginPasswordService },
    },
    clientService: {
      getClientBySecret,
    },
    loginCredentialParser: {
      parseLoginPasswordCredential,
    },
    logger: {
      info: loggerInfo,
    },
    localSessionAuthorizer: {
      authorizeLocalSession: authzService,
    },
    config: {
      projectionRetryAfterSeconds: 3,
      redisExpireSeconds: 3600,
    },
  } as CreateAuthHandlersDeps;
  return {
    ...createRootAuthHandlers(deps),
    authz: createLocalSessionAuthzHandler(deps),
    internalAuthz: createInternalAuthzHandler(deps),
  };
}

function makeLoginContext() {
  const responseHeaders: unknown[][] = [];
  return {
    responseHeaders,
    req: {
      raw: new Request("https://iam.example.test/auth/login/password"),
      valid: mock(() => ({
        credential: "iam-login-v1.payload",
        capToken: "cap-token",
      })),
      header: mock((name: string) => {
        const headers: Record<string, string> = {
          "Client": "iam",
          "traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
          "user-agent": "api-handler-test",
          "x-forwarded-for": "203.0.113.9",
        };
        return headers[name];
      }),
      method: "POST",
      path: "/auth/login/password",
    },
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    json: mock((body: unknown) => body),
    get: mock((key: string) => key === "requestId" ? "req-1" : undefined),
  };
}

function makeMobileLoginContext() {
  const context = makeLoginContext();
  return {
    ...context,
    req: {
      ...context.req,
      raw: new Request("https://iam.example.test/auth/login/mobile"),
      valid: mock(() => ({
        capToken: "cap-token",
        code: "123456",
        phoneNumber: "17721462865",
      })),
      path: "/auth/login/mobile",
    },
  };
}

function makeHeaderContext(headers: Record<string, string>) {
  return {
    req: {
      raw: new Request("https://iam.example.test/authz", {
        headers,
      }),
      header: mock((name: string) => headers[name] ?? headers[name.toLowerCase()]),
    },
    header: mock(() => undefined),
    json: mock((body: unknown) => body),
    get: mock((key: string) => key === "requestId" ? "req-1" : undefined),
  };
}

beforeEach(() => {
  parseLoginPasswordCredential.mockClear();
  loginPasswordService.mockClear();
  loginMobileService.mockClear();
  authzService.mockClear();
  authzService.mockImplementation(async () => encodedGatewaySubject);
  getClientBySecret.mockClear();
  loggerInfo.mockClear();
  getClientBySecret.mockImplementation(async () => null);
});

describe("authentication HTTP handlers", () => {
  test("authz returns AUTH.MAINTENANCE without clearing a local session", async () => {
    authzService.mockImplementation(async () => {
      throw new AuthzMaintenanceError();
    });
    const handlers = createHandlers();
    const app = new Hono();
    app.get("/auth/authz", handlers.authz as never);
    app.onError(createErrorHandler({
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    } as never));

    const response = await app.request("/auth/authz", {
      headers: {
        "Client": "portal",
        "Cookie": "local_portal_session=local-token; orcas_sso_sessionid=orcas-token",
        "X-Forwarded-Uri": "/app",
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.Maintenance,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(authzService).toHaveBeenCalledTimes(1);
  });

  test("authz writes encoded user info response header", async () => {
    const handlers = createHandlers();
    const responseHeaders: unknown[][] = [];
    const context = {
      ...makeHeaderContext({
        "Authorization": "local-session-token",
        "Client": "portal",
        "X-Forwarded-Uri": "/app",
      }),
      header: mock((...args: unknown[]) => {
        responseHeaders.push(args);
      }),
    };

    const result: unknown = await handlers.authz(context as never, undefined as never);

    expect(result).toEqual(resp.ok(encodedGatewaySubject));

    expect(authzService).toHaveBeenCalledWith("local-session-token", "portal");
    expect(context.json).toHaveBeenCalledWith(
      resp.ok(encodedGatewaySubject),
      HttpStatusCodes.OK,
    );
    expect(responseHeaders).toContainEqual([
      "X-User-Info",
      encodedGatewaySubject,
    ]);
    expect(JSON.parse(
      Buffer.from(encodedGatewaySubject, "base64").toString("utf8"),
    )).toEqual({
      version: 1,
      subjectIdentifier: "00000000-0000-4000-8000-000000001001",
      username: "alice",
      name: "Alice",
    });
  });

  test("authz rejects out-of-range client codes before deriving a cookie name", async () => {
    const handlers = createHandlers();
    const context = makeHeaderContext({
      "Authorization": "local-session-token",
      "Client": "p".repeat(65),
      "X-Forwarded-Uri": "/app",
    });

    await expect(
      handlers.authz(context as never, undefined as never),
    ).rejects.toBeInstanceOf(AuthzUnauthorizedError);

    expect(authzService).not.toHaveBeenCalled();
  });

  test("authz prefers the client-scoped cookie over the Authorization header", async () => {
    const handlers = createHandlers();
    const context = makeHeaderContext({
      "Authorization": "header-session-token",
      "Client": "portal",
      "Cookie": "local_portal_session=cookie-session-token",
      "X-Forwarded-Uri": "/app",
    });

    await handlers.authz(context as never, undefined as never);

    expect(authzService).toHaveBeenCalledWith(
      "cookie-session-token",
      "portal",
    );
  });

  test("authz resolves an encoded cookie name for an opaque Client Code", async () => {
    const handlers = createHandlers();
    const context = makeHeaderContext({
      "Client":
        "legacy%3Aclient%2F%E4%B8%AD%E6%96%87",
      "Cookie":
        "local_legacy%3Aclient%2F%E4%B8%AD%E6%96%87_session=cookie-session-token",
      "X-Forwarded-Uri": "/app",
    });

    await handlers.authz(context as never, undefined as never);

    expect(authzService).toHaveBeenCalledWith(
      "cookie-session-token",
      "legacy:client/中文",
    );
  });

  test("authz resolves a database-valid non-BMP Client Code from its encoded cookie", async () => {
    const handlers = createHandlers();
    const clientCode = "😀".repeat(33);
    const context = makeHeaderContext({
      "Client": encodeCustomSsoClientCode(clientCode),
      "Cookie":
        `${customSsoLocalSessionCookieName(clientCode)}=cookie-session-token`,
      "X-Forwarded-Uri": "/app",
    });

    await handlers.authz(context as never, undefined as never);

    expect(authzService).toHaveBeenCalledWith(
      "cookie-session-token",
      clientCode,
    );
  });

  test("authz expires the encoded cookie name for an invalid opaque Client session", async () => {
    const handlers = createHandlers();
    authzService.mockRejectedValue(new AuthzUnauthorizedError("未登录"));
    const app = new Hono();
    app.get("/auth/authz", handlers.authz as never);
    app.onError(createErrorHandler({
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    } as never));

    const response = await app.request("/auth/authz", {
      headers: {
        "Client":
          "legacy%3Aclient%2F%E4%B8%AD%E6%96%87",
        "Cookie":
          "local_legacy%3Aclient%2F%E4%B8%AD%E6%96%87_session=local-token",
        "X-Forwarded-Uri": "/app",
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "local_legacy%3Aclient%2F%E4%B8%AD%E6%96%87_session=",
        ),
      ]),
    );
  });

  test("authz expires the client-scoped and ORCAS cookies for a disabled Subject", async () => {
    const handlers = createHandlers();
    authzService.mockRejectedValue(new SubjectAccessSessionInvalidHttpError());
    const app = new Hono();
    app.get("/auth/authz", handlers.authz as never);
    app.onError(createErrorHandler({
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    } as never));

    const response = await app.request("/auth/authz", {
      headers: {
        "Client": "portal",
        "Cookie": "local_portal_session=local-token; orcas_sso_sessionid=orcas-token",
        "X-Forwarded-Uri": "/app",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.SessionInvalid,
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
  });

  test("authz maps uncertain Subject Access to 503 without deleting local cookies or logging Redis details", async () => {
    const handlers = createHandlers();
    authzService.mockRejectedValue(
      new SubjectAccessUnavailableError(new Error("redis://secret@subject-access")),
    );
    const logged: unknown[] = [];
    const write = (fields: unknown) => logged.push(fields);
    const app = new Hono();
    app.get("/auth/authz", handlers.authz as never);
    app.onError(createErrorHandler({
      error: write,
      info: write,
      warn: write,
    } as never));

    const response = await app.request("/auth/authz", {
      headers: {
        "Client": "portal",
        "Cookie": "local_portal_session=local-token",
        "X-Forwarded-Uri": "/app",
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectAccessUnavailable,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(JSON.stringify(logged)).not.toContain("redis://secret@subject-access");
  });

  test("authz maps Projection Not Ready to retryable 503 without deleting cookies", async () => {
    const handlers = createHandlers();
    authzService.mockRejectedValue(new SubjectProjectionNotReadyError());
    const app = new Hono();
    app.get("/auth/authz", handlers.authz as never);
    app.onError(createErrorHandler({
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    } as never));

    const response = await app.request("/auth/authz", {
      headers: {
        "Client": "portal",
        "Cookie": "local_portal_session=local-token; orcas_sso_sessionid=orcas-token",
        "X-Forwarded-Uri": "/app",
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.SubjectProjectionNotReady,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("authz clears local and ORCAS cookies for an invalid configured session", async () => {
    const handlers = createHandlers();
    authzService.mockRejectedValue(new AuthzUnauthorizedError("未登录"));
    const app = new Hono();
    app.get("/auth/authz", handlers.authz as never);
    app.onError(createErrorHandler({
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    } as never));

    const response = await app.request("/auth/authz", {
      headers: {
        "Client": "portal",
        "Cookie": "local_portal_session=local-token; orcas_sso_sessionid=orcas-token",
        "X-Forwarded-Uri": "/app",
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
  });

  test("authz does not manufacture cookie deletion for an invalid header session", async () => {
    const handlers = createHandlers();
    authzService.mockRejectedValue(new AuthzUnauthorizedError("未登录"));
    const app = new Hono();
    app.get("/auth/authz", handlers.authz as never);
    app.onError(createErrorHandler({
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    } as never));

    const response = await app.request("/auth/authz", {
      headers: {
        "Authorization": "invalid-local-token",
        "Client": "portal",
        "X-Forwarded-Uri": "/app",
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("password login decrypts credential before calling the use case", async () => {
    const handlers = createHandlers();
    const context = makeLoginContext();

    const result: unknown = await handlers.loginPassword(context as never, undefined as never);

    expect(result).toEqual(resp.ok({
      token: "session-id",
      isMobileSet: true,
    }));

    expect(parseLoginPasswordCredential).toHaveBeenCalledWith("iam-login-v1.payload");
    expect(loginPasswordService).toHaveBeenCalledWith({
      capToken: "cap-token",
      password: "1234",
      username: "138550",
    }, {
      requestContext: {
        sourceApp: "iam",
        requestId: "req-1",
        traceId: "11111111111111111111111111111111",
        ip: "203.0.113.9",
        userAgent: "api-handler-test",
        route: "/auth/login/password",
        method: "POST",
      },
    });
    expect(context.responseHeaders[0]?.[0]).toBe("Set-Cookie");
    expect(context.responseHeaders[0]?.[1]).toContain("global_session=session-id");
  });

  test("password login stops before the workflow when credential parsing fails", async () => {
    const handlers = createHandlers();
    const context = makeLoginContext();
    parseLoginPasswordCredential.mockRejectedValueOnce(new Error("登录凭证无效"));

    await expect(handlers.loginPassword(context as never, undefined as never))
      .rejects
      .toThrow("登录凭证无效");

    expect(loginPasswordService).not.toHaveBeenCalled();
    expect(context.responseHeaders).toHaveLength(0);
  });

  test("mobile login dispatches validated input and writes the global session cookie", async () => {
    const handlers = createHandlers();
    const context = makeMobileLoginContext();

    const result: unknown = await handlers.loginMobile(context as never, undefined as never);

    expect(result).toEqual(resp.ok({
      token: "mobile-session-id",
      isMobileSet: true,
    }));
    expect(loginMobileService).toHaveBeenCalledWith({
      capToken: "cap-token",
      code: "123456",
      phoneNumber: "17721462865",
    }, {
      requestContext: expect.objectContaining({
        requestId: "req-1",
        route: "/auth/login/mobile",
      }),
    });
    expect(context.responseHeaders[0]?.[0]).toBe("Set-Cookie");
    expect(context.responseHeaders[0]?.[1]).toContain("global_session=mobile-session-id");
  });

  test("internal authz rejects requests without an apikey", async () => {
    const handlers = createHandlers();
    const context = makeHeaderContext({
      "IP-Chain": "10.0.0.1, 192.168.93.10",
    });

    await expect(handlers.internalAuthz(context as never, undefined as never)).rejects.toThrow("非法访问");

    expect(getClientBySecret).not.toHaveBeenCalled();
  });

  test("internal authz returns boolean success for an active client apikey", async () => {
    const handlers = createHandlers();
    getClientBySecret.mockImplementation(async () => ({
      clientCode: "portal",
      clientSecret: "secret-1",
      isDelete: false,
      status: ClientStatus.Enable,
    }));
    const context = makeHeaderContext({
      "apikey": "secret-1",
      "IP-Chain": "10.0.0.1, 192.168.93.10",
    });

    const result: unknown = await handlers.internalAuthz(context as never, undefined as never);

    expect(result).toEqual(resp.ok(true));

    expect(getClientBySecret).toHaveBeenCalledWith("secret-1");
  });
});
