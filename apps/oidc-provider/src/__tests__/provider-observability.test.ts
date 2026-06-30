import type Provider from "oidc-provider";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { describe, expect, it, vi } from "vitest";
import { registerProviderEvents } from "../provider/events.ts";
import { registerProviderMiddleware } from "../provider/middleware.ts";

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
        traceparent: `00-${traceId}-2222222222222222-01`,
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

    registerProviderEvents(provider, logger as never);

    listeners.get("server_error")?.({
      state: {
        requestId: "req-server",
        traceId,
      },
    }, new Error("server boom"));
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
  });
});
