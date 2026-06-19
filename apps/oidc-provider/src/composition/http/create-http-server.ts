import type { IncomingMessage, ServerResponse } from "node:http";
import type Provider from "oidc-provider";
import type { OidcProviderEnv } from "../../env.ts";
import type { OidcInteractionHandler } from "../../interaction/handler.ts";
import type { OidcLogger } from "../../lib/logger.ts";
import { createServer } from "node:http";
import {
  buildHttpRequestLogFields,
  getStatusLogLevel,
  LoggerSourceApp,
  SystemLogEvent,
} from "@iam/api-core/logger";
import { getOidcRoute } from "../../provider/request-route.ts";

export { OIDC_REQUEST_ROUTE_SYMBOL } from "../../provider/request-route.ts";

export interface OidcHttpHealthCheck {
  ping: () => Promise<unknown>;
}

export interface OidcHttpRuntime {
  provider: Pick<Provider, "callback">;
  interactions: OidcInteractionHandler;
  env: Pick<OidcProviderEnv, "OIDC_PUBLIC_ORIGIN">;
  logger: Pick<OidcLogger, "info" | "warn" | "error">;
  health: OidcHttpHealthCheck;
}

function ensureRequestId(request: IncomingMessage, response: ServerResponse) {
  const incoming = request.headers["x-request-id"];
  const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) || crypto.randomUUID();
  request.headers["x-request-id"] = requestId;
  response.setHeader("x-request-id", requestId);
  return requestId;
}

function getOriginalPath(requestUrl: string | undefined, publicOrigin: string) {
  return new URL(requestUrl ?? "/", publicOrigin).pathname;
}

function classifyOidcHttpRoute(pathname: string) {
  if (pathname === "/health")
    return "/health";
  if (pathname.startsWith("/oidc/interaction/"))
    return "/oidc/interaction/:uid";
  if (pathname === "/oidc/resume")
    return "/oidc/resume";
  if (pathname === "/oidc" || pathname.startsWith("/oidc/"))
    return "/oidc/*";
  return "not_found";
}

function logHttpRequestCompleted(
  logger: Pick<OidcLogger, "info" | "warn" | "error">,
  request: IncomingMessage,
  route: string,
  requestId: string,
  startedAt: number,
  statusCode: number,
  aborted?: boolean,
) {
  const level = getStatusLogLevel(statusCode);
  logger[level](buildHttpRequestLogFields({
    sourceApp: LoggerSourceApp.OidcProvider,
    requestId,
    readHeader: name => request.headers[name.toLowerCase()],
    method: request.method ?? "GET",
    path: getOriginalPath(
      (request as IncomingMessage & { originalUrl?: string }).originalUrl ?? request.url,
      "http://localhost",
    ),
    route,
    statusCode,
    durationMs: Math.round(performance.now() - startedAt),
    aborted,
    oidcRoute: getOidcRoute(request),
  }), "HTTP request completed");
}

export function createOidcHttpServer(runtime: OidcHttpRuntime) {
  const { provider, interactions, env, logger, health } = runtime;
  const callback = provider.callback();
  const publicOrigin = new URL(env.OIDC_PUBLIC_ORIGIN);
  return createServer(async (request, response) => {
    const startedAt = performance.now();
    const requestId = ensureRequestId(request, response);
    const originalUrl = request.url;
    const route = classifyOidcHttpRoute(getOriginalPath(originalUrl, env.OIDC_PUBLIC_ORIGIN));
    let finished = false;
    let logged = false;
    const logCompleted = (aborted?: boolean) => {
      if (logged)
        return;
      logged = true;
      logHttpRequestCompleted(
        logger,
        request,
        route,
        requestId,
        startedAt,
        response.statusCode || 200,
        aborted,
      );
    };
    response.once("finish", () => {
      finished = true;
      logCompleted();
    });
    response.once("close", () => {
      if (!finished)
        logCompleted(true);
    });

    try {
      if (request.url === "/health") {
        await health.ping();
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
