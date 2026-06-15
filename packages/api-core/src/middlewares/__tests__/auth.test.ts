import type { Redis } from "ioredis";
import type { InternalBindings } from "../../types/lib";
import { ClientStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { createInternalAuthenticationHandler, createPublicAuthenticationHandler } from "../auth";
import { createErrorHandler } from "../error-handler";

type TestClient = {
  clientCode: string;
  clientSecret: string;
  isDelete: boolean;
  status: ClientStatus;
};

function createMockLogger() {
  const error = mock((..._args: unknown[]) => undefined);
  const warn = mock((..._args: unknown[]) => undefined);
  return { error, warn };
}

function createClient(overrides: Partial<TestClient> = {}): TestClient {
  return {
    clientCode: "portal",
    clientSecret: "secret-1",
    isDelete: false,
    status: ClientStatus.Enable,
    ...overrides,
  };
}

function createInternalAuthTestApp(clientBySecret: Record<string, TestClient | null>) {
  const logger = createMockLogger();
  const getClientBySecret = mock(async (secret: string) => clientBySecret[secret] ?? null);
  const app = new Hono<InternalBindings<TestClient>>();

  app.use("*", async (c, next) => {
    c.set("logger", logger as never);
    c.set("requestId", "req-1");
    await next();
  });
  app.use("*", createInternalAuthenticationHandler({ getClientBySecret }));
  app.get("/internal/ping", c => c.json({
    clientCode: c.get("clientCode"),
    clientDto: c.get("clientDto"),
  }));
  app.onError(createErrorHandler(logger));

  return { app, getClientBySecret, logger };
}

describe("createPublicAuthenticationHandler", () => {
  test("deletes the local session cookie by cookie name when the Redis session is expired", async () => {
    const sessionId = "bf1cf140-1510-40c3-b117-a43cf84de157";
    const app = new Hono();
    const redis = {
      get: async (key: string) => {
        expect(key).toBe(`local_iam-admin_session:${sessionId}`);
        return null;
      },
    } as Pick<Redis, "get"> as Redis;

    app.use("*", createPublicAuthenticationHandler({
      redis,
      userSchema: z.object({
        id: z.number(),
        username: z.string(),
        roles: z.array(z.string()),
      }),
    }));
    app.get("/public/user-info", c => c.json({ ok: true }));
    app.onError(createErrorHandler(createMockLogger()));

    const response = await app.request("http://localhost/public/user-info", {
      headers: {
        Client: "iam-admin",
        Cookie: `local_iam-admin_session=${sessionId}`,
      },
    });

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()[0]).toStartWith("local_iam-admin_session=");
  });

  test("rejects and cleans up a stale local session when reverse mapping is missing", async () => {
    const sessionId = "bf1cf140-1510-40c3-b117-a43cf84de157";
    const app = new Hono();
    const values = new Map<string, string>([
      [`local_iam-admin_session:${sessionId}`, JSON.stringify({
        id: 1,
        username: "138550",
        roles: [],
      })],
    ]);
    const deletedKeys: string[] = [];
    const redis = {
      get: async (key: string) => values.get(key) ?? null,
      del: async (key: string) => {
        deletedKeys.push(key);
        return values.delete(key) ? 1 : 0;
      },
    } as Pick<Redis, "get" | "del"> as Redis;

    app.use("*", createPublicAuthenticationHandler({
      redis,
      userSchema: z.object({
        id: z.number(),
        username: z.string(),
        roles: z.array(z.string()),
      }),
    }));
    app.get("/public/user-info", c => c.json({ ok: true }));
    app.onError(createErrorHandler(createMockLogger()));

    const response = await app.request("http://localhost/public/user-info", {
      headers: {
        Client: "iam-admin",
        Cookie: `local_iam-admin_session=${sessionId}`,
      },
    });

    expect(response.status).toBe(401);
    expect(deletedKeys).toEqual([
      `local_iam-admin_session:${sessionId}`,
      `local_session_reverse:${sessionId}`,
    ]);
    expect(response.headers.getSetCookie()[0]).toStartWith("local_iam-admin_session=");
  });
});

describe("createInternalAuthenticationHandler", () => {
  test("rejects requests without apikey", async () => {
    const { app, getClientBySecret, logger } = createInternalAuthTestApp({});

    const response = await app.request("http://localhost/internal/ping");

    expect(response.status).toBe(401);
    expect(getClientBySecret).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "missing_apikey", requestId: "req-1" }),
      "internal client authentication failed",
    );
  });

  test("rejects requests when the secret does not resolve to a client", async () => {
    const { app, getClientBySecret, logger } = createInternalAuthTestApp({});

    const response = await app.request("http://localhost/internal/ping", {
      headers: { apikey: "missing-secret" },
    });

    expect(response.status).toBe(401);
    expect(getClientBySecret).toHaveBeenCalledWith("missing-secret");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "secret_not_found", requestId: "req-1" }),
      "internal client authentication failed",
    );
  });

  test("rejects soft-deleted clients", async () => {
    const client = createClient({ isDelete: true });
    const { app, logger } = createInternalAuthTestApp({ [client.clientSecret]: client });

    const response = await app.request("http://localhost/internal/ping", {
      headers: { apikey: client.clientSecret },
    });

    expect(response.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "inactive_client",
        clientCode: client.clientCode,
        isDelete: true,
        status: ClientStatus.Enable,
      }),
      "internal client authentication failed",
    );
  });

  test("rejects maintenance clients", async () => {
    const client = createClient({ status: ClientStatus.Maintance });
    const { app, logger } = createInternalAuthTestApp({ [client.clientSecret]: client });

    const response = await app.request("http://localhost/internal/ping", {
      headers: { apikey: client.clientSecret },
    });

    expect(response.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "inactive_client",
        clientCode: client.clientCode,
        isDelete: false,
        status: ClientStatus.Maintance,
      }),
      "internal client authentication failed",
    );
  });

  test("rejects disabled clients", async () => {
    const client = createClient({ status: ClientStatus.Disable });
    const { app, logger } = createInternalAuthTestApp({ [client.clientSecret]: client });

    const response = await app.request("http://localhost/internal/ping", {
      headers: { apikey: client.clientSecret },
    });

    expect(response.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "inactive_client",
        clientCode: client.clientCode,
        isDelete: false,
        status: ClientStatus.Disable,
      }),
      "internal client authentication failed",
    );
  });

  test("accepts active clients and writes internal client context", async () => {
    const client = createClient();
    const { app, logger } = createInternalAuthTestApp({ [client.clientSecret]: client });

    const response = await app.request("http://localhost/internal/ping", {
      headers: { apikey: client.clientSecret },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clientCode: client.clientCode,
      clientDto: client,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
