import type {
  AdminAuditContext,
  AuditLogInput,
} from "@admin-api/services/audit/audit.context";
import type {
  AdminLoginRestrictionPort,
  AdminLoginRestrictionState,
  AdminSessionManagementServiceDeps,
  AdminSessionUserControlPort,
  AdminSessionUserSummary,
} from "@admin-api/services/session-management/session-management.port";
import type {
  AdminLoginRestrictionListInput,
  AdminSessionActorContext,
  AdminSessionRevokeInput,
} from "@admin-api/services/session-management/session-management.type";
import { createSessionManagementService } from "@admin-api/services/session-management/session-management.service";
import { UserStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

function subjectIdentifierFor(userId: number) {
  return `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`;
}

function unusedMutationDeps() {
  return {
    audit: {
      recordAuditLog: async (_input: unknown) => {},
    },
    control: {
      revokePrincipalSession: async () => {
        throw new Error("unexpected Session Revocation in list test");
      },
    },
    logger: {
      error: (_fields: Record<string, unknown>, _message: string) => {},
    },
    loginRestrictions: {
      listRestrictions: async () => ({ items: [], total: 0 }),
      clearLoginState: async () => ({
        changed: false,
        failureStateCleared: true as const,
        restriction: null,
      }),
    },
    userControl: {
      revokeUserSessions: async () => {
        throw new Error("unexpected user Session Revocation in list test");
      },
    },
  };
}

interface CreateLoginRestrictionHarnessOptions {
  auditError?: unknown;
  clearError?: unknown;
  clearResult?: Awaited<
    ReturnType<AdminLoginRestrictionPort["clearLoginState"]>
  >;
  listError?: unknown;
  listResult?: Awaited<
    ReturnType<AdminLoginRestrictionPort["listRestrictions"]>
  >;
  users?: AdminSessionUserSummary[];
}

function loginRestrictionState(
  overrides: Partial<AdminLoginRestrictionState> = {},
): AdminLoginRestrictionState {
  return {
    userId: 7,
    cause: "too_many_login_failures",
    triggerMethod: "mobile",
    restrictedUntil: 1_753_776_000_000,
    remainingSeconds: 1_799,
    ...overrides,
  };
}

function createLoginRestrictionHarness(
  options: CreateLoginRestrictionHarnessOptions = {},
) {
  const auditWrites: AuditLogInput[] = [];
  const errorLogs: Array<[Record<string, unknown>, string]> = [];
  const listRestrictions = mock(async (
    _input: Parameters<AdminLoginRestrictionPort["listRestrictions"]>[0],
  ): Promise<Awaited<
    ReturnType<AdminLoginRestrictionPort["listRestrictions"]>
  >> => {
    if (options.listError !== undefined)
      throw options.listError;
    return options.listResult ?? { items: [], total: 0 };
  });
  const clearLoginState = mock(async (
    _userId: number,
  ): Promise<Awaited<
    ReturnType<AdminLoginRestrictionPort["clearLoginState"]>
  >> => {
    if (options.clearError !== undefined)
      throw options.clearError;
    return options.clearResult ?? {
      changed: false,
      failureStateCleared: true,
      restriction: null,
    };
  });
  const getSessionManagementUserSummaries = mock(async (
    _userIds: readonly number[],
  ) => options.users ?? []);
  const getSessionManagementUserSummariesBySubjectIdentifiers = mock(async () => []);
  const listPrincipalSessions = mock(async () => {
    throw new Error("Principal Session inventory must not run");
  });
  const revokePrincipalSession = mock(async () => {
    throw new Error("Principal Session control must not run");
  });
  const revokeUserSessions = mock(async () => {
    throw new Error("Principal Session user control must not run");
  });
  const service = createSessionManagementService({
    ...unusedMutationDeps(),
    inventory: {
      listPrincipalSessions,
    },
    loginRestrictions: {
      clearLoginState,
      listRestrictions,
    },
    users: {
      getSessionManagementUserSummaries,
      getSessionManagementUserSummariesBySubjectIdentifiers,
    },
    audit: {
      recordAuditLog: async (input) => {
        auditWrites.push(input);
        if (options.auditError !== undefined)
          throw options.auditError;
      },
    },
    control: { revokePrincipalSession },
    userControl: { revokeUserSessions },
    logger: {
      error: (fields, message) => {
        errorLogs.push([fields, message]);
      },
    },
  });

  return {
    auditWrites,
    clearLoginState,
    errorLogs,
    getSessionManagementUserSummaries,
    list: (input: AdminLoginRestrictionListInput) =>
      service.listLoginRestrictions(input),
    listPrincipalSessions,
    listRestrictions,
    release: (
      userId = 7,
      auditContext: AdminAuditContext = {
        actorType: "admin",
        actorUserId: 99,
      },
    ) => service.releaseLoginRestriction({ userId }, auditContext),
    revokePrincipalSession,
    revokeUserSessions,
  };
}

function expectNoPrincipalSessionEffects(
  harness: ReturnType<typeof createLoginRestrictionHarness>,
) {
  expect(harness.listPrincipalSessions).not.toHaveBeenCalled();
  expect(harness.revokePrincipalSession).not.toHaveBeenCalled();
  expect(harness.revokeUserSessions).not.toHaveBeenCalled();
}

interface CreateRevokeHarnessOptions {
  deps?: Partial<AdminSessionManagementServiceDeps>;
  input?: AdminSessionRevokeInput;
  actor?: AdminSessionActorContext;
  audit?: AdminAuditContext;
  auditError?: unknown;
  userControlError?: unknown;
  userSummary?: RevokeSummaryFixture;
}

interface RevokeCounterFixture {
  revoked: number;
  alreadyRevoked: number;
  missing: number;
  excluded: number;
}

interface RevokeSummaryFixture {
  principalSessions: RevokeCounterFixture;
  bindings: RevokeCounterFixture;
  credentials: RevokeCounterFixture;
  artifacts: RevokeCounterFixture;
  cleanup: {
    attempted: number;
    succeeded: number;
    failed: number;
    failures: Array<{
      protocol: string;
      kind: string;
      ref: string;
      error: string;
    }>;
  };
}

interface RevokeSummaryOverrides {
  principalSessions?: Partial<RevokeCounterFixture>;
  bindings?: Partial<RevokeCounterFixture>;
  credentials?: Partial<RevokeCounterFixture>;
  artifacts?: Partial<RevokeCounterFixture>;
  cleanup?: Partial<RevokeSummaryFixture["cleanup"]>;
}

function revokeSummary(overrides: RevokeSummaryOverrides = {}): RevokeSummaryFixture {
  const emptyCounter: RevokeCounterFixture = {
    revoked: 0,
    alreadyRevoked: 0,
    missing: 0,
    excluded: 0,
  };
  return {
    principalSessions: { ...emptyCounter, ...overrides.principalSessions },
    bindings: { ...emptyCounter, ...overrides.bindings },
    credentials: { ...emptyCounter, ...overrides.credentials },
    artifacts: { ...emptyCounter, ...overrides.artifacts },
    cleanup: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      failures: [],
      ...overrides.cleanup,
    },
  };
}

function userRevokeInput(userId = 42): AdminSessionRevokeInput {
  return {
    target: {
      type: "user",
      userId,
    },
  };
}

function createRevokeHarness(options: CreateRevokeHarnessOptions = {}) {
  const controlCalls: Array<[string, "admin_revoke"]> = [];
  const userControlCalls: Array<
    Parameters<AdminSessionUserControlPort["revokeUserSessions"]>[0]
  > = [];
  const auditWrites: AuditLogInput[] = [];
  const errorLogs: Array<[Record<string, unknown>, string]> = [];
  const listPrincipalSessions = mock(async () => ({ items: [], total: 0 }));
  const deps: AdminSessionManagementServiceDeps = {
    inventory: {
      listPrincipalSessions,
    },
    loginRestrictions: {
      listRestrictions: async () => ({ items: [], total: 0 }),
      clearLoginState: async () => ({
        changed: false,
        failureStateCleared: true,
        restriction: null,
      }),
    },
    users: {
      getSessionManagementUserSummaries: mock(async (userIds: readonly number[]) => userIds.map(userId => ({
        id: userId,
        subjectIdentifier: subjectIdentifierFor(userId),
        username: `user-${userId}`,
        name: `User ${userId}`,
        status: UserStatus.Enable,
        isDelete: false,
      }))),
      getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => []),
    },
    control: {
      revokePrincipalSession: async (...args) => {
        controlCalls.push(args);
        return revokeSummary({ principalSessions: { revoked: 1 } });
      },
    },
    audit: {
      recordAuditLog: async (input) => {
        auditWrites.push(input);
        if (options.auditError !== undefined)
          throw options.auditError;
      },
    },
    logger: {
      error: (fields, message) => {
        errorLogs.push([fields, message]);
      },
    },
    userControl: {
      revokeUserSessions: async (input) => {
        userControlCalls.push(input);
        if (options.userControlError !== undefined)
          throw options.userControlError;
        if (options.userSummary === undefined) {
          throw new Error("unexpected user Session Revocation in session-target test");
        }
        return options.userSummary;
      },
    },
    ...options.deps,
  };
  const input = options.input ?? {
    target: {
      type: "session",
      principalSessionId: "ps-target",
    },
  };
  const actor = options.actor ?? {
    actorUserId: 7,
    principalSessionId: "ps-current",
  };
  const audit = options.audit ?? {
    actorType: "admin",
    actorUserId: actor.actorUserId,
  };
  const service = createSessionManagementService(deps);

  return {
    auditWrites,
    controlCalls,
    errorLogs,
    listPrincipalSessions,
    revoke: () => service.revokeSessions(input, actor, audit),
    userControlCalls,
  };
}

describe("createSessionManagementService", () => {
  test("protects the current Principal Session without invoking Session Kernel control", async () => {
    const { auditWrites, controlCalls, revoke } = createRevokeHarness({
      input: {
        target: {
          type: "session",
          principalSessionId: "ps-current",
        },
      },
      audit: {
        actorType: "admin",
        actorUserId: 7,
        actorUsername: "root",
        requestId: "req-protected",
        traceId: "trace-protected",
        ip: "203.0.113.7",
        userAgent: "actor-browser",
      },
    });

    await expect(revoke()).rejects.toMatchObject({
      code: "ADMIN_SESSION_CURRENT_PROTECTED",
      httpStatus: 409,
    });

    expect(controlCalls).toHaveLength(0);
    expect(auditWrites).toEqual([{
      action: "admin.session.revoke",
      outcome: "failure",
      actorType: "admin",
      actorUserId: 7,
      actorUsername: "root",
      requestId: "req-protected",
      traceId: "trace-protected",
      ip: "203.0.113.7",
      userAgent: "actor-browser",
      targetType: "principal_session",
      targetCode: "ps-current",
      details: {
        scope: "session",
        changed: false,
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        currentPrincipalSessionProtected: true,
        cleanupFailedCount: 0,
      },
    }]);
    const persistedAudit = JSON.stringify(auditWrites);
    for (const forbiddenValue of [
      "externalToken",
      "lookupHash",
      "hmac",
      "origin",
      "metadata",
      "cleanupRef",
      "error",
    ]) {
      expect(persistedAudit).not.toContain(forbiddenValue);
    }
  });

  test("wraps a protected-session audit failure without exposing provider details", async () => {
    const auditFailure = Object.assign(
      new Error("postgres://audit-writer secret SQL insert failed"),
      {
        serviceCode: "AUDIT_PROVIDER_FAILURE",
        serviceDetails: { table: "audit_log" },
      },
    );
    auditFailure.stack = "provider-stack-secret";
    const { controlCalls, revoke } = createRevokeHarness({
      input: {
        target: {
          type: "session",
          principalSessionId: "ps-current",
        },
      },
      deps: {
        audit: {
          recordAuditLog: mock(async () => {
            throw auditFailure;
          }),
        },
      },
    });

    let caught: unknown;
    try {
      await revoke();
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: "AdminLoginStateAuditFailedError",
      code: "COMMON.INTERNAL_ERROR",
      httpStatus: 500,
      message: "服务器内部错误",
      cause: auditFailure,
    });
    const publicFailure = caught as {
      name: string;
      code: string;
      httpStatus: number;
      message: string;
      stack?: string;
    };
    expect(JSON.stringify({
      name: publicFailure.name,
      code: publicFailure.code,
      httpStatus: publicFailure.httpStatus,
      message: publicFailure.message,
      stack: publicFailure.stack,
    })).not.toMatch(/postgres|secret SQL|provider-stack-secret|AUDIT_PROVIDER_FAILURE|audit_log/);
    expect(controlCalls).toHaveLength(0);
  });

  test("revokes one Principal Session with admin_revoke and returns only safe cascade counts", async () => {
    const revokePrincipalSession = mock(async () => ({
      principalSessions: { revoked: 1, alreadyRevoked: 0, missing: 0, excluded: 0 },
      bindings: { revoked: 2, alreadyRevoked: 0, missing: 0, excluded: 0 },
      credentials: { revoked: 3, alreadyRevoked: 0, missing: 0, excluded: 0 },
      artifacts: { revoked: 4, alreadyRevoked: 0, missing: 0, excluded: 0 },
      cleanup: {
        attempted: 2,
        succeeded: 2,
        failed: 0,
        failures: [],
      },
      externalToken: "must-not-leave-control-boundary",
    }));
    const { auditWrites, revoke } = createRevokeHarness({
      deps: {
        control: {
          revokePrincipalSession,
        },
      },
      audit: {
        actorType: "admin",
        actorUserId: 7,
        actorUsername: "root",
        requestId: "req-success",
      },
    });

    const result = await revoke();

    expect(revokePrincipalSession).toHaveBeenCalledTimes(1);
    expect(revokePrincipalSession).toHaveBeenCalledWith("ps-target", "admin_revoke");
    expect(result).toEqual({
      changed: true,
      result: {
        scope: "session",
        revoked: {
          principalSessions: 1,
          bindings: 2,
          credentials: 3,
          artifacts: 4,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 2,
          succeeded: 2,
          failed: 0,
        },
      },
    });
    expect(auditWrites).toEqual([{
      action: "admin.session.revoke",
      outcome: "success",
      actorType: "admin",
      actorUserId: 7,
      actorUsername: "root",
      requestId: "req-success",
      targetType: "principal_session",
      targetCode: "ps-target",
      details: {
        scope: "session",
        changed: true,
        revoked: {
          principalSessions: 1,
          bindings: 2,
          credentials: 3,
          artifacts: 4,
        },
        currentPrincipalSessionExcluded: false,
        cleanupFailedCount: 0,
      },
    }]);
    const publicAndAuditOutput = JSON.stringify({ result, auditWrites });
    for (const forbiddenValue of [
      "must-not-leave-control-boundary",
      "externalToken",
      "lookupHash",
      "hmac",
      "origin",
      "userAgent",
      "metadata",
      "cleanupRef",
      "failures",
      "error",
    ]) {
      expect(publicAndAuditOutput).not.toContain(forbiddenValue);
    }
  });

  test("reports unavailable login state without auditing a mutation that did not happen", async () => {
    const controlFailure = new Error("redis unavailable");
    const revokePrincipalSession = mock(async () => {
      throw controlFailure;
    });
    const { auditWrites, revoke } = createRevokeHarness({
      deps: {
        control: {
          revokePrincipalSession,
        },
      },
    });

    await expect(revoke()).rejects.toMatchObject({
      code: "ADMIN_LOGIN_STATE_UNAVAILABLE",
      httpStatus: 503,
      cause: controlFailure,
    });

    expect(revokePrincipalSession).toHaveBeenCalledTimes(1);
    expect(auditWrites).toHaveLength(0);
  });

  test("reports audit failure after an effective revocation without repeating the state mutation", async () => {
    const auditFailure = new Error("postgres audit insert failed");
    const revokePrincipalSession = mock(async () => ({
      principalSessions: { revoked: 1 },
      bindings: { revoked: 1 },
      credentials: { revoked: 0 },
      artifacts: { revoked: 0 },
      cleanup: {
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
    }));
    const recordAuditLog = mock(async () => {
      throw auditFailure;
    });
    const { errorLogs, revoke } = createRevokeHarness({
      deps: {
        control: {
          revokePrincipalSession,
        },
        audit: {
          recordAuditLog,
        },
      },
      audit: {
        actorType: "admin",
        actorUserId: 7,
        actorUsername: "root",
        requestId: "req-audit-failed",
        traceId: "trace-audit-failed",
      },
    });

    await expect(revoke()).rejects.toMatchObject({
      code: "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT",
      httpStatus: 500,
      cause: auditFailure,
    });

    expect(revokePrincipalSession).toHaveBeenCalledTimes(1);
    expect(revokePrincipalSession).toHaveBeenCalledWith("ps-target", "admin_revoke");
    expect(recordAuditLog).toHaveBeenCalledTimes(1);
    expect(errorLogs).toEqual([[
      {
        event: "admin.login_state.audit_failed_after_effect",
        sourceApp: "iam-admin-api",
        requestId: "req-audit-failed",
        traceId: "trace-audit-failed",
        actorUserId: 7,
        targetScope: "session",
        targetPrincipalSessionId: "ps-target",
        changed: true,
        revoked: {
          principalSessions: 1,
          bindings: 1,
          credentials: 0,
          artifacts: 0,
        },
        cleanup: {
          attempted: 1,
          succeeded: 1,
          failed: 0,
        },
        err: auditFailure,
      },
      "admin login state audit failed after effect",
    ]]);
  });

  test("returns and audits changed false when the target is already inactive", async () => {
    const { auditWrites, revoke } = createRevokeHarness({
      input: {
        target: {
          type: "session",
          principalSessionId: "ps-inactive",
        },
      },
      deps: {
        control: {
          revokePrincipalSession: mock(async () => ({
            principalSessions: { revoked: 0, alreadyRevoked: 1, missing: 0, excluded: 0 },
            bindings: { revoked: 0, alreadyRevoked: 2, missing: 0, excluded: 0 },
            credentials: { revoked: 0, alreadyRevoked: 0, missing: 1, excluded: 0 },
            artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
            cleanup: {
              attempted: 0,
              succeeded: 0,
              failed: 0,
              failures: [],
            },
          })),
        },
      },
    });

    const result = await revoke();

    expect(result).toMatchObject({
      changed: false,
      result: {
        scope: "session",
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        cleanup: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
        },
      },
    });
    expect(auditWrites).toEqual([
      expect.objectContaining({
        action: "admin.session.revoke",
        outcome: "success",
        targetCode: "ps-inactive",
        details: expect.objectContaining({
          changed: false,
          cleanupFailedCount: 0,
        }),
      }),
    ]);
  });

  test("wraps a no-effect audit failure without exposing provider details", async () => {
    const auditFailure = Object.assign(
      new Error("postgres://audit-writer secret SQL insert failed for no-op"),
      {
        serviceCode: "AUDIT_PROVIDER_FAILURE",
        serviceDetails: { table: "audit_log" },
      },
    );
    auditFailure.stack = "provider-noop-stack-secret";
    const revokePrincipalSession = mock(async () => ({
      principalSessions: { revoked: 0, alreadyRevoked: 1, missing: 0, excluded: 0 },
      bindings: { revoked: 0, alreadyRevoked: 1, missing: 0, excluded: 0 },
      credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
      artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
      cleanup: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
        failures: [],
      },
    }));
    const { errorLogs, revoke } = createRevokeHarness({
      input: {
        target: {
          type: "session",
          principalSessionId: "ps-inactive",
        },
      },
      deps: {
        control: {
          revokePrincipalSession,
        },
        audit: {
          recordAuditLog: mock(async () => {
            throw auditFailure;
          }),
        },
      },
    });

    let caught: unknown;
    try {
      await revoke();
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: "AdminLoginStateAuditFailedError",
      code: "COMMON.INTERNAL_ERROR",
      httpStatus: 500,
      message: "服务器内部错误",
      cause: auditFailure,
    });
    const publicFailure = caught as {
      name: string;
      code: string;
      httpStatus: number;
      message: string;
      stack?: string;
    };
    expect(JSON.stringify({
      name: publicFailure.name,
      code: publicFailure.code,
      httpStatus: publicFailure.httpStatus,
      message: publicFailure.message,
      stack: publicFailure.stack,
    })).not.toMatch(
      /postgres|secret SQL|provider-noop-stack-secret|AUDIT_PROVIDER_FAILURE|audit_log/,
    );
    expect(revokePrincipalSession).toHaveBeenCalledTimes(1);
    expect(errorLogs).toHaveLength(0);
  });

  test("keeps cleanup failures successful while exposing only safe failure counts", async () => {
    const { auditWrites, revoke } = createRevokeHarness({
      input: {
        target: {
          type: "session",
          principalSessionId: "ps-cleanup-warning",
        },
      },
      deps: {
        control: {
          revokePrincipalSession: mock(async () => ({
            principalSessions: { revoked: 1 },
            bindings: { revoked: 0 },
            credentials: { revoked: 1 },
            artifacts: { revoked: 0 },
            cleanup: {
              attempted: 2,
              succeeded: 1,
              failed: 1,
              failures: [{
                protocol: "oidc",
                kind: "payload",
                ref: "cleanup-ref-secret",
                error: "remote token cleanup failed",
              }],
            },
          })),
        },
      },
    });

    const result = await revoke();

    expect(result).toEqual({
      changed: true,
      result: {
        scope: "session",
        revoked: {
          principalSessions: 1,
          bindings: 0,
          credentials: 1,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 2,
          succeeded: 1,
          failed: 1,
        },
      },
    });
    expect(auditWrites).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          changed: true,
          cleanupFailedCount: 1,
          revoked: {
            principalSessions: 1,
            bindings: 0,
            credentials: 1,
            artifacts: 0,
          },
        }),
      }),
    ]);
    const publicAndAuditOutput = JSON.stringify({ result, auditWrites });
    expect(publicAndAuditOutput).not.toContain("cleanup-ref-secret");
    expect(publicAndAuditOutput).not.toContain("remote token cleanup failed");
    expect(publicAndAuditOutput).not.toContain("failures");
  });

  test("revokes another user's indexed Principal Sessions through one point-in-time control call", async () => {
    const auditContext: AdminAuditContext = {
      actorType: "admin",
      actorUserId: 7,
      actorUsername: "root",
      requestId: "req-user-revoke",
    };
    const {
      auditWrites,
      controlCalls,
      listPrincipalSessions,
      revoke,
      userControlCalls,
    } = createRevokeHarness({
      input: userRevokeInput(),
      audit: auditContext,
      userSummary: revokeSummary({
        principalSessions: { revoked: 2 },
        bindings: { revoked: 3 },
        credentials: { revoked: 4 },
        artifacts: { revoked: 5 },
        cleanup: { attempted: 2, succeeded: 2 },
      }),
    });

    const result = await revoke();

    expect(userControlCalls).toEqual([{
      userId: 42,
      subjectIdentifier: subjectIdentifierFor(42),
      reason: "admin_revoke",
      auditContext,
    }]);
    expect(listPrincipalSessions).not.toHaveBeenCalled();
    expect(controlCalls).toHaveLength(0);
    expect(result).toEqual({
      changed: true,
      result: {
        scope: "user",
        revoked: {
          principalSessions: 2,
          bindings: 3,
          credentials: 4,
          artifacts: 5,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 2,
          succeeded: 2,
          failed: 0,
        },
      },
    });
    expect(auditWrites).toEqual([{
      action: "admin.session.revoke_user",
      outcome: "success",
      actorType: "admin",
      actorUserId: 7,
      actorUsername: "root",
      requestId: "req-user-revoke",
      targetType: "user",
      targetId: 42,
      details: {
        scope: "user",
        changed: true,
        revoked: {
          principalSessions: 2,
          bindings: 3,
          credentials: 4,
          artifacts: 5,
        },
        currentPrincipalSessionExcluded: false,
        cleanupFailedCount: 0,
      },
    }]);
  });

  test("keeps the actor's current root while revoking its children and the actor's other roots", async () => {
    const auditContext: AdminAuditContext = {
      actorType: "admin",
      actorUserId: 7,
      principalSessionId: "ps-current-must-not-be-persisted",
      requestId: "req-self-revoke",
    };
    const {
      auditWrites,
      listPrincipalSessions,
      revoke,
      userControlCalls,
    } = createRevokeHarness({
      input: userRevokeInput(7),
      audit: auditContext,
      userSummary: revokeSummary({
        principalSessions: { revoked: 1, excluded: 1 },
        bindings: { revoked: 2 },
        credentials: { revoked: 3 },
        artifacts: { revoked: 1 },
        cleanup: { attempted: 1, succeeded: 1 },
      }),
    });

    const result = await revoke();

    expect(userControlCalls).toEqual([{
      userId: 7,
      subjectIdentifier: subjectIdentifierFor(7),
      reason: "admin_revoke",
      exceptPrincipalSessionId: "ps-current",
      auditContext,
    }]);
    expect(listPrincipalSessions).not.toHaveBeenCalled();
    expect(result).toEqual({
      changed: true,
      result: {
        scope: "user",
        revoked: {
          principalSessions: 1,
          bindings: 2,
          credentials: 3,
          artifacts: 1,
        },
        currentPrincipalSessionExcluded: true,
        cleanup: {
          attempted: 1,
          succeeded: 1,
          failed: 0,
        },
      },
    });
    expect(auditWrites).toEqual([
      expect.objectContaining({
        action: "admin.session.revoke_user",
        outcome: "success",
        targetType: "user",
        targetId: 7,
        details: expect.objectContaining({
          changed: true,
          currentPrincipalSessionExcluded: true,
        }),
      }),
    ]);
    expect(JSON.stringify(auditWrites)).not.toContain("ps-current");
  });

  test("fails closed with a safe audit when self-revocation has no server current-session ID", async () => {
    const {
      auditWrites,
      errorLogs,
      revoke,
      userControlCalls,
    } = createRevokeHarness({
      input: userRevokeInput(7),
      actor: {
        actorUserId: 7,
        principalSessionId: null,
      },
      audit: {
        actorType: "admin",
        actorUserId: 7,
        principalSessionId: null,
        requestId: "req-missing-current",
      },
      userSummary: revokeSummary({
        principalSessions: { revoked: 99 },
        bindings: { revoked: 99 },
        credentials: { revoked: 99 },
        artifacts: { revoked: 99 },
      }),
    });

    await expect(revoke()).rejects.toMatchObject({
      code: "ADMIN_SESSION_CURRENT_PROTECTED",
      httpStatus: 409,
    });

    expect(userControlCalls).toHaveLength(0);
    expect(errorLogs).toHaveLength(0);
    expect(auditWrites).toEqual([{
      action: "admin.session.revoke_user",
      outcome: "failure",
      actorType: "admin",
      actorUserId: 7,
      requestId: "req-missing-current",
      targetType: "user",
      targetId: 7,
      details: {
        scope: "user",
        changed: false,
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        currentPrincipalSessionProtected: true,
        cleanupFailedCount: 0,
      },
    }]);
  });

  test.each([
    {
      name: "empty user index",
      principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    },
    {
      name: "concurrent revocation already completed",
      principalSessions: { revoked: 0, alreadyRevoked: 2, missing: 1, excluded: 0 },
    },
  ])("returns and audits changed false for $name", async ({ principalSessions }) => {
    const {
      auditWrites,
      revoke,
      userControlCalls,
    } = createRevokeHarness({
      input: userRevokeInput(),
      userSummary: revokeSummary({
        principalSessions,
        bindings: { alreadyRevoked: 2 },
        credentials: { alreadyRevoked: 1, missing: 1 },
        artifacts: { missing: 1 },
      }),
    });

    const result = await revoke();

    expect(userControlCalls).toHaveLength(1);
    expect(result).toEqual({
      changed: false,
      result: {
        scope: "user",
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
        },
      },
    });
    expect(auditWrites).toEqual([
      expect.objectContaining({
        action: "admin.session.revoke_user",
        outcome: "success",
        targetType: "user",
        targetId: 42,
        details: expect.objectContaining({
          changed: false,
          cleanupFailedCount: 0,
        }),
      }),
    ]);
  });

  test("keeps user cleanup failures successful and returns only safe counts", async () => {
    const { auditWrites, revoke } = createRevokeHarness({
      input: userRevokeInput(),
      userSummary: revokeSummary({
        principalSessions: { revoked: 2 },
        bindings: { revoked: 1 },
        credentials: { revoked: 1 },
        cleanup: {
          attempted: 2,
          succeeded: 1,
          failed: 1,
          failures: [{
            protocol: "oidc",
            kind: "payload",
            ref: "cleanup-ref-secret",
            error: "remote token cleanup failed",
          }],
        },
      }),
    });

    const result = await revoke();

    expect(result).toMatchObject({
      changed: true,
      result: {
        scope: "user",
        cleanup: {
          attempted: 2,
          succeeded: 1,
          failed: 1,
        },
      },
    });
    expect(auditWrites).toEqual([
      expect.objectContaining({
        action: "admin.session.revoke_user",
        details: expect.objectContaining({
          cleanupFailedCount: 1,
        }),
      }),
    ]);
    const publicAndAuditOutput = JSON.stringify({ result, auditWrites });
    expect(publicAndAuditOutput).not.toContain("cleanup-ref-secret");
    expect(publicAndAuditOutput).not.toContain("remote token cleanup failed");
    expect(publicAndAuditOutput).not.toContain("failures");
  });

  test("reports user audit failure after effect without repeating or leaking the mutation", async () => {
    const auditFailure = new Error("postgres audit insert failed");
    const {
      auditWrites,
      errorLogs,
      revoke,
      userControlCalls,
    } = createRevokeHarness({
      input: userRevokeInput(),
      audit: {
        actorType: "admin",
        actorUserId: 7,
        requestId: "req-user-audit-failed",
        traceId: "trace-user-audit-failed",
      },
      auditError: auditFailure,
      userSummary: revokeSummary({
        principalSessions: { revoked: 1 },
        bindings: { revoked: 1 },
        cleanup: { attempted: 1, succeeded: 1 },
      }),
    });

    await expect(revoke()).rejects.toMatchObject({
      code: "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT",
      httpStatus: 500,
      cause: auditFailure,
    });

    expect(userControlCalls).toHaveLength(1);
    expect(auditWrites).toHaveLength(1);
    expect(errorLogs).toEqual([[{
      event: "admin.login_state.audit_failed_after_effect",
      sourceApp: "iam-admin-api",
      requestId: "req-user-audit-failed",
      traceId: "trace-user-audit-failed",
      actorUserId: 7,
      targetScope: "user",
      targetUserId: 42,
      changed: true,
      revoked: {
        principalSessions: 1,
        bindings: 1,
        credentials: 0,
        artifacts: 0,
      },
      cleanup: {
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
      err: auditFailure,
    }, "admin login state audit failed after effect"]]);
  });

  test("wraps a user no-effect audit failure without exposing provider details", async () => {
    const auditFailure = Object.assign(
      new Error("postgres://audit-writer secret SQL insert failed for user no-op"),
      {
        serviceCode: "AUDIT_PROVIDER_FAILURE",
        serviceDetails: { table: "audit_log" },
      },
    );
    auditFailure.stack = "provider-user-noop-stack-secret";
    const {
      errorLogs,
      revoke,
      userControlCalls,
    } = createRevokeHarness({
      input: userRevokeInput(),
      auditError: auditFailure,
      userSummary: revokeSummary({
        principalSessions: { alreadyRevoked: 2 },
        bindings: { alreadyRevoked: 1 },
        credentials: { missing: 1 },
      }),
    });

    let caught: unknown;
    try {
      await revoke();
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: "AdminLoginStateAuditFailedError",
      code: "COMMON.INTERNAL_ERROR",
      httpStatus: 500,
      message: "服务器内部错误",
      cause: auditFailure,
    });
    const publicFailure = caught as {
      name: string;
      code: string;
      httpStatus: number;
      message: string;
      stack?: string;
    };
    expect(JSON.stringify({
      name: publicFailure.name,
      code: publicFailure.code,
      httpStatus: publicFailure.httpStatus,
      message: publicFailure.message,
      stack: publicFailure.stack,
    })).not.toMatch(
      /postgres|secret SQL|provider-user-noop-stack-secret|AUDIT_PROVIDER_FAILURE|audit_log/,
    );
    expect(userControlCalls).toHaveLength(1);
    expect(errorLogs).toHaveLength(0);
  });

  test("maps unavailable user control to 503 without writing a mutation audit", async () => {
    const controlFailure = new Error("redis unavailable");
    const {
      auditWrites,
      revoke,
      userControlCalls,
    } = createRevokeHarness({
      input: userRevokeInput(),
      userControlError: controlFailure,
    });

    await expect(revoke()).rejects.toMatchObject({
      code: "ADMIN_LOGIN_STATE_UNAVAILABLE",
      httpStatus: 503,
      cause: controlFailure,
    });
    expect(userControlCalls).toHaveLength(1);
    expect(auditWrites).toHaveLength(0);
  });

  test("lists valid sessions with safe user, authentication, origin, and current-session context", async () => {
    const inventory = {
      listPrincipalSessions: mock(async () => ({
        items: [{
          principalSessionId: "ps-current",
          sessionKind: "browser_user",
          principal: { principalType: "user", subjectId: subjectIdentifierFor(7) },
          authTime: 1_753_689_600_000,
          expiresAt: 1_753_776_000_000,
          amr: ["pwd", "sms", "custom-factor", "pwd"],
          origin: {
            ip: "203.0.113.7",
            userAgent: "Mozilla/5.0 (iPhone) MicroMessenger/8.0.0",
          },
          lastActiveAt: 1_753_700_000_000,
          externalTokenLookupHash: "must-not-leave-service",
          metadata: { secret: true },
          cleanupRefs: [{ ref: "must-not-leave-service" }],
        }],
        total: 30,
      })),
    };
    const users = {
      getSessionManagementUserSummaries: mock(async () => [{
        id: 7,
        subjectIdentifier: subjectIdentifierFor(7),
        username: "alice",
        name: "Alice",
        status: UserStatus.Enable,
        isDelete: false,
      }]),
      getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => [{
        id: 7,
        subjectIdentifier: subjectIdentifierFor(7),
        username: "alice",
        name: "Alice",
        status: UserStatus.Enable,
        isDelete: false,
      }]),
    };
    const service = createSessionManagementService({
      ...unusedMutationDeps(),
      inventory,
      users,
    });

    const result = await service.listSessions(
      { pageNum: 2, pageSize: 20, userId: 7 },
      { actorUserId: 7, principalSessionId: "ps-current" },
    );

    expect(inventory.listPrincipalSessions).toHaveBeenCalledWith({
      offset: 20,
      limit: 20,
      subjectIdentifier: subjectIdentifierFor(7),
    });
    expect(users.getSessionManagementUserSummaries).toHaveBeenCalledWith([7]);
    expect(users.getSessionManagementUserSummariesBySubjectIdentifiers)
      .toHaveBeenCalledWith([subjectIdentifierFor(7)]);
    expect(result).toEqual({
      result: [{
        principalSessionId: "ps-current",
        user: {
          id: 7,
          subjectId: subjectIdentifierFor(7),
          username: "alice",
          name: "Alice",
          accountStatus: "normal",
        },
        authMethods: ["password", "mobile", "unknown"],
        authTime: 1_753_689_600_000,
        expiresAt: 1_753_776_000_000,
        origin: {
          ip: "203.0.113.7",
          deviceType: "mobile",
          operatingSystem: "ios",
          browser: "wechat",
        },
        isCurrentSession: true,
        isCurrentUser: true,
      }],
      total: 30,
      pageNum: 2,
      pageSize: 20,
      pages: 2,
    });
    expect(JSON.stringify(result)).not.toContain("userAgent");
    expect(JSON.stringify(result)).not.toContain("lastActiveAt");
    expect(JSON.stringify(result)).not.toContain("must-not-leave-service");
  });

  test("reports unavailable login state instead of an empty list when inventory cannot be read", async () => {
    const users = {
      getSessionManagementUserSummaries: mock(async () => []),
      getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => []),
    };
    const service = createSessionManagementService({
      ...unusedMutationDeps(),
      inventory: {
        listPrincipalSessions: mock(async () => {
          throw new Error("redis unavailable");
        }),
      },
      users,
    });

    await expect(service.listSessions(
      { pageNum: 1, pageSize: 20 },
      { actorUserId: 99, principalSessionId: "ps-admin" },
    )).rejects.toMatchObject({
      code: "ADMIN_LOGIN_STATE_UNAVAILABLE",
      httpStatus: 503,
    });
    expect(users.getSessionManagementUserSummaries).not.toHaveBeenCalled();
  });

  test("preserves the Kernel expiry order and stable order of equal-score sessions", async () => {
    const service = createSessionManagementService({
      ...unusedMutationDeps(),
      inventory: {
        listPrincipalSessions: mock(async () => ({
          items: [
            {
              principalSessionId: "ps-latest",
              principal: { subjectId: subjectIdentifierFor(1) },
              authTime: 10,
              expiresAt: 300,
              amr: ["pwd"],
            },
            {
              principalSessionId: "ps-tie-first",
              principal: { subjectId: subjectIdentifierFor(2) },
              authTime: 20,
              expiresAt: 200,
              amr: ["sms"],
            },
            {
              principalSessionId: "ps-tie-second",
              principal: { subjectId: subjectIdentifierFor(3) },
              authTime: 30,
              expiresAt: 200,
              amr: ["oa"],
            },
            {
              principalSessionId: "ps-oldest",
              principal: { subjectId: subjectIdentifierFor(4) },
              authTime: 40,
              expiresAt: 100,
              amr: ["wechat"],
            },
          ],
          total: 4,
        })),
      },
      users: {
        getSessionManagementUserSummaries: mock(async () => []),
        getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => []),
      },
    });

    const result = await service.listSessions(
      { pageNum: 1, pageSize: 20 },
      { actorUserId: 99, principalSessionId: "ps-admin" },
    );

    expect(result.result.map(session => ({
      principalSessionId: session.principalSessionId,
      expiresAt: session.expiresAt,
    }))).toEqual([
      { principalSessionId: "ps-latest", expiresAt: 300 },
      { principalSessionId: "ps-tie-first", expiresAt: 200 },
      { principalSessionId: "ps-tie-second", expiresAt: 200 },
      { principalSessionId: "ps-oldest", expiresAt: 100 },
    ]);
  });

  test("keeps paused, ended, deleted, and missing users visible without inventing identity data", async () => {
    const inventoryItems = [
      { principalSessionId: "ps-paused", principal: { subjectId: subjectIdentifierFor(1) } },
      { principalSessionId: "ps-ended", principal: { subjectId: subjectIdentifierFor(2) } },
      { principalSessionId: "ps-deleted", principal: { subjectId: subjectIdentifierFor(3) } },
      { principalSessionId: "ps-missing", principal: { subjectId: subjectIdentifierFor(4) } },
      { principalSessionId: "ps-unknown", principal: {
        subjectId: "00000000-0000-4000-8000-999999999999",
      } },
    ].map(item => ({
      ...item,
      authTime: 1,
      expiresAt: 2,
      amr: [],
    }));
    const users = {
      getSessionManagementUserSummaries: mock(async () => [
        {
          id: 1,
          subjectIdentifier: subjectIdentifierFor(1),
          username: "paused",
          name: "Paused",
          status: UserStatus.Pause,
          isDelete: false,
        },
        {
          id: 2,
          subjectIdentifier: subjectIdentifierFor(2),
          username: "ended",
          name: "Ended",
          status: UserStatus.Disable,
          isDelete: false,
        },
        {
          id: 3,
          subjectIdentifier: subjectIdentifierFor(3),
          username: "deleted",
          name: "Deleted",
          status: UserStatus.Enable,
          isDelete: true,
        },
      ]),
      getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => [
        {
          id: 1,
          subjectIdentifier: subjectIdentifierFor(1),
          username: "paused",
          name: "Paused",
          status: UserStatus.Pause,
          isDelete: false,
        },
        {
          id: 2,
          subjectIdentifier: subjectIdentifierFor(2),
          username: "ended",
          name: "Ended",
          status: UserStatus.Disable,
          isDelete: false,
        },
        {
          id: 3,
          subjectIdentifier: subjectIdentifierFor(3),
          username: "deleted",
          name: "Deleted",
          status: UserStatus.Enable,
          isDelete: true,
        },
      ]),
    };
    const service = createSessionManagementService({
      ...unusedMutationDeps(),
      inventory: {
        listPrincipalSessions: mock(async () => ({ items: inventoryItems, total: inventoryItems.length })),
      },
      users,
    });

    const result = await service.listSessions(
      { pageNum: 1, pageSize: 20 },
      { actorUserId: 99, principalSessionId: "ps-admin" },
    );

    expect(users.getSessionManagementUserSummariesBySubjectIdentifiers).toHaveBeenCalledWith([
      subjectIdentifierFor(1),
      subjectIdentifierFor(2),
      subjectIdentifierFor(3),
      subjectIdentifierFor(4),
      "00000000-0000-4000-8000-999999999999",
    ]);
    expect(result.result.map(session => session.user)).toEqual([
      {
        id: 1,
        subjectId: subjectIdentifierFor(1),
        username: "paused",
        name: "Paused",
        accountStatus: "paused",
      },
      {
        id: 2,
        subjectId: subjectIdentifierFor(2),
        username: "ended",
        name: "Ended",
        accountStatus: "ended",
      },
      {
        id: 3,
        subjectId: subjectIdentifierFor(3),
        username: "deleted",
        name: "Deleted",
        accountStatus: "deleted",
      },
      {
        id: null,
        subjectId: subjectIdentifierFor(4),
        username: null,
        name: null,
        accountStatus: "unknown",
      },
      {
        id: null,
        subjectId: "00000000-0000-4000-8000-999999999999",
        username: null,
        name: null,
        accountStatus: "unknown",
      },
    ]);
    expect(result.result.every(session => session.authMethods[0] === "unknown")).toBe(true);
    expect(result.result.every(session => session.origin === null)).toBe(true);
  });

  test("does not disguise a user-summary infrastructure failure as unknown users", async () => {
    const databaseError = new Error("database unavailable");
    const service = createSessionManagementService({
      ...unusedMutationDeps(),
      inventory: {
        listPrincipalSessions: mock(async () => ({
          items: [{
            principalSessionId: "ps-1",
            principal: { subjectId: subjectIdentifierFor(1) },
            authTime: 1,
            expiresAt: 2,
            amr: ["pwd"],
          }],
          total: 1,
        })),
      },
      users: {
        getSessionManagementUserSummaries: mock(async () => []),
        getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => {
          throw databaseError;
        }),
      },
    });

    await expect(service.listSessions(
      { pageNum: 1, pageSize: 20 },
      { actorUserId: 99, principalSessionId: "ps-admin" },
    )).rejects.toBe(databaseError);
  });

  test("classifies only the agreed coarse device, operating-system, and browser families", async () => {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Edg/126.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Version/17.5 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Chrome/126.0",
      "Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/126.0",
      "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
      "curl/8.8.0",
    ];
    const service = createSessionManagementService({
      ...unusedMutationDeps(),
      inventory: {
        listPrincipalSessions: mock(async () => ({
          items: userAgents.map((userAgent, index) => ({
            principalSessionId: `ps-${index}`,
            principal: { subjectId: subjectIdentifierFor(1) },
            authTime: 1,
            expiresAt: 2,
            amr: ["oa", "wechat"],
            origin: { userAgent },
          })),
          total: userAgents.length,
        })),
      },
      users: {
        getSessionManagementUserSummaries: mock(async () => []),
        getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => []),
      },
    });

    const result = await service.listSessions(
      { pageNum: 1, pageSize: 20 },
      { actorUserId: 99, principalSessionId: "ps-admin" },
    );

    expect(result.result.map(session => session.origin)).toEqual([
      { ip: null, deviceType: "desktop", operatingSystem: "windows", browser: "edge" },
      { ip: null, deviceType: "desktop", operatingSystem: "macos", browser: "safari" },
      { ip: null, deviceType: "mobile", operatingSystem: "android", browser: "chrome" },
      { ip: null, deviceType: "tablet", operatingSystem: "android", browser: "chrome" },
      { ip: null, deviceType: "desktop", operatingSystem: "linux", browser: "firefox" },
      { ip: null, deviceType: "unknown", operatingSystem: "unknown", browser: "other" },
    ]);
    expect(result.result.every(session => (
      session.authMethods.join(",") === "oa,wechat"
    ))).toBe(true);
  });

  test("lists Temporary Login Restrictions with exact users and canonical restriction facts", async () => {
    const {
      getSessionManagementUserSummaries,
      list,
      listRestrictions,
    } = createLoginRestrictionHarness({
      listResult: {
        items: [loginRestrictionState()],
        total: 1,
      },
      users: [{
        id: 7,
        subjectIdentifier: subjectIdentifierFor(7),
        username: "alice",
        name: "Alice",
        status: UserStatus.Pause,
        isDelete: false,
      }],
    });

    const result = await list({
      pageNum: 1,
      pageSize: 20,
      userId: 7,
    });

    expect(listRestrictions).toHaveBeenCalledWith({
      offset: 0,
      limit: 20,
      userId: 7,
    });
    expect(getSessionManagementUserSummaries).toHaveBeenCalledWith([7]);
    expect(result).toEqual({
      result: [{
        user: {
          id: 7,
          username: "alice",
          name: "Alice",
          accountStatus: "paused",
        },
        cause: "too_many_login_failures",
        triggerMethod: "mobile",
        restrictedUntil: 1_753_776_000_000,
        remainingSeconds: 1_799,
      }],
      total: 1,
      pageNum: 1,
      pageSize: 20,
      pages: 1,
    });
  });

  test("atomically releases a Temporary Login Restriction and audits only safe facts", async () => {
    const harness = createLoginRestrictionHarness({
      clearResult: {
        changed: true,
        failureStateCleared: true,
        restriction: loginRestrictionState(),
      },
    });
    const {
      auditWrites,
      clearLoginState,
      release,
    } = harness;

    const result = await release(7, {
      actorType: "admin",
      actorUserId: 99,
      actorUsername: "root",
      principalSessionId: "ps-actor-must-not-be-persisted",
      requestId: "req-release",
      traceId: "trace-release",
      ip: "203.0.113.99",
      userAgent: "actor-browser",
    });

    expect(clearLoginState).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      changed: true,
      result: {
        failureStateCleared: true,
      },
    });
    expect(auditWrites).toEqual([{
      action: "admin.login_restriction.release",
      outcome: "success",
      actorType: "admin",
      actorUserId: 99,
      actorUsername: "root",
      requestId: "req-release",
      traceId: "trace-release",
      ip: "203.0.113.99",
      userAgent: "actor-browser",
      targetType: "user",
      targetId: 7,
      details: {
        cause: "too_many_login_failures",
        triggerMethod: "mobile",
        changed: true,
        failureStateCleared: true,
      },
    }]);
    expect(JSON.stringify(auditWrites)).not.toContain("ps-actor-must-not-be-persisted");
    expectNoPrincipalSessionEffects(harness);
  });

  test("keeps deleted and missing users visible in the restriction inventory", async () => {
    const { list } = createLoginRestrictionHarness({
      listResult: {
        items: [
          loginRestrictionState({
            triggerMethod: "password",
            restrictedUntil: 300,
            remainingSeconds: 30,
          }),
          loginRestrictionState({
            userId: 8,
            triggerMethod: "unknown",
            restrictedUntil: 200,
            remainingSeconds: 20,
          }),
        ],
        total: 2,
      },
      users: [{
        id: 7,
        subjectIdentifier: subjectIdentifierFor(7),
        username: "deleted-user",
        name: "Deleted User",
        status: UserStatus.Enable,
        isDelete: true,
      }],
    });

    const result = await list({
      pageNum: 1,
      pageSize: 20,
    });

    expect(result.result.map(item => item.user)).toEqual([
      {
        id: 7,
        username: "deleted-user",
        name: "Deleted User",
        accountStatus: "deleted",
      },
      {
        id: 8,
        username: null,
        name: null,
        accountStatus: "unknown",
      },
    ]);
    expect(result.result.map(item => ({
      userId: item.user.id,
      restrictedUntil: item.restrictedUntil,
    }))).toEqual([
      { userId: 7, restrictedUntil: 300 },
      { userId: 8, restrictedUntil: 200 },
    ]);
  });

  test("returns a no-op release with an unknown trigger and a success audit", async () => {
    const harness = createLoginRestrictionHarness();
    const { auditWrites, release } = harness;

    await expect(release()).resolves.toEqual({
      changed: false,
      result: {
        failureStateCleared: true,
      },
    });
    expect(auditWrites).toEqual([{
      action: "admin.login_restriction.release",
      outcome: "success",
      actorType: "admin",
      actorUserId: 99,
      targetType: "user",
      targetId: 7,
      details: {
        cause: "too_many_login_failures",
        triggerMethod: "unknown",
        changed: false,
        failureStateCleared: true,
      },
    }]);
    expectNoPrincipalSessionEffects(harness);
  });

  test.each([
    {
      name: "inventory",
      invoke: (harness: ReturnType<typeof createLoginRestrictionHarness>) =>
        harness.list({ pageNum: 1, pageSize: 20 }),
      listError: new Error("redis inventory unavailable"),
      clearError: undefined,
    },
    {
      name: "release",
      invoke: (harness: ReturnType<typeof createLoginRestrictionHarness>) =>
        harness.release(),
      listError: undefined,
      clearError: new Error("redis clear unavailable"),
    },
  ])("maps unavailable restriction $name state to the shared admin 503", async (testCase) => {
    const harness = createLoginRestrictionHarness({
      listError: testCase.listError,
      clearError: testCase.clearError,
    });

    await expect(testCase.invoke(harness)).rejects.toMatchObject({
      code: "ADMIN_LOGIN_STATE_UNAVAILABLE",
      httpStatus: 503,
      cause: testCase.listError ?? testCase.clearError,
    });
    expect(harness.auditWrites).toHaveLength(0);
    expectNoPrincipalSessionEffects(harness);
  });

  test("reports an audit failure after a changed release without retrying or touching sessions", async () => {
    const auditFailure = new Error("postgres audit unavailable");
    const harness = createLoginRestrictionHarness({
      auditError: auditFailure,
      clearResult: {
        changed: true,
        failureStateCleared: true,
        restriction: loginRestrictionState({
          triggerMethod: "password",
          restrictedUntil: 300,
          remainingSeconds: 30,
        }),
      },
    });
    const {
      clearLoginState,
      errorLogs,
      release,
      revokePrincipalSession,
      revokeUserSessions,
    } = harness;

    await expect(release(7, {
      actorType: "admin",
      actorUserId: 99,
      requestId: "req-audit-failed",
      traceId: "trace-audit-failed",
    })).rejects.toMatchObject({
      code: "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT",
      httpStatus: 500,
      cause: auditFailure,
    });
    expect(clearLoginState).toHaveBeenCalledTimes(1);
    expect(revokePrincipalSession).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
    expect(errorLogs).toEqual([[
      expect.objectContaining({
        event: "admin.login_state.audit_failed_after_effect",
        actorUserId: 99,
        targetScope: "login_restriction",
        targetUserId: 7,
        cause: "too_many_login_failures",
        triggerMethod: "password",
        changed: true,
        failureStateCleared: true,
        err: auditFailure,
      }),
      "admin login state audit failed after effect",
    ]]);
    expectNoPrincipalSessionEffects(harness);
  });

  test("keeps a no-op release audit failure pre-effect and safely generic", async () => {
    const harness = createLoginRestrictionHarness({
      auditError: new Error("postgres connection secret"),
    });
    const {
      errorLogs,
      release,
    } = harness;

    await expect(release()).rejects.toMatchObject({
      code: "COMMON.INTERNAL_ERROR",
      httpStatus: 500,
      message: "服务器内部错误",
    });
    expect(errorLogs).toHaveLength(0);
    expectNoPrincipalSessionEffects(harness);
  });
});
