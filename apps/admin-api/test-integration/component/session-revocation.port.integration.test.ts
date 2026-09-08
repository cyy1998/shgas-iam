import { createAdminSessionRevocationLogger } from "@admin-api/services/session-revocation/session-revocation.logger";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { SystemLogEvent } from "@iam/api-core/logger";
import { describe, expect, mock, test } from "bun:test";

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
  test("prepares by subject before passing the committed generation and audit context to cleanup", async () => {
    const summary = revokeSummary();
    const revoke = mock(async () => summary);
    const prepareUserSessionRevocation = mock(async () => ({ revoke }));
    const logger = { logUserRevocation: mock(), logClientProtocolRevocation: mock(), logClientAllProtocolsRevocation: mock() };
    const port = createAdminSessionRevocationPort({
      sessionKernel: {
        prepareUserSessionRevocation,
        revokeUserSessions: mock(async () => summary),
        revokeClientProtocol: mock(async () => summary),
        revokeClient: mock(async () => summary),
      },
      logger,
    });
    const auditContext = { actorType: "admin" as const, actorUserId: 99 };
    const plan = await port.prepareUserSessionRevocation({ userId: 1, subjectIdentifier: "subject", reason: "user_disabled", auditContext });
    expect(prepareUserSessionRevocation).toHaveBeenCalledWith({ principalType: "user", subjectId: "subject" });
    expect(revoke).not.toHaveBeenCalled();
    expect(logger.logUserRevocation).not.toHaveBeenCalled();
    const result = await plan.revoke({ onlySubjectAccessTransitionId: "previous-generation" });
    expect(result).toBe(summary);
    expect(revoke).toHaveBeenCalledWith("user_disabled", { onlySubjectAccessTransitionId: "previous-generation" });
    expect(logger.logUserRevocation).toHaveBeenCalledWith({ targetUserId: 1, reason: "user_disabled", auditContext, summary });
  });

  test("maps user revocation to Session Kernel with except current PrincipalSession", async () => {
    const logger = {
      logUserRevocation: mock(() => undefined),
      logClientProtocolRevocation: mock(() => undefined),
      logClientAllProtocolsRevocation: mock(() => undefined),
    };
    const kernel = {
      prepareUserSessionRevocation: mock(async () => ({ revoke: async () => revokeSummary() })),
      revokeUserSessions: mock(async () => revokeSummary()),
      revokeClientProtocol: mock(async () => revokeSummary()),
      revokeClient: mock(async () => revokeSummary()),
    };
    const port = createAdminSessionRevocationPort({
      sessionKernel: kernel,
      logger,
    });

    await port.revokeUserSessions({
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
      userId: 1,
      reason: "admin_revoke",
      exceptPrincipalSessionId: "ps-current",
      auditContext: { actorType: "admin", actorUserId: 1 },
    });

    expect(kernel.revokeUserSessions).toHaveBeenCalledWith(
      {
        principalType: "user",
        subjectId: "00000000-0000-4000-8000-000000000001",
      },
      "admin_revoke",
      { exceptPrincipalSessionId: "ps-current" },
    );
    expect(logger.logUserRevocation).toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 1,
      reason: "admin_revoke",
    }));
  });

  test("reports Custom SSO revocation as Credentials without virtual Client Bindings", async () => {
    const summary = revokeSummary({
      bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
      credentials: { revoked: 1, alreadyRevoked: 0, missing: 0, excluded: 0 },
    });
    const logger = {
      logUserRevocation: mock(() => undefined),
      logClientProtocolRevocation: mock(() => undefined),
      logClientAllProtocolsRevocation: mock(() => undefined),
    };
    const port = createAdminSessionRevocationPort({
      sessionKernel: {
        prepareUserSessionRevocation: mock(async () => ({ revoke: async () => revokeSummary() })),
        revokeUserSessions: mock(async () => revokeSummary()),
        revokeClientProtocol: mock(async () => summary),
        revokeClient: mock(async () => revokeSummary()),
      },
      logger,
    });

    await expect(port.revokeClientProtocol({
      clientCode: "portal",
      protocol: "custom-sso",
      reason: "client_config_changed",
    })).resolves.toMatchObject({
      bindings: { revoked: 0 },
      credentials: { revoked: 1 },
    });
    expect(logger.logClientProtocolRevocation).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "portal",
      protocol: "custom-sso",
      summary,
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
      event: SystemLogEvent.AdminSessionRevokeUser,
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
      event: SystemLogEvent.AdminSessionRevokeCleanupFailed,
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
      cleanup: {
        attempted: 1,
        succeeded: 0,
        failed: 1,
      },
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

  test("logs Custom SSO Credential counts while keeping the Client Binding counter", () => {
    const logger = createLogger();
    const sessionLogger = createAdminSessionRevocationLogger({ logger });

    sessionLogger.logClientProtocolRevocation({
      clientCode: "portal",
      protocol: "custom-sso",
      reason: "client_config_changed",
      summary: revokeSummary({
        bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
        credentials: { revoked: 1, alreadyRevoked: 0, missing: 0, excluded: 0 },
      }) as never,
    });

    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      event: SystemLogEvent.AdminSessionRevokeClientProtocol,
      protocol: "custom-sso",
      bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
      credentials: { revoked: 1, alreadyRevoked: 0, missing: 0, excluded: 0 },
    }), "admin session revoke summary");
  });
});
