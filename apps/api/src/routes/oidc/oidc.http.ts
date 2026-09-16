import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import type {
  OidcAuthorization,
  OidcAuthorizationResult,
  OidcBrowserInput,
  OidcClientAuthRateLimiter,
  OidcLogout,
  OidcLogoutEffect,
  OidcTokens,
  OidcUserInfo,
} from "@iam/oidc";
import type { OidcAuthorizationResponse } from "@iam/oidc/wire";
import type { Context } from "hono";
import { Buffer } from "node:buffer";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { getRequestId, getTraceId } from "@iam/api-core/core/request-context";
import { appendNavigationParameters } from "@iam/contracts";
import { OidcExchangeFailure, OidcLogoutFailure, OidcProtocolError } from "@iam/oidc";
import {
  OidcAuthorizationResponseSchema,
  OidcErrorSchema,
  OidcLoginGuardSchema,
  OidcTokenResponseSchema,
} from "@iam/oidc/wire";
import { Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export interface OidcRequestContext {
  requestId: string;
  traceId: string | null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Formal candidate transport. It consumes protocol results and owns all HTTP/Cookie rendering. */
export function createOidcHttpRouter(options: {
  authorization: OidcAuthorization;
  tokens?: OidcTokens;
  userInfo?: OidcUserInfo;
  logout?: OidcLogout;
  clientAuthRateLimiter?: OidcClientAuthRateLimiter;
  trustProxy?: boolean;
  reportProtocolFailure?: (
    failure: OidcRequestContext & {
      errorCode: string;
      outcome: "protocol" | "unavailable";
      path: string;
      statusCode: number;
    },
  ) => void;
  reportLogoutEffect?: (effect: OidcLogoutEffect | OidcLogoutFailure, request: OidcRequestContext) => void;
  reportExchangeFailure?: (failure: OidcExchangeFailure, request: OidcRequestContext) => void;
  operations: ReturnType<typeof createSubjectAccessOperations>;
  issuers: { internal: string; external: string };
  loginEndpoint: string;
  secureCookies: boolean;
}) {
  const issuers = Object.fromEntries((["internal", "external"] as const).map((entry) => {
    const value = options.issuers[entry];
    const issuer = new URL(value);
    if (
      !["http:", "https:"].includes(issuer.protocol)
      || issuer.pathname !== "/oidc"
      || issuer.search
      || issuer.hash
      || issuer.username
      || issuer.password
    ) {
      throw new Error("OIDC issuer must end in /oidc");
    }
    return [entry, issuer.href];
  }));
  function configuredIssuer(entry: string | undefined) {
    return entry === "internal" || entry === "external" ? issuers[entry] : undefined;
  }
  function requestIssuer(c: Context) {
    const issuer = configuredIssuer(c.req.header("X-IAM-Entry-Network"));
    if (!issuer)
      throw new OidcProtocolError("invalid_request", "A trusted IAM entry is required");
    return issuer;
  }
  const router = new Hono();
  const requestContexts = new WeakMap<Request, OidcRequestContext>();
  function requestContext(c: Context): OidcRequestContext {
    let value = requestContexts.get(c.req.raw);
    if (!value) {
      value = {
        requestId: getRequestId(c) ?? c.req.header("x-request-id") ?? crypto.randomUUID(),
        traceId: getTraceId(c),
      };
      requestContexts.set(c.req.raw, value);
    }
    return value;
  }
  function clientIp(c: Context) {
    if (options.trustProxy ?? true) {
      const forwarded = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
      if (forwarded)
        return forwarded;
    }
    const peer = getConnInfo(c).remote.address;
    if (!peer)
      throw new OidcProtocolError("temporarily_unavailable", "Client address unavailable", 503);
    return peer;
  }
  const cookieOptions = {
    path: "/oidc",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: options.secureCookies,
  };
  function browser(c: Context): OidcBrowserInput {
    return {
      globalSessionToken: getCookie(c, "global_session"),
      browserBinding: getCookie(c, "oidc_interaction_binding"),
      completion: getCookie(c, "oidc_login_completion"),
    };
  }
  function respond(c: Context, response: OidcAuthorizationResponse) {
    const result = OidcAuthorizationResponseSchema.parse(response);
    if (result.responseMode === "form_post") {
      const fields = Object.entries(result.parameters)
        .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
        .join("");
      c.header(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'unsafe-inline'; form-action ${new URL(result.redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`,
      );
      return c.html(
        `<!doctype html><html><head><meta charset="utf-8"><title>Continue</title></head><body><form method="post" action="${escapeHtml(result.redirectUri)}">${fields}<noscript><button type="submit">Continue</button></noscript></form><script>document.forms[0].submit()</script></body></html>`,
      );
    }
    const target = new URL(result.redirectUri);
    const parameters = new URLSearchParams(result.parameters);
    if (result.responseMode === "fragment")
      target.hash = parameters.toString();
    else parameters.forEach((value, key) => target.searchParams.set(key, value));
    return c.redirect(target.href, HttpStatusCodes.SEE_OTHER);
  }
  function result(c: Context, value: OidcAuthorizationResult) {
    if (value.clearGlobalSessionCookie)
      deleteCookie(c, "global_session", { path: "/" });
    if (value.kind === "response")
      return respond(c, value.response);
    setCookie(c, "oidc_interaction_binding", value.browserBinding, { ...cookieOptions, maxAge: value.ttl });
    return c.redirect(
      appendNavigationParameters(options.loginEndpoint, new URLSearchParams({ oidcReturn: value.handle })),
    );
  }
  router.use("*", async (c, next) => {
    c.header("X-Request-Id", requestContext(c).requestId);
    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
    c.header("Referrer-Policy", "no-referrer");
    requestIssuer(c);
    await next();
  });
  router.onError((error, c) => {
    if (error instanceof OidcLogoutFailure)
      options.reportLogoutEffect?.(error, requestContext(c));
    if (error instanceof OidcExchangeFailure) {
      options.reportExchangeFailure?.(error, requestContext(c));
      if (error.failure instanceof Error)
        error = error.failure;
    }
    if (error instanceof OidcProtocolError) {
      options.reportProtocolFailure?.({
        ...requestContext(c),
        errorCode: error.errorCode,
        outcome: error.status >= 500 ? "unavailable" : "protocol",
        path: new URL(c.req.url).pathname,
        statusCode: error.status,
      });
      if (error.clearGlobalSessionCookie)
        deleteCookie(c, "global_session", { path: "/" });
      if (error.response)
        return respond(c, error.response);
      if (error.status === 503)
        c.header("Retry-After", "3");
      if (new URL(c.req.url).pathname.endsWith("/me")) {
        const realm = configuredIssuer(c.req.header("X-IAM-Entry-Network")) ?? "oidc";
        c.header("WWW-Authenticate", `Bearer realm="${realm}", error="${error.errorCode}"`);
      }
      else if (error.status === 401) {
        c.header("WWW-Authenticate", "Basic realm=\"oidc\"");
      }
      return c.json(
        OidcErrorSchema.parse({ error: error.errorCode, error_description: error.description }),
        error.status,
      );
    }
    options.reportProtocolFailure?.({
      ...requestContext(c),
      errorCode: "temporarily_unavailable",
      outcome: "unavailable",
      path: new URL(c.req.url).pathname,
      statusCode: 503,
    });
    // Unknown dependency outcomes stay local and preserve the recoverable browser cookies.
    c.header("Retry-After", "3");
    return c.json(
      OidcErrorSchema.parse({
        error: "temporarily_unavailable",
        error_description: "OIDC service unavailable",
      }),
      HttpStatusCodes.SERVICE_UNAVAILABLE,
    );
  });
  router.on(["GET", "OPTIONS"], "/.well-known/openid-configuration", (c) => {
    c.header("Vary", "Origin");
    const origin = c.req.header("Origin");
    if (origin)
      c.header("Access-Control-Allow-Origin", origin);
    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", "GET");
      c.header("Access-Control-Max-Age", "3600");
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    }
    return c.json({
      ...options.authorization.discovery(requestIssuer(c)),
      ...options.tokens?.discovery(requestIssuer(c)),
      ...options.logout?.discovery(requestIssuer(c)),
      ...(options.userInfo ? { userinfo_endpoint: `${requestIssuer(c)}/me` } : {}),
    });
  });
  if (options.logout) {
    const logout = options.logout;
    const logoutCookies = { ...cookieOptions, path: "/oidc/session/end" };
    const logoutBrowser = (c: Context) => ({
      globalSessionToken: getCookie(c, "global_session"),
      binding: getCookie(c, "oidc_logout_binding"),
      handle: getCookie(c, "oidc_logout_request"),
    });
    async function logoutParameters(c: Context) {
      if (c.req.method === "GET")
        return new URL(c.req.url).searchParams;
      if (
        c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase()
        !== "application/x-www-form-urlencoded"
      ) {
        throw new OidcProtocolError("invalid_request", "Logout POST requires form encoding");
      }
      return new URLSearchParams(await c.req.text());
    }
    router.on(["GET", "POST"], "/session/end", async (c) => {
      const parameters = await logoutParameters(c);
      const value = await options.operations.run(operation =>
        logout.forOperation(operation, requestIssuer(c)).begin(parameters, logoutBrowser(c)),
      );
      if (value.clearGlobalSessionCookie)
        deleteCookie(c, "global_session", { path: "/" });
      setCookie(c, "oidc_logout_binding", value.binding, { ...logoutCookies, maxAge: value.ttl });
      setCookie(c, "oidc_logout_request", value.handle, { ...logoutCookies, maxAge: value.ttl });
      c.header(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'unsafe-inline'; form-action 'self' ${new URL(value.redirectUri ?? requestIssuer(c)).origin}; base-uri 'none'; frame-ancestors 'none'`,
      );
      const buttons = value.autoSubmit
        ? "<input type=\"hidden\" name=\"logout\" value=\"yes\"><noscript><button type=\"submit\">Continue</button></noscript>"
        : "<button type=\"submit\" name=\"logout\" value=\"yes\">Yes, sign me out</button><button type=\"submit\">No, stay signed in</button>";
      return c.html(
        `<!doctype html><html><head><meta charset="utf-8"><title>Sign out</title></head><body><h1>Sign out</h1><p>Do you want to sign out of IAM?</p><form id="op.logoutForm" method="post" action="/oidc/session/end/confirm"><input type="hidden" name="xsrf" value="${escapeHtml(value.xsrf)}">${buttons}</form>${value.autoSubmit ? "<script>document.forms[0].submit()</script>" : ""}</body></html>`,
      );
    });
    router.post("/session/end/confirm", async (c) => {
      const parameters = await logoutParameters(c);
      const value = await options.operations.run(operation =>
        logout.forOperation(operation, requestIssuer(c)).confirm(parameters, logoutBrowser(c)),
      );
      options.reportLogoutEffect?.(value.effect, requestContext(c));
      if (value.clearGlobalSessionCookie) {
        deleteCookie(c, "global_session", {
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: options.secureCookies,
        });
      }
      deleteCookie(c, "oidc_logout_binding", logoutCookies);
      deleteCookie(c, "oidc_logout_request", logoutCookies);
      return c.redirect(value.redirectUri, HttpStatusCodes.SEE_OTHER);
    });
    router.get("/session/end/success", c =>
      c.html(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>IAM</title></head><body><p>The request is complete. You may close this window.</p></body></html>",
      ));
  }
  if (options.userInfo) {
    const userInfo = options.userInfo;
    router.options("/me", (c) => {
      c.header("Vary", "Origin");
      const origin = c.req.header("Origin");
      if (origin && c.req.header("Access-Control-Request-Method")) {
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Access-Control-Allow-Methods", "GET, POST");
        c.header("Access-Control-Max-Age", "3600");
        const headers = c.req.header("Access-Control-Request-Headers");
        if (headers)
          c.header("Access-Control-Allow-Headers", headers);
      }
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    });
    router.on(["GET", "POST"], "/me", async (c) => {
      c.header("Vary", "Origin");
      const query = new URL(c.req.url).searchParams;
      if (query.has("access_token")) {
        throw new OidcProtocolError(
          "invalid_request",
          "Access Tokens must not be provided via query parameter",
        );
      }
      const form
        = c.req.method === "POST"
          && c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase()
          === "application/x-www-form-urlencoded"
          ? new URLSearchParams(await c.req.text())
          : new URLSearchParams();
      const authorization = c.req.header("Authorization");
      if (
        form.getAll("access_token").length > 1
        || form.getAll("scope").length > 1
        || query.getAll("scope").length > 1
        || (authorization && form.get("access_token"))
      ) {
        throw new OidcProtocolError("invalid_request", "Access Token must use one authentication mechanism");
      }
      let bearer = form.get("access_token");
      if (authorization) {
        bearer = /^Bearer (\S+)$/iu.exec(authorization)?.[1] ?? null;
        if (!bearer)
          throw new OidcProtocolError("invalid_request", "Invalid Bearer authorization header");
      }
      if (!bearer) {
        c.header("WWW-Authenticate", `Bearer realm="${requestIssuer(c)}"`);
        return c.json(
          OidcErrorSchema.parse({ error: "invalid_token", error_description: "Access Token is required" }),
          HttpStatusCodes.UNAUTHORIZED,
        );
      }
      const origin = c.req.header("Origin");
      return await options.operations.run(async operation =>
        c.json(
          await userInfo
            .forOperation(operation, requestIssuer(c))
            .read(bearer, origin, () => c.header("Access-Control-Allow-Origin", origin!)),
        ),
      );
    });
  }
  if (options.tokens) {
    const tokens = options.tokens;
    router.on(["GET", "OPTIONS"], "/jwks", (c) => {
      c.header("Vary", "Origin");
      const origin = c.req.header("Origin");
      if (origin)
        c.header("Access-Control-Allow-Origin", origin);
      if (c.req.method === "OPTIONS") {
        c.header("Access-Control-Allow-Methods", "GET");
        c.header("Access-Control-Max-Age", "3600");
        return c.body(null, HttpStatusCodes.NO_CONTENT);
      }
      return c.json(tokens.jwks());
    });
    router.options("/token", (c) => {
      c.header("Vary", "Origin");
      const origin = c.req.header("Origin");
      if (origin && c.req.header("Access-Control-Request-Method")) {
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Access-Control-Allow-Methods", "POST");
        c.header("Access-Control-Max-Age", "3600");
        const headers = c.req.header("Access-Control-Request-Headers");
        if (headers)
          c.header("Access-Control-Allow-Headers", headers);
      }
      return c.body(null, HttpStatusCodes.NO_CONTENT);
    });
    router.post("/token", async (c) => {
      if (
        c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase()
        !== "application/x-www-form-urlencoded"
      ) {
        throw new OidcProtocolError("invalid_request", "Token POST requires form encoding");
      }
      const parameters = new URLSearchParams(await c.req.text());
      let clientId = parameters.get("client_id") ?? "";
      let clientSecret: string | undefined;
      let authentication: "none" | "client_secret_basic" = "none";
      const authorization = c.req.header("Authorization");
      if (authorization) {
        const encoded = /^Basic ([A-Z0-9+/]+={0,2})$/iu.exec(authorization)?.[1];
        if (!encoded)
          throw new OidcProtocolError("invalid_request", "Invalid client authentication");
        const decoded = Buffer.from(encoded, "base64").toString("utf8");
        const colon = decoded.indexOf(":");
        try {
          if (colon < 0)
            throw new Error("Missing separator");
          const decode = (value: string) => decodeURIComponent(value.replaceAll("+", " "));
          const basicClient = decode(decoded.slice(0, colon));
          if (clientId && clientId !== basicClient)
            throw new Error("Client mismatch");
          clientId = basicClient;
          clientSecret = decode(decoded.slice(colon + 1));
          if (!clientSecret || !/^[\x20-\x7E]+$/u.test(clientId) || !/^[\x20-\x7E]+$/u.test(clientSecret))
            throw new Error("Invalid Basic characters");
          authentication = "client_secret_basic";
        }
        catch {
          throw new OidcProtocolError("invalid_request", "Invalid client authentication");
        }
      }
      if (!clientId)
        throw new OidcProtocolError("invalid_request", "client_id is required");
      const known = ["client_id", "code", "grant_type", "redirect_uri", "code_verifier"];
      const invalidParameters
        = known.some(key => parameters.getAll(key).length > 1) || parameters.has("client_secret");
      const origin = c.req.header("Origin");
      c.header("Vary", "Origin");
      const ip = authentication === "client_secret_basic" && options.clientAuthRateLimiter ? clientIp(c) : "";
      if (
        authentication === "client_secret_basic"
        && (await options.clientAuthRateLimiter?.isBlocked(clientId, ip))
      ) {
        throw new OidcProtocolError("invalid_client", "Client authentication failed", 401);
      }
      try {
        const response = await options.operations.run(operation =>
          tokens.forOperation(operation, requestIssuer(c)).exchange(
            {
              clientId,
              clientSecret,
              authentication,
              code: parameters.get("code") ?? "",
              grantType: parameters.get("grant_type") ?? "",
              redirectUri: parameters.get("redirect_uri") ?? undefined,
              codeVerifier: parameters.get("code_verifier") ?? undefined,
              invalidParameters,
              origin,
              allowOrigin: () => c.header("Access-Control-Allow-Origin", origin!),
            },
            async (value) => {
              const response = c.json(OidcTokenResponseSchema.parse(value));
              if (authentication === "client_secret_basic")
                await options.clientAuthRateLimiter?.clear(clientId, ip);
              return response;
            },
          ),
        );
        return response;
      }
      catch (error) {
        if (
          authentication === "client_secret_basic"
          && error instanceof OidcProtocolError
          && error.errorCode === "invalid_client"
        ) {
          await options.clientAuthRateLimiter?.recordFailure(clientId, ip);
        }
        throw error;
      }
    });
  }
  router.on(["GET", "POST"], "/auth", async (c) => {
    let parameters = new URL(c.req.url).searchParams;
    if (c.req.method === "POST") {
      if (
        c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase()
        !== "application/x-www-form-urlencoded"
      ) {
        throw new OidcProtocolError("invalid_request", "Authorization POST requires form encoding");
      }
      parameters = new URLSearchParams(await c.req.text());
    }
    return result(
      c,
      await options.operations.run(operation =>
        options.authorization.forOperation(operation, requestIssuer(c)).authorize(parameters, browser(c)),
      ),
    );
  });
  router.get("/login-guard", async (c) => {
    const value = await options.operations.run(operation =>
      options.authorization
        .forOperation(operation, requestIssuer(c))
        .checkLoginContinuation(c.req.query("oidcReturn") ?? "", browser(c)),
    );
    if (value.clearGlobalSessionCookie)
      deleteCookie(c, "global_session", { path: "/" });
    if (value.completion)
      setCookie(c, "oidc_login_completion", value.completion, { ...cookieOptions, maxAge: value.ttl });
    return c.json(OidcLoginGuardSchema.parse({ decision: value.decision }));
  });
  router.get("/resume", async (c) => {
    const value = await options.operations.run(operation =>
      options.authorization.forOperation(operation, requestIssuer(c)).resume(c.req.query("oidcReturn") ?? "", browser(c)),
    );
    if (value.kind === "response" && "code" in value.response.parameters)
      deleteCookie(c, "oidc_login_completion", cookieOptions);
    return result(c, value);
  });
  return router;
}
