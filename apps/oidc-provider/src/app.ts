import type { Redis } from "ioredis";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { errors, KoaContextWithOIDC } from "oidc-provider";
import type { OidcProviderEnv } from "./env.ts";
import type { OidcLogger } from "./lib/logger.ts";
import type { SigningKey } from "./security/signing-keys.ts";
import { createServer } from "node:http";
import { SystemLogEvent } from "@iam/api-core/logger";
import { revokeOidcAccessTokensForGlobalSession } from "@iam/api-core/oidc";
import { removeGlobalSession } from "@iam/api-core/session";
import Provider from "oidc-provider";
import { getCookieValue, GlobalSessionResolver } from "./interaction/global-session.ts";
import { OidcInteractionHandler } from "./interaction/handler.ts";
import { createIamInteractionPolicy } from "./interaction/policy.ts";
import { OidcClaimsService } from "./provider/claims.ts";
import { createProviderConfiguration } from "./provider/configuration.ts";
import { OidcAccountRepository } from "./repositories/account.repository.ts";
import { OidcAuthorizationRepository } from "./repositories/authorization.repository.ts";
import { OidcClientRepository, OidcClientSecretRepository } from "./repositories/client.repository.ts";
import { ClientAuthRateLimiter, parseBasicClientId } from "./security/client-auth-rate-limit.ts";
import { createOidcAdapterFactory } from "./storage/redis-adapter.ts";

function ensureRequestId(request: IncomingMessage, response: ServerResponse) {
  const incoming = request.headers["x-request-id"];
  const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || crypto.randomUUID();
  request.headers["x-request-id"] = requestId;
  response.setHeader("x-request-id", requestId);
  return requestId;
}

export type CreateOidcProviderOptions = {
  env: OidcProviderEnv;
  redis: Redis;
  logger: OidcLogger;
  signingKeys: {
    current: SigningKey;
    previous?: SigningKey;
  };
};

export function createOidcProvider(options: CreateOidcProviderOptions) {
  const clients = new OidcClientRepository(options.redis, options.env.OIDC_CLIENT_CACHE_TTL_SECONDS);
  const clientSecrets = new OidcClientSecretRepository();
  const accounts = new OidcAccountRepository();
  const authorization = new OidcAuthorizationRepository();
  const globalSessions = new GlobalSessionResolver(options.redis, accounts, options.env);
  const claims = new OidcClaimsService(options.redis, accounts, authorization, clients, globalSessions);
  const clientAuthRateLimiter = new ClientAuthRateLimiter(
    options.redis,
    options.env.OIDC_CLIENT_AUTH_FAILURE_LIMIT,
    options.env.OIDC_CLIENT_AUTH_FAILURE_WINDOW_SECONDS,
  );
  const provider = new Provider(options.env.OIDC_ISSUER, createProviderConfiguration(options.env, {
    adapter: createOidcAdapterFactory(options.redis, clients),
    claims,
    currentSigningKey: options.signingKeys.current,
    previousSigningKey: options.signingKeys.previous,
    interactionPolicy: createIamInteractionPolicy(globalSessions),
  }));

  provider.proxy = options.env.OIDC_TRUST_PROXY;
  provider.Client.prototype.compareClientSecret = async function compareClientSecret(actual: string) {
    return await clientSecrets.verify(this.clientId, actual);
  };
  provider.Client.prototype.redirectUriAllowed = function redirectUriAllowed(actual: string) {
    return this.redirectUris?.includes(actual) ?? false;
  };
  provider.Client.prototype.postLogoutRedirectUriAllowed = function postLogoutRedirectUriAllowed(actual: string) {
    return this.postLogoutRedirectUris?.includes(actual) ?? false;
  };
  const authorizationCodeModel = provider.AuthorizationCode as typeof provider.AuthorizationCode & {
    IN_PAYLOAD: string[];
  };
  const authorizationCodePayload = authorizationCodeModel.IN_PAYLOAD;
  Object.defineProperty(authorizationCodeModel, "IN_PAYLOAD", {
    configurable: true,
    get: () => [...authorizationCodePayload, "globalSessionExpiresAt"],
  });

  provider.middleware.unshift(async (ctx, next) => {
    ctx.state.requestId = ctx.get("x-request-id") || crypto.randomUUID();
    ctx.set("x-request-id", ctx.state.requestId);
    const globalSessionId = getCookieValue(ctx.get("cookie"), options.env.OIDC_GLOBAL_SESSION_COOKIE);
    const basicClientId = ctx.path === "/token"
      ? parseBasicClientId(ctx.get("authorization"))
      : null;
    if (basicClientId && await clientAuthRateLimiter.isBlocked(basicClientId, ctx.ip)) {
      ctx.status = 401;
      ctx.type = "application/json";
      ctx.body = { error: "invalid_client" };
      return;
    }

    await next();

    if (ctx.response.get("access-control-allow-origin") === "*")
      ctx.remove("access-control-allow-origin");
    if (basicClientId) {
      const body = ctx.body as { error?: string } | undefined;
      if (body?.error === "invalid_client")
        await clientAuthRateLimiter.recordFailure(basicClientId, ctx.ip);
      else if (ctx.status >= 200 && ctx.status < 300)
        await clientAuthRateLimiter.clear(basicClientId, ctx.ip);
    }
    if (ctx.oidc?.route === "end_session_confirm" && ctx.status < 400 && globalSessionId) {
      await removeGlobalSession(options.redis, globalSessionId);
      await revokeOidcAccessTokensForGlobalSession(options.redis, globalSessionId);
      ctx.cookies.set(options.env.OIDC_GLOBAL_SESSION_COOKIE, null, {
        httpOnly: true,
        overwrite: true,
        sameSite: "lax",
        secure: options.env.NODE_ENV === "production",
      });
    }
  });

  provider.on("server_error", (ctx, error) => {
    options.logger.error({
      event: SystemLogEvent.OidcProviderServerError,
      err: error,
      sourceApp: "iam-oidc-provider",
      requestId: ctx.state.requestId,
      errorName: error.name,
      errorMessage: error.message,
    }, "OIDC provider server error");
  });
  const logProtocolError = (event: string) => (ctx: KoaContextWithOIDC, error: errors.OIDCProviderError) => {
    options.logger.warn({
      event: SystemLogEvent.OidcProviderProtocolError,
      sourceApp: "iam-oidc-provider",
      oidcEvent: event,
      errorCode: error.error,
      errorName: error.name,
      errorMessage: error.message,
      requestId: ctx.state.requestId,
      statusCode: error.statusCode,
    }, `OIDC ${event}`);
  };
  provider.on("authorization.error", logProtocolError("authorization.error"));
  provider.on("grant.error", logProtocolError("grant.error"));
  provider.on("userinfo.error", logProtocolError("userinfo.error"));
  provider.on("end_session.error", logProtocolError("end_session.error"));

  return {
    provider,
    interactions: new OidcInteractionHandler(provider, options.redis, clients, globalSessions, options.env),
    env: options.env,
    logger: options.logger,
  };
}

export function createOidcHttpServer(
  runtime: ReturnType<typeof createOidcProvider>,
  redis: Redis,
) {
  const { provider, interactions, env, logger } = runtime;
  const callback = provider.callback();
  const publicOrigin = new URL(env.OIDC_PUBLIC_ORIGIN);
  return createServer(async (request, response) => {
    const requestId = ensureRequestId(request, response);
    try {
      if (request.url === "/health") {
        await redis.ping();
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        return;
      }
      const url = new URL(request.url ?? "/", env.OIDC_PUBLIC_ORIGIN);
      if (url.pathname === "/oidc/session/end"
        && url.searchParams.has("post_logout_redirect_uri")
        && !url.searchParams.has("id_token_hint")) {
        response.writeHead(400, {
          "cache-control": "no-store",
          "content-type": "application/json",
        });
        response.end(JSON.stringify({ error: "invalid_request" }));
        return;
      }
      if (url.pathname.startsWith("/oidc/interaction/")) {
        await interactions.handleInteraction(request, response);
        return;
      }
      if (url.pathname === "/oidc/resume") {
        await interactions.handleResume(request, response);
        return;
      }
      if (url.pathname !== "/oidc" && !url.pathname.startsWith("/oidc/")) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      (request as typeof request & { originalUrl?: string }).originalUrl = request.url;
      request.url = `${url.pathname.slice("/oidc".length) || "/"}${url.search}`;
      request.headers.host = publicOrigin.host;
      request.headers["x-forwarded-host"] = publicOrigin.host;
      request.headers["x-forwarded-proto"] = publicOrigin.protocol.slice(0, -1);
      callback(request, response);
    }
    catch (error) {
      logger.error({
        event: SystemLogEvent.OidcProviderHttpRequestFailed,
        err: error,
        sourceApp: "iam-oidc-provider",
        requestId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown OIDC HTTP request failure",
      }, "OIDC HTTP request failed");
      if (!response.headersSent) {
        response.writeHead(request.url === "/health" ? 503 : 500, {
          "cache-control": "no-store",
          "content-type": "application/json",
        });
      }
      if (!response.writableEnded)
        response.end(JSON.stringify({ error: request.url === "/health" ? "unavailable" : "server_error" }));
    }
  });
}
