import {
  createApiAuthenticationHandlers as createApiAuthenticationHandlersImpl,
} from "@api/middlewares/authentication.handler";
import {
  mapCustomSsoRetryableError,
} from "@api/middlewares/custom-sso-retryable.error";
import {
  createCustomSsoSubjectDeliveryRequestScope,
} from "@api/services/sso/subject-delivery/custom-sso-subject-delivery-request-scope";
import {
  customSsoLocalSessionCookieName,
  encodeCustomSsoClientCode,
} from "@api/services/sso/transport/custom-sso-client-code.transport";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import {
  SubjectAccessDisabledError,
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { ApiErrorCode } from "@iam/contracts";
import {
  CustomSsoClientDeliveryUnauthorizedError,
} from "@iam/custom-sso";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

type AuthenticationHandlerDeps = Parameters<
  typeof createApiAuthenticationHandlersImpl
>[0];

function createApiAuthenticationHandlers(
  deps: Omit<
    AuthenticationHandlerDeps,
    "subjectDeliveryRequests"
  >,
) {
  return createApiAuthenticationHandlersImpl({
    ...deps,
    subjectDeliveryRequests:
      createCustomSsoSubjectDeliveryRequestScope(),
  });
}

function resolvedAuthentication(authenticationContext: {
  authenticatedClientCode: string;
  orcasId?: string;
  subjectIdentifier: string;
}) {
  return {
    authenticationContext,
    subjectDeliveryCapability: {
      resolveUserInfo: async () => ({
        version: 2 as const,
        subjectIdentifier: authenticationContext.subjectIdentifier,
      }),
    },
  };
}

function createMockLogger() {
  const info = mock((..._args: unknown[]) => undefined);
  const warn = mock((..._args: unknown[]) => undefined);
  const error = mock((..._args: unknown[]) => undefined);
  return {
    info,
    warn,
    error,
    bindings: () => ({ sourceApp: "iam-api-test" }),
  };
}

describe("publicAuthenticationHandler", () => {
  test("returns AUTH.MAINTENANCE without clearing a local session", async () => {
    const logger = createMockLogger();
    const resolvePublicAuthentication = mock(async () => {
      throw new AuthzMaintenanceError();
    });
    const handlers = createApiAuthenticationHandlers({
      clientService: { getClientBySecret: mock(async () => null) },
      customSsoSession: { resolvePublicAuthentication },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/user-info", {
      headers: {
        Client: "gateway",
        Cookie: "local_gateway_session=session-token; orcas_sso_sessionid=orcas-token",
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      code: ApiErrorCode.Maintenance,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(resolvePublicAuthentication).toHaveBeenCalledTimes(1);
  });

  test("returns bad request when Client header is missing", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () => {
          throw new AuthzMaintenanceError();
        }),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono<{
      Variables: {
        authenticatedClientCode: string;
        orcasId?: string;
        subjectIdentifier: string;
      };
    }>();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/ping", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/ping");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.BadRequest,
      data: null,
      message: "非法请求",
    });
  });

  test("rejects out-of-range client codes before resolving a session", async () => {
    const logger = createMockLogger();
    const resolvePublicAuthentication = mock(async () => {
      throw new AuthzMaintenanceError();
    });
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication,
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/ping", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/ping",
      {
        headers: {
          Authorization: "local-session",
          Client: "g".repeat(65),
        },
      },
    );

    expect(response.status).toBe(400);
    expect(resolvePublicAuthentication).not.toHaveBeenCalled();
  });

  test("writes only the protocol-neutral authentication context for an IAM Principal Session", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () =>
          resolvedAuthentication({
            authenticatedClientCode: "iam",
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          })),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono<{
      Variables: {
        authenticatedClientCode: string;
        orcasId?: string;
        subjectIdentifier: string;
      };
    }>();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/context", c => c.json({
      authenticatedClientCode: c.get("authenticatedClientCode"),
      contextKeys: Object.keys(c.var).sort(),
      orcasId: c.get("orcasId"),
      subjectIdentifier: c.get("subjectIdentifier"),
    }));
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/context", {
      headers: {
        Authorization: "principal-session",
        Client: "iam",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticatedClientCode: "iam",
      contextKeys: ["authenticatedClientCode", "subjectIdentifier"],
      subjectIdentifier: "00000000-0000-4000-8000-000000001001",
    });
  });

  test("writes only minimal shared variables for a Custom SSO local token", async () => {
    const logger = createMockLogger();
    const resolvePublicAuthentication = mock(async () =>
      resolvedAuthentication({
        authenticatedClientCode: "gateway",
        orcasId: "orcas-user",
        subjectIdentifier:
          "00000000-0000-4000-8000-000000001001",
      }));
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication,
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono<{
      Variables: {
        authenticatedClientCode: string;
        orcasId?: string;
        subjectIdentifier: string;
      };
    }>();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/context", c => c.json({
      authenticatedClientCode: c.get("authenticatedClientCode"),
      contextKeys: Object.keys(c.var).sort(),
      orcasId: c.get("orcasId"),
      subjectIdentifier: c.get("subjectIdentifier"),
    }));
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/context", {
      headers: {
        Authorization: "local-session",
        Client: "gateway",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticatedClientCode: "gateway",
      contextKeys: [
        "authenticatedClientCode",
        "orcasId",
        "subjectIdentifier",
      ],
      orcasId: "orcas-user",
      subjectIdentifier: "00000000-0000-4000-8000-000000001001",
    });
    expect(resolvePublicAuthentication).toHaveBeenCalledWith(
      "local-session",
      "gateway",
    );
  });

  test("resolves an encoded local-session cookie for an opaque Client Code", async () => {
    const logger = createMockLogger();
    const resolvePublicAuthentication = mock(async () =>
      resolvedAuthentication({
        authenticatedClientCode: "legacy:client/中文",
        subjectIdentifier:
          "00000000-0000-4000-8000-000000001001",
      }));
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication,
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/ping", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/ping",
      {
        headers: {
          Client:
            "legacy%3Aclient%2F%E4%B8%AD%E6%96%87",
          Cookie:
            "local_legacy%3Aclient%2F%E4%B8%AD%E6%96%87_session=local-session",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(resolvePublicAuthentication).toHaveBeenCalledWith(
      "local-session",
      "legacy:client/中文",
    );
  });

  test("resolves a database-valid non-BMP Client Code from its encoded cookie", async () => {
    const logger = createMockLogger();
    const clientCode = "😀".repeat(33);
    const resolvePublicAuthentication = mock(async () =>
      resolvedAuthentication({
        authenticatedClientCode: clientCode,
        subjectIdentifier:
          "00000000-0000-4000-8000-000000001001",
      }));
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication,
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/ping", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/ping",
      {
        headers: {
          Client: encodeCustomSsoClientCode(clientCode),
          Cookie:
            `${customSsoLocalSessionCookieName(clientCode)}=local-session`,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(resolvePublicAuthentication).toHaveBeenCalledWith(
      "local-session",
      clientCode,
    );
  });

  test("binds the delivery capability only for the downstream Hono lifecycle", async () => {
    const logger = createMockLogger();
    const subjectDeliveryRequests
      = createCustomSsoSubjectDeliveryRequestScope();
    const resolveUserInfo = mock(async () => ({
      version: 2 as const,
      subjectIdentifier:
        "00000000-0000-4000-8000-000000001001",
    }));
    const handlers = createApiAuthenticationHandlersImpl({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () => ({
          authenticationContext: {
            authenticatedClientCode: "gateway",
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          },
          subjectDeliveryCapability: { resolveUserInfo },
        })),
      },
      subjectDeliveryRequests,
      config: { projectionRetryAfterSeconds: 3 },
    });
    let downstreamContext: object | undefined;
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", async (c) => {
      downstreamContext = c;
      const projection
        = await subjectDeliveryRequests.resolveUserInfoForRequest(c);
      return c.json({
        contextKeys: Object.keys(c.var).sort(),
        projection,
      });
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/user-info",
      {
        headers: {
          Authorization: "local-session",
          Client: "gateway",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      contextKeys: [
        "authenticatedClientCode",
        "subjectIdentifier",
      ],
      projection: {
        subjectIdentifier:
          "00000000-0000-4000-8000-000000001001",
      },
    });
    expect(resolveUserInfo).toHaveBeenCalledTimes(1);
    if (downstreamContext === undefined)
      throw new Error("expected downstream Hono context");
    await expect(
      subjectDeliveryRequests.resolveUserInfoForRequest(
        downstreamContext,
      ),
    ).rejects.toThrow("request-scoped");
  });

  test("returns SESSION_INVALID and clears cookies for a disabled Subject", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () => {
          throw new SubjectAccessSessionInvalidHttpError();
        }),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/ping", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/ping", {
      headers: {
        Client: "iam",
        Cookie: "global_session=session-token; orcas_sso_sessionid=orcas-token",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.SessionInvalid,
      data: null,
      message: "会话已失效",
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of response.headers.getSetCookie()) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
  });

  test("clears global source cookies when the Principal Session credential is unauthorized", async () => {
    const logger = createMockLogger();
    const resolvePublicAuthentication = mock(async () => {
      throw new AuthzUnauthorizedError("未登录");
    });
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication,
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/user-info",
      {
        headers: {
          Client: "iam",
          Cookie:
            "global_session=principal-cookie; orcas_sso_sessionid=orcas-token",
        },
      },
    );

    expect(response.status).toBe(401);
    expect(resolvePublicAuthentication).toHaveBeenCalledWith(
      "principal-cookie",
      "iam",
    );
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("global_session="),
        expect.stringContaining("orcas_sso_sessionid="),
      ]),
    );
  });

  test("keeps a valid global source when only IAM subject delivery rejects its client config", async () => {
    const logger = createMockLogger();
    const resolvePublicAuthentication = mock(async () =>
      resolvedAuthentication({
        authenticatedClientCode: "iam",
        subjectIdentifier:
          "00000000-0000-4000-8000-000000001001",
      }));
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication,
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", () => {
      throw new CustomSsoClientDeliveryUnauthorizedError();
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/user-info",
      {
        headers: {
          Authorization: "principal-header",
          Client: "iam",
          Cookie:
            "global_session=principal-cookie; orcas_sso_sessionid=orcas-token",
        },
      },
    );

    expect(response.status).toBe(401);
    expect(resolvePublicAuthentication).toHaveBeenCalledWith(
      "principal-cookie",
      "iam",
    );
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("returns SUBJECT_ACCESS_UNAVAILABLE without clearing cookies for an uncertain Barrier", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () => {
          throw new SubjectAccessUnavailableError();
        }),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/ping", c => c.json({ ok: true }));
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/ping", {
      headers: {
        Client: "iam",
        Cookie: "global_session=session-token; orcas_sso_sessionid=orcas-token",
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.SubjectAccessUnavailable,
      data: null,
      message: "账号访问状态暂时不可用",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("does not clear local or ORCAS cookies when the downstream projection is retryable", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () =>
          resolvedAuthentication({
            authenticatedClientCode: "gateway",
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          })),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", () => {
      throw mapCustomSsoRetryableError(
        new SubjectProjectionNotReadyError(),
        { retryAfterSeconds: 3 },
      );
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/user-info", {
      headers: {
        Client: "gateway",
        Cookie: "local_gateway_session=session-token; orcas_sso_sessionid=orcas-token",
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("maps downstream Subject Access disable to SESSION_INVALID and clears source cookies", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () =>
          resolvedAuthentication({
            authenticatedClientCode: "gateway",
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          })),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", () => {
      throw new SubjectAccessDisabledError();
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/user-info", {
      headers: {
        Client: "gateway",
        Cookie: "local_gateway_session=session-token; orcas_sso_sessionid=orcas-token",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.SessionInvalid,
      data: null,
      message: "会话已失效",
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });

  test("maps downstream Subject Access uncertainty to retryable 503 without clearing cookies", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () =>
          resolvedAuthentication({
            authenticatedClientCode: "gateway",
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          })),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", () => {
      throw new SubjectAccessUnavailableError();
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request("http://localhost/public/user-info", {
      headers: {
        Client: "gateway",
        Cookie: "local_gateway_session=session-token; orcas_sso_sessionid=orcas-token",
      },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("clears the local and ORCAS cookies when a downstream config-version race invalidates a cookie session", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () =>
          resolvedAuthentication({
            authenticatedClientCode: "gateway",
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          })),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", () => {
      throw new CustomSsoClientDeliveryUnauthorizedError();
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/user-info",
      {
        headers: {
          Client: "gateway",
          Cookie:
            "local_gateway_session=session-token; orcas_sso_sessionid=orcas-token",
        },
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("local_gateway_session="),
        expect.stringContaining("orcas_sso_sessionid="),
      ]),
    );
  });

  test("does not manufacture cookie deletion when a downstream config-version race invalidates a header session", async () => {
    const logger = createMockLogger();
    const handlers = createApiAuthenticationHandlers({
      clientService: {
        getClientBySecret: mock(async () => null),
      },
      customSsoSession: {
        resolvePublicAuthentication: mock(async () =>
          resolvedAuthentication({
            authenticatedClientCode: "gateway",
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          })),
      },
      config: { projectionRetryAfterSeconds: 3 },
    });
    const app = new Hono();
    app.use("*", handlers.publicAuthenticationHandler);
    app.get("/public/user-info", () => {
      throw new CustomSsoClientDeliveryUnauthorizedError();
    });
    app.onError(createErrorHandler(logger));

    const response = await app.request(
      "http://localhost/public/user-info",
      {
        headers: {
          Authorization: "session-token",
          Client: "gateway",
          Cookie: "orcas_sso_sessionid=orcas-token",
        },
      },
    );

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
