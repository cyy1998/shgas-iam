import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { LoginRestriction } from "@iam/api-core/login-restriction";
import type { SessionKernel } from "@iam/session-kernel";
import type { AdminApiRedisTestHarness, AdminApiRedisTestScope } from "./redis-test-harness";
import { randomUUID } from "node:crypto";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createAdminAuthorizationAdapter } from "@admin-api/routes/admin/authorization/authorization.adapter";
import { createAdminAuthorizationContextHandler } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createSessionManagementService } from "@admin-api/services/session-management/session-management.service";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { createLoginRestriction, createRedisLoginRestrictionStore, LOGIN_FAILURE_THRESHOLD } from "@iam/api-core/login-restriction";
import { createRedisSubjectAccessStore, createSubjectAccessBarrier, createSubjectAccessBootstrap, createSubjectAccessOperations, createSubjectAccessSessionRevocation, encodeSubjectAccessContext, SubjectAccessDisabledError } from "@iam/api-core/subject-access";
import { createTRPCContext } from "@iam/api-core/trpc";
import { UserStatus, UserType } from "@iam/contracts";
import { createSessionKernel, createSessionKernelConfig } from "@iam/session-kernel";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
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
let accountStatus: UserStatus;

beforeAll(async () => {
  harness = await createAdminApiRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createScope();
  auditWrites = [];
  errorLogs = [];
  auditFailure = undefined;
  cleanupFailure = false;
  accountStatus = UserStatus.Enable;
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
  kernel = createSessionKernel({
    config,
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
  observer = createSessionKernel({ config, redis: scope.observer });
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
    get status() { return accountStatus; },
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
        logPreparationFailure() {},
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
  const transitionId = "00000000-0000-4000-8000-000000000002";
  const root = await kernel.createPrincipalSession(subjectIdentifier, {
    subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId }),
  });
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
  for (const path of ["/admin/capabilities", "/rpc/capabilitySummary?input=%7B%7D"]) {
    test(`real Redis permission survives in-flight disable and rejects the next ${path} request`, async () => {
      const subject = randomUUID();
      const keyPrefix = `${scope!.clientCode("operation-barrier")}:`;
      const random = { uuid: randomUUID };
      const clock = { nowDate: () => new Date() };
      await createSubjectAccessBootstrap({ redis: scope!.redis, random, keyPrefix }).seedMany([{ subjectIdentifier: subject, state: "enabled" }], clock.nowDate());
      const barrier = createSubjectAccessBarrier({ random, clock, store: createRedisSubjectAccessStore({ redis: scope!.redis, keyPrefix }) });
      const transitionId = await barrier.readCommittedTransitionId(subject);
      const root = await kernel.createPrincipalSession(subject, { subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier: subject, transitionId }) });
      if (root.status !== "created" || !root.externalToken)
        throw new Error("expected administrator root");
      let reads = 0;
      let profileReads = 0;
      const operations = createSubjectAccessOperations({
        barrier: { readCommittedTransitionId: async (id) => {
          reads += 1;
          return await barrier.readCommittedTransitionId(id);
        } },
        revocation: createSubjectAccessSessionRevocation(kernel),
      });
      const authentication = createAdminAuthenticationHandlers({
        sessionKernel: kernel,
        subjectAccess: operations,
        config: { allowedClientCodes: ["iam-admin"] },
        userService: { getUserDetailForPermittedAdmin: async (operation, id) => {
          profileReads += 1;
          const transition = await barrier.beginBlocking(subject);
          await barrier.prepareRepair(transition, "disabled");
          await barrier.finalize(transition, "disabled");
          operation.requirePermission(id);
          const resumed = await kernel.renewPrincipalSession(root.value.principalSessionId);
          expect(resumed.status).toBe("resolved");
          return { id: 99, username: "admin", name: "Admin", userType: UserType.Formal, mobile: null, wxId: null, status: UserStatus.Disable, orderNum: 0, isDelete: true, createTime: new Date(), updateTime: new Date(), description: null, employments: [], roles: ["iam:admin"], privileges: [] };
        } },
      });
      const app = new Hono();
      app.use("*", authentication.adminAuthenticationHandler);
      app.use("*", createAdminAuthorizationContextHandler(createAdminAuthorizationPolicy({ logger: { warn() {} }, hrAdministrationScopeResolver: { resolveForActor: async () => null } })));
      const adapter = createAdminAuthorizationAdapter();
      app.get("/admin/capabilities", c => adapter.capabilitySummary(c as never, async () => {}));
      app.all("/rpc/*", async c => await fetchRequestHandler({ endpoint: "/rpc", req: c.req.raw, router: adapter.authorizationAdminRouter, createContext: () => createTRPCContext({ honoCtx: c }) }));
      app.onError((error, c) => c.text(error.message, ("httpStatus" in error ? error.httpStatus : 500) as never));
      const request = () => app.request(`http://localhost${path}`, { headers: { Client: "iam-admin", Cookie: `global_session=${root.externalToken}` } });
      const allowed = await request();
      expect(allowed.status).toBe(200);
      expect(reads).toBe(1);
      const denied = await request();
      expect(denied.status).toBe(401);
      expect(denied.headers.getSetCookie()).toHaveLength(2);
      expect(reads).toBe(2);
      expect(profileReads).toBe(1);
    });
  }

  test("lists and revokes old records without checking target access or cleaning their trees", async () => {
    const target = await createSessionTree();
    const another = await createSessionTree();
    const adminSubject = "00000000-0000-4000-8000-000000000099";
    const transitionId = "00000000-0000-4000-8000-000000000003";
    const admin = await kernel.createPrincipalSession(adminSubject, {
      subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier: adminSubject, transitionId }),
    });
    if (admin.status !== "created" || !admin.externalToken)
      throw new Error("expected admin session");
    let barrierReads = 0;
    const operations = createSubjectAccessOperations({
      barrier: {
        async readCommittedTransitionId(subject) {
          barrierReads += 1;
          if (subject === adminSubject)
            return transitionId;
          throw new SubjectAccessDisabledError();
        },
      },
      revocation: createSubjectAccessSessionRevocation(kernel),
    });
    accountStatus = UserStatus.Disable;
    const actor = { actorUserId: 99, principalSessionId: "another-admin-root" };
    const authentication = createAdminAuthenticationHandlers({
      sessionKernel: kernel,
      subjectAccess: operations,
      config: { allowedClientCodes: ["iam-admin"] },
      userService: {
        async getUserDetailForPermittedAdmin(operation, subject) {
          operation.requirePermission(subject);
          return {
            id: 99,
            username: "admin",
            name: "Admin",
            userType: UserType.Formal,
            mobile: null,
            wxId: null,
            status: UserStatus.Enable,
            orderNum: 0,
            isDelete: false,
            createTime: new Date(),
            updateTime: new Date(),
            description: null,
            employments: [],
            roles: ["iam:admin"],
            privileges: [],
          };
        },
      },
    });
    const app = new Hono();
    app.use("*", authentication.adminAuthenticationHandler);
    app.get("/records", async c => c.json(await service.listSessions({ pageNum: 1, pageSize: 1, userId: 7 }, actor)));
    const response = await app.request("http://localhost/records", {
      headers: { Client: "iam-admin", Authorization: admin.externalToken },
    });
    expect(response.status).toBe(200);
    const first = await response.json();
    const second = await service.listSessions({ pageNum: 2, pageSize: 1, userId: 7 }, actor);
    const refreshed = await service.listSessions({ pageNum: 1, pageSize: 10, userId: 7 }, actor);
    expect(first).toMatchObject({ total: 2, pages: 2, result: [{ user: { accountStatus: "ended" } }] });
    expect(second.result).toHaveLength(1);
    expect(first).not.toMatchObject({ result: [{ principalSessionId: second.result[0]?.principalSessionId }] });
    expect(refreshed.result).toHaveLength(2);
    expect(barrierReads).toBe(1);
    expect(auditWrites).toEqual([]);
    const targetStates = await observeTree(target);
    const anotherStates = await observeTree(another);
    expect(targetStates).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    expect(anotherStates).toEqual(["resolved", "resolved", "resolved", "resolved"]);
    const revoked = await service.revokeSessions({ target: { type: "user", userId: 7 } }, actor, auditContext);
    expect(revoked).toMatchObject({ changed: true, result: { revoked: { principalSessions: 2 } } });
    expect(barrierReads).toBe(1);
    let rejection: unknown;
    try {
      await operations.run(operation => operation.acquireForAuthentication(subjectIdentifier));
    }
    catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(SubjectAccessDisabledError);
    expect(barrierReads).toBe(2);
  });

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
