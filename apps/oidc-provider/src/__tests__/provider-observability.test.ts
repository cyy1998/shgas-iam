import type Provider from "oidc-provider";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import {
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { describe, expect, it, vi } from "vitest";
import { registerProviderEvents } from "../provider/events.ts";
import { registerProviderMiddleware } from "../provider/middleware.ts";
import { markGlobalSessionCookieError } from "../session/global-session-error-provenance.ts";

const traceId = "11111111111111111111111111111111";

describe("oIDC provider observability", () => {
  it("stores parsed trace id in provider request state", async () => {
    const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    const provider = {
      middleware: {
        unshift(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) {
          middlewares.unshift(fn);
        },
      },
    } as unknown as Provider;

    registerProviderMiddleware(provider, {
      clientAuthRateLimiter: {
        clear: vi.fn(),
        isBlocked: vi.fn(async () => false),
        recordFailure: vi.fn(),
      },
      env: {
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
        },
      },
      oidcSession: {
        logoutPrincipalSession: vi.fn(),
      },
    } as never);

    const ctx = {
      body: undefined,
      cookies: { set: vi.fn() },
      get: vi.fn((name: string) => ({
        "traceparent": `00-${traceId}-2222222222222222-01`,
        "x-request-id": "req-provider",
      }[name.toLowerCase()] ?? "")),
      ip: "203.0.113.10",
      oidc: { route: "authorization" },
      path: "/auth",
      remove: vi.fn(),
      req: {},
      response: { get: vi.fn(() => undefined) },
      set: vi.fn(),
      state: {},
      status: 200,
    };

    await middlewares[0]?.(ctx, async () => undefined);

    expect(ctx.state).toMatchObject({
      requestId: "req-provider",
      traceId,
    });
  });

  it("logs provider server and protocol errors with trace id", () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const provider = {
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
      }),
    } as unknown as Provider;
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const serverErrorContext = {
      body: { error: "server_error" },
      cookies: { set: vi.fn() },
      get: vi.fn(() => ""),
      state: {
        requestId: "req-server",
        traceId,
      },
      status: 500,
      type: "application/json",
    };

    registerProviderEvents(provider, logger as never, {
      cookieName: "global_session",
      cookieSecure: false,
    });

    listeners.get("server_error")?.(
      serverErrorContext,
      new Error("server boom"),
    );
    listeners.get("authorization.error")?.({
      state: {
        requestId: "req-protocol",
        traceId,
      },
    }, Object.assign(new Error("invalid request"), {
      error: "invalid_request",
      name: "InvalidRequest",
      statusCode: 400,
    }));

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      event: SystemLogEvent.OidcProviderServerError,
      sourceApp: LoggerSourceApp.OidcProvider,
      requestId: "req-server",
      traceId,
    }), "OIDC provider server error");
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: SystemLogEvent.OidcProviderProtocolError,
      oidcEvent: "authorization.error",
      requestId: "req-protocol",
      traceId,
      statusCode: 400,
    }), "OIDC authorization.error");
    expect(serverErrorContext).toMatchObject({
      body: { error: "server_error" },
      status: 500,
      type: "application/json",
    });
    expect(serverErrorContext.cookies.set).not.toHaveBeenCalled();
  });

  it("maps Subject Access errors swallowed by the provider error handler", () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const provider = {
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
      }),
    } as unknown as Provider;
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const ctx = {
      body: { error: "server_error" },
      cookies: { set: vi.fn() },
      get: vi.fn(() => ""),
      oidc: { route: "userinfo" },
      state: {
        requestId: "req-subject-access",
        traceId,
      },
      status: 500,
      type: "application/json",
    };

    registerProviderEvents(provider, logger as never, {
      cookieName: "global_session",
      cookieSecure: false,
    });
    listeners.get("server_error")?.(
      ctx,
      new SubjectAccessUnavailableError(),
    );

    expect(ctx.status).toBe(503);
    expect(ctx.body).toEqual({ error: "temporarily_unavailable" });
    expect(ctx.cookies.set).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not expire an unrelated browser Session from a provider server error", () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const provider = {
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
      }),
    } as unknown as Provider;
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    };
    const setCookie = vi.fn();
    const ctx = {
      body: { error: "server_error" },
      cookies: { set: setCookie },
      get: vi.fn((name: string) => name === "cookie"
        ? "global_session=subject-b"
        : ""),
      oidc: { route: "userinfo" },
      state: {
        requestId: "req-unrelated-session",
        traceId,
      },
      status: 500,
      type: "application/json",
    };

    registerProviderEvents(provider, logger as never, {
      cookieName: "global_session",
      cookieSecure: false,
    });
    listeners.get("server_error")?.(
      ctx,
      new SubjectAccessSessionInvalidHttpError(),
    );

    expect(ctx.status).toBe(401);
    expect(ctx.body).toEqual({ error: "invalid_token" });
    expect(setCookie).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not expire an unrelated browser Session for a disabled credential", async () => {
    const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    const provider = {
      middleware: {
        unshift(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) {
          middlewares.unshift(fn);
        },
      },
    } as unknown as Provider;
    registerProviderMiddleware(provider, {
      clientAuthRateLimiter: {
        clear: vi.fn(),
        isBlocked: vi.fn(async () => false),
        recordFailure: vi.fn(),
      },
      env: {
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
        },
      },
      oidcSession: {
        logoutPrincipalSession: vi.fn(),
      },
    } as never);
    const setCookie = vi.fn();
    const ctx = createProviderContext({
      cookie: "global_session=subject-b",
      cookies: { set: setCookie },
      route: "userinfo",
    });

    await middlewares[0]?.(ctx, async () => {
      throw new SubjectAccessSessionInvalidHttpError();
    });

    expect(ctx.status).toBe(401);
    expect(ctx.body).toEqual({ error: "invalid_token" });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("maps disabled browser Sessions to login_required and expires the global cookie at Path=/", async () => {
    const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    const provider = {
      middleware: {
        unshift(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) {
          middlewares.unshift(fn);
        },
      },
    } as unknown as Provider;
    registerProviderMiddleware(provider, {
      clientAuthRateLimiter: {
        clear: vi.fn(),
        isBlocked: vi.fn(async () => false),
        recordFailure: vi.fn(),
      },
      env: {
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
        },
      },
      oidcSession: {
        logoutPrincipalSession: vi.fn(),
      },
    } as never);
    const setCookie = vi.fn();
    const ctx = createProviderContext({
      cookie: "global_session=principal-token",
      cookies: { set: setCookie },
      route: "authorization",
    });

    await middlewares[0]?.(ctx, async () => {
      throw markGlobalSessionCookieError(
        new SubjectAccessSessionInvalidHttpError(),
      );
    });

    expect(ctx.status).toBe(401);
    expect(ctx.body).toEqual({ error: "login_required" });
    expect(setCookie).toHaveBeenCalledWith("global_session", null, expect.objectContaining({
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    }));
  });

  it("maps uncertain Subject Access to temporarily_unavailable without expiring the global cookie", async () => {
    const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    const provider = {
      middleware: {
        unshift(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) {
          middlewares.unshift(fn);
        },
      },
    } as unknown as Provider;
    registerProviderMiddleware(provider, {
      clientAuthRateLimiter: {
        clear: vi.fn(),
        isBlocked: vi.fn(async () => false),
        recordFailure: vi.fn(),
      },
      env: {
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
        },
      },
      oidcSession: {
        logoutPrincipalSession: vi.fn(),
      },
    } as never);
    const setCookie = vi.fn();
    const ctx = createProviderContext({
      cookie: "global_session=principal-token",
      cookies: { set: setCookie },
      route: "authorization",
    });

    await middlewares[0]?.(ctx, async () => {
      throw new SubjectAccessUnavailableError(new Error("redis://secret@subject-access"));
    });

    expect(ctx.status).toBe(503);
    expect(ctx.body).toEqual({ error: "temporarily_unavailable" });
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("expires the global cookie with matching root path after a successful end-session", async () => {
    const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    const provider = {
      middleware: {
        unshift(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) {
          middlewares.unshift(fn);
        },
      },
    } as unknown as Provider;
    const logoutPrincipalSession = vi.fn();
    registerProviderMiddleware(provider, {
      clientAuthRateLimiter: {
        clear: vi.fn(),
        isBlocked: vi.fn(async () => false),
        recordFailure: vi.fn(),
      },
      env: {
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
        },
      },
      oidcSession: { logoutPrincipalSession },
    } as never);
    const setCookie = vi.fn();
    const ctx = createProviderContext({
      cookie: "global_session=principal-token",
      cookies: { set: setCookie },
      route: "end_session_confirm",
    });

    await middlewares[0]?.(ctx, async () => undefined);

    expect(logoutPrincipalSession).toHaveBeenCalledWith("principal-token");
    expect(setCookie).toHaveBeenCalledWith("global_session", null, {
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      overwrite: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("maps disabled end-session cleanup to login_required and expires the cookie", async () => {
    const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    const provider = {
      middleware: {
        unshift(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) {
          middlewares.unshift(fn);
        },
      },
    } as unknown as Provider;
    registerProviderMiddleware(provider, {
      clientAuthRateLimiter: {
        clear: vi.fn(),
        isBlocked: vi.fn(async () => false),
        recordFailure: vi.fn(),
      },
      env: {
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
        },
      },
      oidcSession: {
        logoutPrincipalSession: vi.fn(async () => {
          throw new SubjectAccessSessionInvalidHttpError();
        }),
      },
    } as never);
    const setCookie = vi.fn();
    const ctx = createProviderContext({
      cookie: "global_session=principal-token",
      cookies: { set: setCookie },
      route: "end_session_confirm",
    });

    await middlewares[0]?.(ctx, async () => undefined);

    expect(ctx.status).toBe(401);
    expect(ctx.body).toEqual({ error: "login_required" });
    expect(setCookie).toHaveBeenCalledWith(
      "global_session",
      null,
      expect.objectContaining({ maxAge: 0, path: "/" }),
    );
  });

  it("maps unavailable end-session cleanup without expiring the cookie", async () => {
    const middlewares: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = [];
    const provider = {
      middleware: {
        unshift(fn: (ctx: any, next: () => Promise<void>) => Promise<void>) {
          middlewares.unshift(fn);
        },
      },
    } as unknown as Provider;
    registerProviderMiddleware(provider, {
      clientAuthRateLimiter: {
        clear: vi.fn(),
        isBlocked: vi.fn(async () => false),
        recordFailure: vi.fn(),
      },
      env: {
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
        },
      },
      oidcSession: {
        logoutPrincipalSession: vi.fn(async () => {
          throw new SubjectAccessUnavailableError();
        }),
      },
    } as never);
    const setCookie = vi.fn();
    const ctx = createProviderContext({
      cookie: "global_session=principal-token",
      cookies: { set: setCookie },
      route: "end_session_confirm",
    });

    await middlewares[0]?.(ctx, async () => undefined);

    expect(ctx.status).toBe(503);
    expect(ctx.body).toEqual({ error: "temporarily_unavailable" });
    expect(setCookie).not.toHaveBeenCalled();
  });
});

function createProviderContext(input: {
  cookie?: string;
  cookies: { set: ReturnType<typeof vi.fn> };
  route: string;
}) {
  return {
    body: undefined,
    cookies: input.cookies,
    get: vi.fn((name: string) => name.toLowerCase() === "cookie" ? input.cookie ?? "" : ""),
    ip: "203.0.113.10",
    oidc: { route: input.route },
    path: "/auth",
    remove: vi.fn(),
    req: {},
    response: { get: vi.fn(() => undefined) },
    set: vi.fn(),
    state: {},
    status: 200,
    type: undefined,
  };
}
