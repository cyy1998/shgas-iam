import type { OidcProviderComposition } from "../../src/composition/index.ts";
import { EventEmitter } from "node:events";
import { SystemLogEvent } from "@iam/api-core/logger";
import { describe, expect, it, vi } from "vitest";
import { startOidcProviderApplication } from "../../src/application.ts";
import { createOidcProviderShutdown } from "../../src/composition/shutdown.ts";

function createApplicationFixture() {
  const serverEvents = new EventEmitter();
  const server = Object.assign(serverEvents, {
    close: vi.fn((onClosed: () => void) => onClosed()),
    listen: vi.fn((_port: number, onListening: () => void) => {
      onListening();
      return serverEvents;
    }),
  });
  const processLifecycle = new EventEmitter();
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  };
  const clientInvalidationSubscriber = { quit: vi.fn(async () => "OK") };
  const redis = { quit: vi.fn(async () => "OK") };
  const closeDatabase = vi.fn(async () => {});
  const shutdown = createOidcProviderShutdown({
    clientInvalidationSubscriber,
    closeDatabase,
    logger,
    redis,
    server,
  });
  const composition = {
    logger,
    server,
    shutdown,
  } as unknown as OidcProviderComposition;

  startOidcProviderApplication({
    composition,
    env: {
      issuer: "https://iam.example/oidc",
      port: 3002,
    },
    processLifecycle,
  });

  return {
    clientInvalidationSubscriber,
    closeDatabase,
    composition,
    logger,
    processLifecycle,
    redis,
    server,
  };
}

async function expectResourcesClosed(fixture: ReturnType<typeof createApplicationFixture>, signal: string) {
  await vi.waitFor(() => {
    expect(fixture.server.close).toHaveBeenCalledOnce();
    expect(fixture.clientInvalidationSubscriber.quit).toHaveBeenCalledOnce();
    expect(fixture.redis.quit).toHaveBeenCalledOnce();
    expect(fixture.closeDatabase).toHaveBeenCalledOnce();
  });
  expect(fixture.logger.info).toHaveBeenCalledWith({
    event: SystemLogEvent.OidcProviderStopping,
    signal,
  }, "OIDC provider shutting down");
}

describe("oIDC provider application entry", () => {
  it("listens with the configured port and records startup", () => {
    const { logger, server } = createApplicationFixture();

    expect(server.listen).toHaveBeenCalledWith(3002, expect.any(Function));
    expect(logger.info).toHaveBeenCalledWith({
      event: SystemLogEvent.OidcProviderStarted,
      issuer: "https://iam.example/oidc",
      port: 3002,
    }, "OIDC provider listening");
  });

  it.each(["SIGINT", "SIGTERM"] as const)("forwards %s to graceful shutdown", async (signal) => {
    const fixture = createApplicationFixture();

    fixture.processLifecycle.emit(signal);

    await expectResourcesClosed(fixture, signal);
  });

  it("logs an HTTP server error and starts graceful shutdown", async () => {
    const fixture = createApplicationFixture();
    const error = new Error("listener failed");

    fixture.server.emit("error", error);

    expect(fixture.logger.error).toHaveBeenCalledWith({
      event: SystemLogEvent.OidcProviderServerError,
      err: error,
      errorMessage: "listener failed",
      errorName: "Error",
    }, "OIDC provider HTTP server error");
    await expectResourcesClosed(fixture, "server:error");
  });

  it("releases every owned resource on explicit shutdown", async () => {
    const fixture = createApplicationFixture();

    await fixture.composition.shutdown("explicit");

    await expectResourcesClosed(fixture, "explicit");
  });
});
