import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import http from "node:http";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import { afterEach, describe, expect, it } from "vitest";

type LogLine = Record<string, unknown> & { msg: string };

const servers: Server[] = [];
let oidcRequestRouteSymbol: symbol;

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 50);
    server.close((error) => {
      clearTimeout(timeout);
      error ? reject(error) : resolve();
    });
    server.closeIdleConnections();
    server.closeAllConnections();
  })));
});

async function loadApp() {
  const app = await import("../app.ts");
  oidcRequestRouteSymbol = app.OIDC_REQUEST_ROUTE_SYMBOL;
  return app;
}

function createMemoryLogger(lines: LogLine[]) {
  const write = (level: string) => (fields: Record<string, unknown>, msg: string) => {
    lines.push({ ...fields, level, msg });
  };
  return {
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}

function createEnv() {
  return {
    oidc: {
      publicOrigin: "http://issuer.test",
    },
  };
}

async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

async function waitForLog(lines: LogLine[], predicate: (line: LogLine) => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const line = lines.find(predicate);
    if (line)
      return line;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("expected log line was not emitted");
}

type ProviderCallback = (request: http.IncomingMessage, response: http.ServerResponse) => void;

function createRuntime(lines: LogLine[], providerCallback?: ProviderCallback) {
  return {
    env: createEnv(),
    logger: createMemoryLogger(lines),
    interactions: {
      async handleInteraction(_request: http.IncomingMessage, response: http.ServerResponse) {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("interaction");
      },
      async handleResume(_request: http.IncomingMessage, response: http.ServerResponse) {
        response.writeHead(302, { location: "/portal" });
        response.end();
      },
    },
    provider: {
      callback() {
        return providerCallback ?? ((request: http.IncomingMessage, response: http.ServerResponse) => {
          const requestWithOidcRoute = request as http.IncomingMessage & { [key: symbol]: string };
          requestWithOidcRoute[oidcRequestRouteSymbol] = "discovery";
          response.writeHead(200, { "content-type": "text/plain" });
          response.end("provider");
        });
      },
    },
  };
}

function createRedis(ping: () => Promise<unknown> = async () => "PONG") {
  return { ping } as never;
}

describe("oIDC HTTP access logging", () => {
  it("logs health, interaction, resume, provider callback, and not_found routes", async () => {
    const { createOidcHttpServer } = await loadApp();
    const lines: LogLine[] = [];
    const server = createOidcHttpServer({ ...createRuntime(lines), health: createRedis() } as never);
    const port = await listen(server);

    await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-request-id": "req-health" } });
    await fetch(`http://127.0.0.1:${port}/oidc/interaction/abc`, { headers: { "x-request-id": "req-interaction" } });
    await fetch(`http://127.0.0.1:${port}/oidc/resume`, { headers: { "x-request-id": "req-resume" }, redirect: "manual" });
    await fetch(`http://127.0.0.1:${port}/oidc/.well-known/openid-configuration`, {
      headers: { "x-request-id": "req-provider" },
    });
    await fetch(`http://127.0.0.1:${port}/missing`, { headers: { "x-request-id": "req-missing" } });

    await waitForLog(lines, line => line.requestId === "req-missing" && line.event === SystemLogEvent.HttpRequestCompleted);

    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: SystemLogEvent.HttpRequestCompleted,
        sourceApp: LoggerSourceApp.OidcProvider,
        requestId: "req-health",
        route: "/health",
        statusCode: 200,
      }),
      expect.objectContaining({
        event: SystemLogEvent.HttpRequestCompleted,
        requestId: "req-interaction",
        route: "/oidc/interaction/:uid",
        statusCode: 200,
      }),
      expect.objectContaining({
        event: SystemLogEvent.HttpRequestCompleted,
        requestId: "req-resume",
        route: "/oidc/resume",
        statusCode: 302,
      }),
      expect.objectContaining({
        event: SystemLogEvent.HttpRequestCompleted,
        requestId: "req-provider",
        route: "/oidc/*",
        oidcRoute: "discovery",
        statusCode: 200,
      }),
      expect.objectContaining({
        event: SystemLogEvent.HttpRequestCompleted,
        requestId: "req-missing",
        route: "not_found",
        statusCode: 404,
        level: "info",
      }),
    ]));
  }, 10_000);

  it("keeps failed request event and access logs on the same requestId", async () => {
    const { createOidcHttpServer } = await loadApp();
    const lines: LogLine[] = [];
    const traceId = "11111111111111111111111111111111";
    const server = createOidcHttpServer(
      {
        ...createRuntime(lines),
        health: createRedis(async () => {
          throw new Error("redis down");
        }),
      } as never,
    );
    const port = await listen(server);

    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: {
        "traceparent": `00-${traceId}-2222222222222222-01`,
        "x-request-id": "req-failed",
      },
    });
    await waitForLog(lines, line => line.requestId === "req-failed" && line.event === SystemLogEvent.HttpRequestCompleted);

    expect(response.status).toBe(503);
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: SystemLogEvent.OidcProviderHttpRequestFailed,
        sourceApp: LoggerSourceApp.OidcProvider,
        requestId: "req-failed",
        traceId,
        level: "error",
      }),
      expect.objectContaining({
        event: SystemLogEvent.HttpRequestCompleted,
        requestId: "req-failed",
        traceId,
        route: "/health",
        statusCode: 503,
        level: "info",
      }),
    ]));
  }, 10_000);

  it("marks requests closed before finish as aborted", async () => {
    const { createOidcHttpServer } = await loadApp();
    const lines: LogLine[] = [];
    const server = createOidcHttpServer({ ...createRuntime(lines, () => {}), health: createRedis() } as never);
    const port = await listen(server);

    await new Promise<void>((resolve) => {
      const request = http.request({
        host: "127.0.0.1",
        port,
        path: "/oidc/slow",
        headers: { "x-request-id": "req-aborted" },
      });
      request.on("socket", () => setTimeout(() => {
        request.destroy();
        resolve();
      }, 10));
      request.on("error", () => {});
      request.end();
    });

    const line = await waitForLog(
      lines,
      item => item.requestId === "req-aborted" && item.event === SystemLogEvent.HttpRequestCompleted,
    );
    expect(line).toMatchObject({
      route: "/oidc/*",
      aborted: true,
    });
  }, 10_000);
});
