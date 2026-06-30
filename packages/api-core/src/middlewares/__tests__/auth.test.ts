import type { InternalBindings } from "../../types/lib";
import { ClientStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { createInternalAuthenticationHandler } from "../auth";
import { createErrorHandler } from "../error-handler";

type TestClient = {
  clientCode: string;
  clientSecret: string;
  isDelete: boolean;
  status: ClientStatus;
};

function createMockLogger() {
  const info = mock((..._args: unknown[]) => undefined);
  const error = mock((..._args: unknown[]) => undefined);
  const warn = mock((..._args: unknown[]) => undefined);
  return {
    info,
    error,
    warn,
    bindings: () => ({ sourceApp: "iam-api-test" }),
  };
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
    const client = createClient({ status: ClientStatus.Maintenance });
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
        status: ClientStatus.Maintenance,
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
