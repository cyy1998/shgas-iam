import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { LoginRestriction } from "@iam/api-core/login-restriction";
import type { SessionKernel } from "@iam/api-core/session/kernel";
import type { AdminApiRedisTestHarness, AdminApiRedisTestScope } from "./redis-test-harness";
import { randomUUID } from "node:crypto";
import { createSessionManagementService } from "@admin-api/services/session-management/session-management.service";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { createLoginRestriction, createRedisLoginRestrictionStore, LOGIN_FAILURE_THRESHOLD } from "@iam/api-core/login-restriction";
import { createSessionKernel, createSessionKernelConfig } from "@iam/api-core/session/kernel";
import { UserStatus } from "@iam/contracts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createAdminApiRedisTestHarness } from "./redis-test-harness";

const subjectIdentifier = "00000000-0000-4000-8000-000000000007";
const auditContext = { actorType: "admin" as const, actorUserId: 7 };
let harness: AdminApiRedisTestHarness | undefined;
let scope: AdminApiRedisTestScope | undefined;
let kernel: SessionKernel;
let observer: SessionKernel;
let restrictions: LoginRestriction;
let restrictionObserver: LoginRestriction;
let service: ReturnType<typeof createSessionManagementService>;
let auditWrites: AuditLogInput[];
let auditFailure: Error | undefined;
let cleanupFailure: boolean;
let errorLogs: Record<string, unknown>[];

beforeAll(async () => {
  harness = await createAdminApiRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createScope();
  auditWrites = [];
  errorLogs = [];
  auditFailure = undefined;
  cleanupFailure = false;
  const config = createSessionKernelConfig({
    namespace: scope.clientCode("session-management"),
    lookupHmacKeys: {
      current: {
        id: "admin-redis-test",
        secret: "admin-session-management-redis-test-secret-000000000000",
      },
    },
    principalAbsoluteTtlMs: 60_000,
    principalIdleTtlMs: 30_000,
  });
  const principalAccessFence = {
    capture: async () => "00000000-0000-4000-8000-000000000002",
    validate: async () => ({ ok: true as const }),
  };
  kernel = createSessionKernel({
    config,
    principalAccessFence,
    redis: scope.redis,
    cleanupAdapters: [{
      protocol: "oidc",
      kind: "test-artifact",
      async cleanup() {
        if (cleanupFailure)
          throw new Error("private cleanup adapter failure");
      },
    }, {
      protocol: "oidc",
      kind: "successful-test-artifact",
      async cleanup() {},
    }],
  });
  observer = createSessionKernel({ config, principalAccessFence, redis: scope.observer });
  const keyPrefix = scope.clientCode("login-restriction");
  restrictions = createLoginRestriction({
    clock: { now: Date.now },
    random: { uuid: randomUUID },
    store: createRedisLoginRestrictionStore({ keyPrefix, redis: scope.redis }),
  });
  restrictionObserver = createLoginRestriction({
    clock: { now: Date.now },
    random: { uuid: randomUUID },
    store: createRedisLoginRestrictionStore({ keyPrefix, redis: scope.observer }),
  });
  const user = {
    id: 7,
    subjectIdentifier,
    username: "admin",
    name: "Admin",
    status: UserStatus.Enable,
    isDelete: false,
  };
  service = createSessionManagementService({
    audit: {
      async recordAuditLog(input) {
        if (auditFailure)
          throw auditFailure;
        auditWrites.push(input);
      },
    },
    control: kernel,
    inventory: kernel,
    loginRestrictions: restrictions,
    logger: { error: fields => errorLogs.push(fields) },
    userControl: createAdminSessionRevocationPort({
      sessionKernel: kernel,
      logger: {
        logUserRevocation() {},
        logClientProtocolRevocation() {},
        logClientAllProtocolsRevocation() {},
      },
    }),
    users: {
      getSessionManagementUserSummaries: async ids => ids.includes(user.id) ? [user] : [],
      getSessionManagementUserSummariesBySubjectIdentifiers: async ids => ids.includes(subjectIdentifier) ? [user] : [],
    },
  });
});

afterEach(async () => {
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

async function createSessionTree(withCleanup = false) {
  const root = await kernel.createPrincipalSession(subjectIdentifier);
  if (root.status !== "created" || !root.externalToken)
    throw new Error("expected Principal Session fixture");
  const principalSessionId = root.value.principalSessionId;
  const clientCode = scope!.clientCode("client");
  const binding = await kernel.createClientBinding({
    principalSessionId,
    clientCode,
    protocol: "oidc",
    ttlMs: 30_000,
  });
  if (binding.status !== "created")
    throw new Error("expected Client Binding fixture");
  const credential = await kernel.issueCredential({
    principalSessionId,
    bindingId: binding.value.bindingId,
    clientCode,
    protocol: "oidc",
    credentialType: "access_token",
    ttlMs: 30_000,
  });
  if (credential.status !== "created" || !credential.externalToken)
    throw new Error("expected Credential fixture");
  const artifact = await kernel.createProtocolArtifact({
    principalSessionId,
    bindingId: binding.value.bindingId,
    clientCode,
    protocol: "oidc",
    artifactType: "authorization_code",
    ttlMs: 30_000,
    cleanupRefs: withCleanup
      ? [
          { protocol: "oidc", kind: "test-artifact", ref: "private-cleanup-reference" },
          { protocol: "oidc", kind: "successful-test-artifact", ref: "private-successful-reference" },
        ]
      : [],
  });
  if (artifact.status !== "created" || !artifact.externalToken)
    throw new Error("expected Protocol Artifact fixture");
  return {
    principalSessionId,
    rootToken: root.externalToken,
    bindingId: binding.value.bindingId,
    credentialToken: credential.externalToken,
    artifactToken: artifact.externalToken,
  };
}

async function observeTree(tree: Awaited<ReturnType<typeof createSessionTree>>) {
  const root = await observer.resolvePrincipalSession(tree.rootToken);
  const binding = await observer.resolveClientBindingById(tree.bindingId);
  const credential = await observer.resolveCredential(tree.credentialToken);
  const artifact = await observer.resolveProtocolArtifact(tree.artifactToken);
  return [root.status, binding.status, credential.status, artifact.status];
}

async function restrictUser() {
  for (let attempt = 0; attempt < LOGIN_FAILURE_THRESHOLD; attempt += 1)
    await restrictions.recordFailure({ userId: 7, triggerMethod: "password" });
  const restriction = await restrictionObserver.getRestriction(7);
  expect(restriction).not.toBeNull();
}

describe("Admin session mutations with real Redis owners", () => {
  test("protects the current root and its children from single-session revocation", async () => {
    const current = await createSessionTree();
    let failure: unknown;
    try {
      await service.revokeSessions(
        { target: { type: "session", principalSessionId: current.principalSessionId } },
        { actorUserId: 7, principalSessionId: current.principalSessionId },
        auditContext,
      );
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "ADMIN_SESSION_CURRENT_PROTECTED" });
    const states = await observeTree(current);
    expect(states).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    expect(auditWrites).toMatchObject([{ outcome: "failure", details: { changed: false } }]);
  });

  test("returns actual single-session cascade counts and a repeated no-op", async () => {
    const current = await createSessionTree();
    const target = await createSessionTree();
    const actor = { actorUserId: 7, principalSessionId: current.principalSessionId };
    const input = { target: { type: "session" as const, principalSessionId: target.principalSessionId } };
    const revoked = await service.revokeSessions(input, actor, auditContext);
    expect(revoked).toEqual({
      changed: true,
      result: {
        scope: "session",
        revoked: { principalSessions: 1, bindings: 1, credentials: 1, artifacts: 1 },
        currentPrincipalSessionExcluded: false,
        cleanup: { attempted: 0, succeeded: 0, failed: 0 },
      },
    });
    const targetStates = await observeTree(target);
    const currentStates = await observeTree(current);
    expect(targetStates).toEqual(["revoked", "revoked", "revoked", "revoked"]);
    expect(currentStates).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    const repeated = await service.revokeSessions(input, actor, auditContext);
    expect(repeated).toEqual({
      changed: false,
      result: {
        scope: "session",
        revoked: { principalSessions: 0, bindings: 0, credentials: 0, artifacts: 0 },
        currentPrincipalSessionExcluded: false,
        cleanup: { attempted: 0, succeeded: 0, failed: 0 },
      },
    });
    expect(auditWrites).toMatchObject([
      { outcome: "success", details: { changed: true } },
      { outcome: "success", details: { changed: false } },
    ]);
  });

  test("user revocation preserves only the current root while revoking its children and other roots", async () => {
    const current = await createSessionTree();
    const other = await createSessionTree();
    const actor = { actorUserId: 7, principalSessionId: current.principalSessionId };
    const result = await service.revokeSessions({ target: { type: "user", userId: 7 } }, actor, auditContext);
    expect(result).toEqual({
      changed: true,
      result: {
        scope: "user",
        revoked: { principalSessions: 1, bindings: 2, credentials: 2, artifacts: 2 },
        currentPrincipalSessionExcluded: true,
        cleanup: { attempted: 0, succeeded: 0, failed: 0 },
      },
    });
    const currentStates = await observeTree(current);
    const otherStates = await observeTree(other);
    expect(currentStates).toEqual(["resolved", "revoked", "revoked", "revoked"]);
    expect(otherStates).toEqual(["revoked", "revoked", "revoked", "revoked"]);
    const repeated = await service.revokeSessions({ target: { type: "user", userId: 7 } }, actor, auditContext);
    expect(repeated).toMatchObject({
      changed: false,
      result: {
        currentPrincipalSessionExcluded: true,
        revoked: { principalSessions: 0, bindings: 0, credentials: 0, artifacts: 0 },
      },
    });
  });

  test("cleanup failure preserves real revocation counts and exposes only a safe summary", async () => {
    const target = await createSessionTree(true);
    cleanupFailure = true;
    const result = await service.revokeSessions(
      { target: { type: "session", principalSessionId: target.principalSessionId } },
      { actorUserId: 7, principalSessionId: "different-current-root" },
      auditContext,
    );
    expect(result).toEqual({
      changed: true,
      result: {
        scope: "session",
        revoked: { principalSessions: 1, bindings: 1, credentials: 1, artifacts: 1 },
        currentPrincipalSessionExcluded: false,
        cleanup: { attempted: 2, succeeded: 1, failed: 1 },
      },
    });
    const states = await observeTree(target);
    expect(states).toEqual(["revoked", "revoked", "revoked", "revoked"]);
    const publicOutput = JSON.stringify({ result, auditWrites });
    for (const secret of [target.rootToken, target.credentialToken, target.artifactToken, "private-cleanup-reference", "private-successful-reference", "private cleanup adapter failure"])
      expect(publicOutput).not.toContain(secret);
  });

  test("a missing user returns a no-op intention audit without revoking existing sessions", async () => {
    const current = await createSessionTree();
    const result = await service.revokeSessions(
      { target: { type: "user", userId: 404 } },
      { actorUserId: 7, principalSessionId: current.principalSessionId },
      auditContext,
    );
    expect(result).toEqual({
      changed: false,
      result: {
        scope: "user",
        revoked: { principalSessions: 0, bindings: 0, credentials: 0, artifacts: 0 },
        currentPrincipalSessionExcluded: false,
        cleanup: { attempted: 0, succeeded: 0, failed: 0 },
      },
    });
    expect(auditWrites).toMatchObject([{
      action: "admin.session.revoke_user",
      outcome: "success",
      targetId: 404,
      details: { changed: false },
    }]);
    const states = await observeTree(current);
    expect(states).toEqual(["resolved", "resolved", "resolved", "resolved"]);
  });

  test("clearing only failure history is unchanged and new failures start from one", async () => {
    const current = await createSessionTree();
    await restrictions.recordFailure({ userId: 7, triggerMethod: "password" });
    const released = await service.releaseLoginRestriction({ userId: 7 }, auditContext);
    expect(released).toEqual({ changed: false, result: { failureStateCleared: true } });
    const nextFailure = await restrictionObserver.recordFailure({ userId: 7, triggerMethod: "mobile" });
    expect(nextFailure).toMatchObject({ failureCount: 1, newlyRestricted: false, restriction: null });
    const states = await observeTree(current);
    expect(states).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    expect(auditWrites).toMatchObject([{ outcome: "success", details: { changed: false, failureStateCleared: true } }]);
  });

  test("releasing an active restriction changes it once and preserves existing sessions", async () => {
    const current = await createSessionTree();
    await restrictUser();
    const released = await service.releaseLoginRestriction({ userId: 7 }, auditContext);
    const restriction = await restrictionObserver.getRestriction(7);
    const repeated = await service.releaseLoginRestriction({ userId: 7 }, auditContext);
    expect(released).toEqual({ changed: true, result: { failureStateCleared: true } });
    expect(restriction).toBeNull();
    expect(repeated).toEqual({ changed: false, result: { failureStateCleared: true } });
    const states = await observeTree(current);
    expect(states).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    expect(auditWrites).toMatchObject([
      { outcome: "success", details: { changed: true, failureStateCleared: true } },
      { outcome: "success", details: { changed: false, failureStateCleared: true } },
    ]);
  });

  test("audit failure after revocation leaves the committed Redis cascade revoked", async () => {
    const target = await createSessionTree();
    auditFailure = new Error("audit unavailable");
    let failure: unknown;
    try {
      await service.revokeSessions(
        { target: { type: "session", principalSessionId: target.principalSessionId } },
        { actorUserId: 7, principalSessionId: "different-current-root" },
        auditContext,
      );
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT", cause: auditFailure });
    const states = await observeTree(target);
    expect(states).toEqual(["revoked", "revoked", "revoked", "revoked"]);
    expect(errorLogs).toMatchObject([{ changed: true, targetScope: "session" }]);
  });

  test("audit failure after restriction release does not restore restriction or failure history", async () => {
    await restrictUser();
    auditFailure = new Error("audit unavailable");
    let failure: unknown;
    try {
      await service.releaseLoginRestriction({ userId: 7 }, auditContext);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT", cause: auditFailure });
    const restriction = await restrictionObserver.getRestriction(7);
    const nextFailure = await restrictionObserver.recordFailure({ userId: 7, triggerMethod: "mobile" });
    expect(restriction).toBeNull();
    expect(nextFailure).toMatchObject({ failureCount: 1, newlyRestricted: false });
    expect(errorLogs).toMatchObject([{ changed: true, targetScope: "login_restriction" }]);
  });
});
