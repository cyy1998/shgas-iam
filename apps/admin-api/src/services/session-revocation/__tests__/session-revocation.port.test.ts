import { describe, expect, mock, test } from "bun:test";
import { createAdminSessionRevocationLogger } from "../session-revocation.logger";
import { createAdminSessionRevocationPort } from "../session-revocation.port";

function revokeSummary(overrides: Record<string, unknown> = {}) {
  return {
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
    ...overrides,
  };
}

function createLogger() {
  return {
    info: mock((..._args: unknown[]) => undefined),
    warn: mock((..._args: unknown[]) => undefined),
  };
}

describe("createAdminSessionRevocationPort", () => {
  test("maps user revocation to Session Kernel with except current PrincipalSession", async () => {
    const logger = {
      logUserRevocation: mock(() => undefined),
      logClientProtocolRevocation: mock(() => undefined),
      logClientAllProtocolsRevocation: mock(() => undefined),
    };
    const kernel = {
      revokeUserSessions: mock(async () => revokeSummary()),
      revokeClientProtocol: mock(async () => revokeSummary()),
      revokeClient: mock(async () => revokeSummary()),
    };
    const port = createAdminSessionRevocationPort({
      sessionKernel: kernel,
      oidcInvalidation: { invalidateClient: mock(async () => undefined) },
      logger,
    });

    await port.revokeUserSessions({
      userId: 1,
      reason: "admin_revoke",
      exceptPrincipalSessionId: "ps-current",
      auditContext: { actorType: "admin", actorUserId: 1 },
    });

    expect(kernel.revokeUserSessions).toHaveBeenCalledWith(
      { principalType: "user", subjectId: "1" },
      "admin_revoke",
      { exceptPrincipalSessionId: "ps-current" },
    );
    expect(logger.logUserRevocation).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 1,
      reason: "admin_revoke",
    }));
  });

  test("keeps OIDC invalidation failure in client protocol summary logging", async () => {
    const logger = {
      logUserRevocation: mock(() => undefined),
      logClientProtocolRevocation: mock(() => undefined),
      logClientAllProtocolsRevocation: mock(() => undefined),
    };
    const invalidationFailure = new Error("Authorization token leaked");
    const port = createAdminSessionRevocationPort({
      sessionKernel: {
        revokeUserSessions: mock(async () => revokeSummary()),
        revokeClientProtocol: mock(async () => revokeSummary()),
        revokeClient: mock(async () => revokeSummary()),
      },
      oidcInvalidation: { invalidateClient: mock(async () => { throw invalidationFailure; }) },
      logger,
    });

    await expect(port.revokeClientProtocol({
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
      oidcInvalidationClient: { id: 1, clientCode: "portal", oidcConfigVersion: 2 },
    })).resolves.toMatchObject({ cleanup: { failed: 0 } });

    expect(logger.logClientProtocolRevocation).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
      oidcInvalidation: {
        attempted: true,
        succeeded: false,
        failed: true,
        error: "Authorization token leaked",
      },
    }));
  });
});

describe("createAdminSessionRevocationLogger", () => {
  test("logs user revoke summary with actor, target, reason, and counters", () => {
    const logger = createLogger();
    const sessionLogger = createAdminSessionRevocationLogger({ logger });

    sessionLogger.logUserRevocation({
      targetUserId: 1,
      reason: "user_deleted",
      auditContext: {
        actorType: "admin",
        actorUserId: 100,
        actorUsername: "root",
        requestId: "req-1",
        traceId: "trace-1",
      },
      summary: revokeSummary({
        principalSessions: { revoked: 2, alreadyRevoked: 0, missing: 0, excluded: 0 },
      }) as never,
    });

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: "admin.session_revoke.user",
      sourceApp: "iam-admin-api",
      requestId: "req-1",
      traceId: "trace-1",
      actorUserId: 100,
      actorUsername: "root",
      targetUserId: 1,
      reason: "user_deleted",
      principalSessions: { revoked: 2, alreadyRevoked: 0, missing: 0, excluded: 0 },
    }), "admin session revoke summary");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("logs cleanup failures without sensitive refs or error text", () => {
    const logger = createLogger();
    const sessionLogger = createAdminSessionRevocationLogger({ logger });

    sessionLogger.logClientProtocolRevocation({
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
      summary: revokeSummary({
        cleanup: {
          attempted: 1,
          succeeded: 0,
          failed: 1,
          failures: [{
            protocol: "oidc",
            kind: "payload",
            ref: "external-token-secret",
            error: "clientSecret hash leaked",
          }],
        },
      }) as never,
    });

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: "admin.session_revoke.cleanup_failed",
      clientCode: "portal",
      protocol: "oidc",
      cleanupFailures: [{
        protocol: "oidc",
        kind: "payload",
        error: "[redacted]",
        count: 1,
      }],
    }), "admin session revoke cleanup failed");
    const logged = JSON.stringify(logger.warn.mock.calls[0]?.[0]);
    expect(logged).not.toContain("external-token-secret");
    expect(logged).not.toContain("clientSecret");
    expect(logged).not.toContain("hash leaked");
  });
});
