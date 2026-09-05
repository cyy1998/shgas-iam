import type Provider from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type { ClientAuthRateLimiter } from "../security/client-auth-rate-limit.ts";
import { getTraceIdFromHeaders } from "@iam/api-core/logger";
import { getCookieValue } from "../interaction/global-session.ts";
import { isGlobalSessionCookieError } from "../session/global-session-error-provenance.ts";
import { parseBasicClientId } from "./client/basic-client-auth.ts";
import { setOidcRoute } from "./request-route.ts";
import { handleOidcSubjectAccessProtocolError } from "./subject-access-protocol.ts";

export interface ProviderMiddlewareOidcSessionAdapter {
  logoutPrincipalSession: (token: string | undefined) => Promise<unknown>;
}

export interface RegisterProviderMiddlewareDeps {
  env: OidcProviderEnv;
  clientAuthRateLimiter: ClientAuthRateLimiter;
  oidcSession: ProviderMiddlewareOidcSessionAdapter;
}

export function registerProviderMiddleware(provider: Provider, deps: RegisterProviderMiddlewareDeps) {
  provider.middleware.unshift(async (ctx, next) => {
    ctx.state.requestId = ctx.get("x-request-id") || crypto.randomUUID();
    ctx.state.traceId = getTraceIdFromHeaders(name => ctx.get(name)) ?? null;
    ctx.set("x-request-id", ctx.state.requestId);
    const principalSessionToken = getCookieValue(ctx.get("cookie"), deps.env.oidc.globalSessionCookie) ?? undefined;
    const basicClientId = ctx.path === "/token"
      ? parseBasicClientId(ctx.get("authorization"))
      : null;
    if (basicClientId && await deps.clientAuthRateLimiter.isBlocked(basicClientId, ctx.ip)) {
      ctx.status = 401;
      ctx.type = "application/json";
      ctx.body = { error: "invalid_client" };
      return;
    }

    try {
      await next();
    }
    catch (error) {
      if (handleOidcSubjectAccessProtocolError(error, ctx, {
        cookieName: deps.env.oidc.globalSessionCookie,
        cookieSecure: deps.env.oidc.cookieSecure,
        clearGlobalSessionCookie:
          principalSessionToken !== undefined
          && isGlobalSessionCookieError(error),
      })) {
        return;
      }
      throw error;
    }

    if (ctx.response.get("access-control-allow-origin") === "*")
      ctx.remove("access-control-allow-origin");
    if (ctx.oidc?.route)
      setOidcRoute(ctx.req, ctx.oidc.route);
    if (basicClientId) {
      const body = ctx.body as { error?: string } | undefined;
      if (body?.error === "invalid_client")
        await deps.clientAuthRateLimiter.recordFailure(basicClientId, ctx.ip);
      else if (ctx.status >= 200 && ctx.status < 300)
        await deps.clientAuthRateLimiter.clear(basicClientId, ctx.ip);
    }
    if (ctx.oidc?.route === "end_session_confirm" && ctx.status < 400 && principalSessionToken) {
      try {
        await deps.oidcSession.logoutPrincipalSession(principalSessionToken);
      }
      catch (error) {
        if (handleOidcSubjectAccessProtocolError(error, ctx, {
          cookieName: deps.env.oidc.globalSessionCookie,
          cookieSecure: deps.env.oidc.cookieSecure,
          clearGlobalSessionCookie: true,
        })) {
          return;
        }
        throw error;
      }
      ctx.cookies.set(deps.env.oidc.globalSessionCookie, null, {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        overwrite: true,
        path: "/",
        sameSite: "lax",
        secure: deps.env.oidc.cookieSecure,
      });
    }
  });
}
