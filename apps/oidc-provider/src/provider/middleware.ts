import type Provider from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type { ClientAuthRateLimiter } from "../security/client-auth-rate-limit.ts";
import { getCookieValue } from "../interaction/global-session.ts";
import { parseBasicClientId } from "../security/client-auth-rate-limit.ts";
import { setOidcRoute } from "./request-route.ts";

export interface ProviderMiddlewareGlobalSessionStore {
  remove: (sessionId: string) => Promise<void>;
}

export interface ProviderMiddlewareTokenStore {
  revokeGlobalSessionAccessTokens: (globalSessionId: string) => Promise<unknown>;
}

export interface RegisterProviderMiddlewareDeps {
  env: OidcProviderEnv;
  clientAuthRateLimiter: ClientAuthRateLimiter;
  globalSessions: ProviderMiddlewareGlobalSessionStore;
  tokens: ProviderMiddlewareTokenStore;
}

export function registerProviderMiddleware(provider: Provider, deps: RegisterProviderMiddlewareDeps) {
  provider.middleware.unshift(async (ctx, next) => {
    ctx.state.requestId = ctx.get("x-request-id") || crypto.randomUUID();
    ctx.set("x-request-id", ctx.state.requestId);
    const globalSessionId = getCookieValue(ctx.get("cookie"), deps.env.OIDC_GLOBAL_SESSION_COOKIE);
    const basicClientId = ctx.path === "/token"
      ? parseBasicClientId(ctx.get("authorization"))
      : null;
    if (basicClientId && await deps.clientAuthRateLimiter.isBlocked(basicClientId, ctx.ip)) {
      ctx.status = 401;
      ctx.type = "application/json";
      ctx.body = { error: "invalid_client" };
      return;
    }

    await next();

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
    if (ctx.oidc?.route === "end_session_confirm" && ctx.status < 400 && globalSessionId) {
      await deps.globalSessions.remove(globalSessionId);
      await deps.tokens.revokeGlobalSessionAccessTokens(globalSessionId);
      ctx.cookies.set(deps.env.OIDC_GLOBAL_SESSION_COOKIE, null, {
        httpOnly: true,
        overwrite: true,
        sameSite: "lax",
        secure: deps.env.NODE_ENV === "production",
      });
    }
  });
}
