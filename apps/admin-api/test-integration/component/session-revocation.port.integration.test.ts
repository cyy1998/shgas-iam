import { createAdminSessionRevocationLogger } from "@admin-api/services/session-revocation/session-revocation.logger";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { SystemLogEvent } from "@iam/api-core/logger";
import { encodeSubjectAccessContext } from "@iam/api-core/subject-access";
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

describe("Admin context revocation", () => {
  const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
  const transitionId = "00000000-0000-4000-8000-000000000002";
  function fixture(failPreparation = false) {
    const summary = revokeSummary();
    const preparedRevoke = mock(async () => summary);
    const kernel = {
      prepareUserSessionRevocationByContext: mock(async () => {
        if (failPreparation)
          throw new Error("secret preparation payload");
        return { revoke: preparedRevoke };
      }),
      revokeUserSessionsByContext: mock(async () => summary),
      revokeUserSessionRecords: mock(async () => summary),
      revokePrincipalSession: mock(async () => summary),
      revokeClientProtocol: mock(async () => summary),
      revokeClient: mock(async () => summary),
    };
    const logger = { logPreparationFailure: mock(), logUserRevocation: mock(), logClientProtocolRevocation: mock(), logClientAllProtocolsRevocation: mock() };
    return { kernel, logger, preparedRevoke, port: createAdminSessionRevocationPort({ sessionKernel: kernel, logger }) };
  }

  test("prepared cleanup adds only the committed prior context", async () => {
    const subject = fixture();
    const plan = await subject.port.prepareUserSessionRevocation({ userId: 1, subjectIdentifier, reason: "user_disabled" });
    await plan.revoke({ onlySubjectAccessTransitionId: transitionId });
    expect(subject.preparedRevoke).toHaveBeenCalledWith("user_disabled", {
      includeSubjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId }),
    });
    expect(subject.kernel.revokeUserSessionRecords).not.toHaveBeenCalled();
  });

  test("preparation and logger failures preserve exact fallback without widening an empty capture", async () => {
    const subject = fixture(true);
    subject.logger.logPreparationFailure.mockImplementation(() => {
      throw new Error("logger unavailable");
    });
    const plan = await subject.port.prepareUserSessionRevocation({ userId: 1, subjectIdentifier, reason: "user_disabled" });
    await plan.revoke({ onlySubjectAccessTransitionId: transitionId });
    expect(subject.kernel.revokeUserSessionsByContext).toHaveBeenLastCalledWith(
      { principalType: "user", subjectId: subjectIdentifier },
      "user_disabled",
      [encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId })],
    );
    await plan.revoke({});
    expect(subject.kernel.revokeUserSessionsByContext).toHaveBeenLastCalledWith(
      { principalType: "user", subjectId: subjectIdentifier },
      "user_disabled",
      [],
    );
    expect(subject.logger.logPreparationFailure).toHaveBeenCalledWith({ errorName: "Error" });
    expect(subject.kernel.revokeUserSessionRecords).not.toHaveBeenCalled();
  });

  for (const reason of ["user_disabled", "user_deleted"] as const) {
    test(`${reason} revokes only the invalidated context`, async () => {
      const subject = fixture();
      await subject.port.revokeUserSessions({ userId: 1, subjectIdentifier, reason, onlySubjectAccessTransitionId: transitionId });
      expect(subject.kernel.revokeUserSessionsByContext).toHaveBeenCalledWith(
        { principalType: "user", subjectId: subjectIdentifier },
        reason,
        [encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId })],
      );
      expect(subject.kernel.revokeUserSessionRecords).not.toHaveBeenCalled();
    });
  }
});

describe("createAdminSessionRevocationPort", () => {
  test("prepares by subject before passing the committed generation and audit context to cleanup", async () => {
    const summary = revokeSummary();
    const revoke = mock(async () => summary);
    const prepareUserSessionRevocationByContext = mock(async () => ({ revoke }));
    const logger = { logPreparationFailure: mock(), logUserRevocation: mock(), logClientProtocolRevocation: mock(), logClientAllProtocolsRevocation: mock() };
    const port = createAdminSessionRevocationPort({
      sessionKernel: {
        revokePrincipalSession: mock(async () => revokeSummary()),
        revokeUserSessionsByContext: mock(async () => revokeSummary()),
        prepareUserSessionRevocationByContext,
        revokeUserSessionRecords: mock(async () => summary),
        revokeClientProtocol: mock(async () => summary),
        revokeClient: mock(async () => summary),
      },
      logger,
    });
    const auditContext = { actorType: "admin" as const, actorUserId: 99 };
    const plan = await port.prepareUserSessionRevocation({ userId: 1, subjectIdentifier: "00000000-0000-4000-8000-000000000001", reason: "user_disabled", auditContext });
    expect(prepareUserSessionRevocationByContext).toHaveBeenCalledWith({ principalType: "user", subjectId: "00000000-0000-4000-8000-000000000001" });
    expect(revoke).not.toHaveBeenCalled();
    expect(logger.logUserRevocation).not.toHaveBeenCalled();
    const result = await plan.revoke({ onlySubjectAccessTransitionId: "00000000-0000-4000-8000-000000000002" });
    expect(result).toBe(summary);
    expect(revoke).toHaveBeenCalledWith("user_disabled", { includeSubjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier: "00000000-0000-4000-8000-000000000001", transitionId: "00000000-0000-4000-8000-000000000002" }) });
    expect(logger.logUserRevocation).toHaveBeenCalledWith({ targetUserId: 1, reason: "user_disabled", auditContext, summary });
  });

  test("maps user revocation to Session Kernel with except current PrincipalSession", async () => {
    const logger = {
      logPreparationFailure: mock(),
      logUserRevocation: mock(() => undefined),
      logClientProtocolRevocation: mock(() => undefined),
      logClientAllProtocolsRevocation: mock(() => undefined),
    };
    const kernel = {
      revokePrincipalSession: mock(async () => revokeSummary()),
      revokeUserSessionsByContext: mock(async () => revokeSummary()),
      prepareUserSessionRevocationByContext: mock(async () => ({ revoke: async () => revokeSummary() })),
      revokeUserSessionRecords: mock(async () => revokeSummary()),
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

    expect(kernel.revokeUserSessionRecords).toHaveBeenCalledWith(
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
      logPreparationFailure: mock(),
      logUserRevocation: mock(() => undefined),
      logClientProtocolRevocation: mock(() => undefined),
      logClientAllProtocolsRevocation: mock(() => undefined),
    };
    const port = createAdminSessionRevocationPort({
      sessionKernel: {
        revokePrincipalSession: mock(async () => revokeSummary()),
        revokeUserSessionsByContext: mock(async () => revokeSummary()),
        prepareUserSessionRevocationByContext: mock(async () => ({ revoke: async () => revokeSummary() })),
        revokeUserSessionRecords: mock(async () => revokeSummary()),
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
