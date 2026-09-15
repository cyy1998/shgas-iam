import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { CapturedSession } from "@iam/session-kernel";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createRootSecurityComposition } from "@admin-api/composition/root-security";
import { createAdminClientCache } from "@admin-api/composition/runtime/client-cache";
import { createClientSsoSnapshotManagement } from "@admin-api/composition/services/client-sso-snapshots";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createAdminApiUseCases } from "@admin-api/composition/use-cases";
import { createSessionManagementRoute } from "@admin-api/routes/admin/session-management/session-management.index";
import {
  SessionManagementRevokeSessionsInputSchema,
  SessionManagementSessionListResultVoSchema,
} from "@admin-api/routes/admin/session-management/session-management.schema";
import { createUserRoute } from "@admin-api/routes/admin/user/user.index";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { createClientSsoRepository } from "@admin-api/services/client-sso/client-sso.repository";
import { createClientSsoService } from "@admin-api/services/client-sso/client-sso.service";
import { AdminLoginStateAuditFailedAfterEffectError } from "@admin-api/services/session-management/session-management.error";
import { AdminSessionRevokeResultSchema } from "@admin-api/services/session-management/session-management.schema";
import { createErrorHandler } from "@iam/api-core/middlewares/error-handler";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
  createSubjectAccessLifecycle,
  requireSubjectAccessOperation,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { createTRPCContext } from "@iam/api-core/trpc";
import { createUnitOfWork, mapUnitOfWork } from "@iam/api-core/uow";
import { ClientStatus, UserStatus, UserType } from "@iam/contracts";
import { auditLogs, clients, users } from "@iam/db/schema";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { addTestAdminAuthorizationMiddleware } from "../helpers/admin-authorization";
import { createAdminApiPostgresTestHarness } from "../postgres/postgres-test-harness";
import { createAdminApiRedisTestHarness } from "../redis/redis-test-harness";

let pg: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;
let barrierHarness: Awaited<ReturnType<typeof createAdminApiRedisTestHarness>>;
beforeAll(async () => {
  pg = await createAdminApiPostgresTestHarness();
  barrierHarness = await createAdminApiRedisTestHarness();
});
afterAll(async () => {
  await pg?.close();
  await barrierHarness?.close();
});

async function fixture() {
  const url = process.env.IAM_ADMIN_API_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_ADMIN_API_TEST_REDIS_URL is required");
  const scope = await createUnifiedSessionRedisTestScope(url);
  const kernel = scope.createFactoryForOperations<SubjectAccessOperation>(requireSubjectAccessOperation);
  const [user] = await pg.db
    .insert(users)
    .values({
      username: `root-${randomUUID()}`,
      name: "Root Security",
      userType: UserType.Formal,
      status: UserStatus.Enable,
      password: "old-hash",
    })
    .returning();
  if (!user)
    throw new Error("User fixture missing");
  const account = user;
  const repositories = createAdminApiRepositories(pg.db);
  const auditService = createAdminAuditService({ auditRepository: repositories.audit });
  const errorLogs: Array<Record<string, unknown>> = [];
  const logger = {
    info() {},
    warn() {},
    error(fields: Record<string, unknown>) {
      errorLogs.push(fields);
    },
    bindings: () => ({ sourceApp: "root-security-test" }),
  };
  const unitOfWork = createAdminApiUnitOfWork({
    db: pg.db,
    logger,
    clock: { nowDate: () => new Date() },
    userProfileJobProducer: { enqueueRebuildJobs: async () => ({ enqueued: 0, jobIds: [] }) },
  });
  let failAudit = false;
  let unavailable = false;
  const barrierScope = await barrierHarness.createScope();
  const clock = { nowDate: () => new Date() };
  const random = { uuid: randomUUID };
  const keyPrefix = `${barrierScope.clientCode("subject-access")}:`;
  const bootstrap = createSubjectAccessBootstrap({ redis: barrierScope.redis, random, keyPrefix });
  const barrier = createSubjectAccessBarrier({
    clock,
    random,
    store: createRedisSubjectAccessStore({ redis: barrierScope.redis, keyPrefix }),
  });
  const subjectAccessLifecycle = createSubjectAccessLifecycle({
    barrier,
    random,
    logger,
    transitionIntent: createSubjectAccessTransitionRepository(pg.db),
  });
  const candidate = createRootSecurityComposition({
    kernel,
    barrier: {
      async readCommittedTransitionId(subjectIdentifier) {
        if (unavailable)
          throw new SubjectAccessUnavailableError();
        return await barrier.readCommittedTransitionId(subjectIdentifier);
      },
    },
    config: { allowedClientCodes: ["iam-admin"] },
    user: {
      userRepository: repositories.user,
      employmentRepository: repositories.employment,
      roleRepository: repositories.role,
      privilegeRepository: repositories.privilege,
      roleAssignmentResolver: { resolveEffectiveRoles: async () => new Map() },
      passwordHasher: { hashPassword: async value => `hash:${value}` },
      random: { uuid: randomUUID, password: () => "New-Password-183" },
      subjectAccessLifecycle,
      uow: mapUnitOfWork(unitOfWork, tx => ({
        userRepository: tx.repositories.user,
        auditService: tx.auditService,
        subjectAccessMutation: tx.subjectAccessMutation,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    },
    sessions: {
      users: repositories.user,
      logger,
      loginRestrictions: {
        listRestrictions: async () => {
          throw new Error("Not used");
        },
        clearLoginState: async () => {
          throw new Error("Not used");
        },
      },
      audit: {
        async recordAuditLog(input) {
          if (failAudit)
            throw new Error("Audit unavailable");
          await auditService.recordAuditLog(input);
        },
      },
    },
  });
  async function create(subjectIdentifier = account.subjectIdentifier, clientId = "client") {
    await bootstrap.seedMany([{ subjectIdentifier, state: "enabled" }], clock.nowDate());
    return await candidate.operations.run(async (operation) => {
      const permission = await operation.acquireForAuthentication(subjectIdentifier);
      const root = await kernel
        .forOperation(operation)
        .createUserSession({
          subjectIdentifier,
          subjectContext: operation.getSubjectContext(permission),
          amr: ["pwd"],
        });
      const child = await kernel
        .forOperation(operation)
        .openClientSession(root.observation, { clientId, protocol: "oidc" });
      if (child.status !== "created" && child.status !== "reused")
        throw new Error("Missing child");
      return { root: root.observation.userSession, child: child.value.clientSession, bearer: root.bearer };
    });
  }
  async function status(token: string) {
    return await candidate.operations.run(
      async operation => (await kernel.forOperation(operation).resolveUserSession(token)).status,
    );
  }
  const useCases = createAdminApiUseCases({
    clock,
    sessionRevocation: candidate.lifecycleRevocation,
    subjectAccessLifecycle,
    unitOfWork,
    userReader: repositories.user,
  });
  return {
    ...candidate,
    useCases,
    barrier,
    redis: barrierScope.redis,
    clientCode: barrierScope.clientCode,
    scope: {
      ...scope,
      async close() {
        await barrierScope.close();
        await scope.close();
      },
    },
    kernel,
    errorLogs,
    account,
    create,
    status,
    setFailAudit() {
      failAudit = true;
    },
    setUnavailable() {
      unavailable = true;
    },
    logger,
  };
}

test("formal self revoke and password reset preserve current root, terminate its children and audit actual effects", async () => {
  const f = await fixture();
  try {
    const current = await f.create();
    const other = await f.create();
    const audit = {
      actorType: "admin" as const,
      actorUserId: f.account.id,
      principalSessionId: current.root.userSessionId,
    };
    const result = await f.sessionManagement.revokeSessions(
      { target: { type: "user", userId: f.account.id } },
      { actorUserId: f.account.id, principalSessionId: current.root.userSessionId },
      audit,
    );
    expect(result).toMatchObject({
      changed: true,
      result: {
        scope: "user",
        generation: "unified",
        currentPrincipalSessionExcluded: true,
        sessions: {
          userSessionsTerminated: 1,
          clientSessionsTerminated: 2,
          excluded: 1,
          failed: 0,
          unknown: 0,
        },
      },
    });
    const statuses = [await f.status(current.bearer), await f.status(other.bearer)];
    expect(statuses).toEqual(["resolved", "terminated"]);
    const later = await f.create();
    const reset = await f.user.resetPasswordByUsername(f.account.username, audit);
    expect(reset).toMatchObject({
      changed: true,
      result: "New-Password-183",
      sessions: {
        userSessionsTerminated: 1,
        clientSessionsTerminated: 1,
        excluded: 1,
        failed: 0,
        unknown: 0,
      },
    });
    const finalStatuses = [await f.status(current.bearer), await f.status(later.bearer)];
    expect(finalStatuses).toEqual(["resolved", "terminated"]);
    const [updated] = await pg.db.select().from(users).where(eq(users.id, f.account.id));
    expect(updated?.password).toBe("hash:New-Password-183");
    const audits = await pg.db.select().from(auditLogs).where(eq(auditLogs.targetId, f.account.id));
    expect(audits.map(row => row.action)).toContain("admin.user.reset_password");
    expect(audits.filter(row => row.action === "admin.session.revoke_user")).toHaveLength(2);
  }
  finally {
    await f.scope.close();
  }
});

test.each(["revoke", "password"])(
  "self %s preserves uncertain after-effect audit classification when no termination is confirmed",
  async (command) => {
    const f = await fixture();
    try {
      const current = await f.create();
      const audit = {
        actorType: "admin" as const,
        actorUserId: f.account.id,
        principalSessionId: current.root.userSessionId,
      };
      f.scope.failNext("revoke", true);
      f.setFailAudit();
      let failure: unknown;
      try {
        if (command === "revoke") {
          await f.sessionManagement.revokeSessions(
            { target: { type: "user", userId: f.account.id } },
            { actorUserId: f.account.id, principalSessionId: current.root.userSessionId },
            audit,
          );
        }
        else {
          await f.user.resetPasswordByUsername(f.account.username, audit);
        }
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(
        command === "revoke" ? AdminLoginStateAuditFailedAfterEffectError : AdminMutationCommittedError,
      );
      expect(f.errorLogs).toContainEqual(
        expect.objectContaining({
          changed: false,
          effectMayHaveOccurred: true,
          sessions: {
            userSessionsTerminated: 0,
            clientSessionsTerminated: 0,
            excluded: 1,
            failed: 0,
            unknown: 1,
          },
        }),
      );
      const rootStatus = await f.status(current.bearer);
      expect(rootStatus).toBe("resolved");
      const child = await f.operations.run(
        async operation =>
          await f.kernel
            .forOperation(operation)
            .resolveClientSessionForUse({
              userSessionId: current.root.userSessionId,
              clientSessionId: current.child.clientSessionId,
              clientId: current.child.clientId,
            }),
      );
      expect(child.status).toBe("terminated");
      const [account] = await pg.db.select().from(users).where(eq(users.id, f.account.id));
      expect(account?.password).toBe(command === "password" ? "hash:New-Password-183" : "old-hash");
    }
    finally {
      await f.scope.close();
    }
  },
);

test("formal password reset reports committed failure when session after-effect audit fails", async () => {
  const f = await fixture();
  try {
    const current = await f.create();
    const other = await f.create();
    f.setFailAudit();
    let failure: unknown;
    try {
      await f.user.resetPasswordByUsername(f.account.username, {
        actorType: "admin",
        actorUserId: f.account.id,
        principalSessionId: current.root.userSessionId,
      });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AdminMutationCommittedError);
    const [updated] = await pg.db.select().from(users).where(eq(users.id, f.account.id));
    expect(updated?.password).toBe("hash:New-Password-183");
    const statuses = [await f.status(current.bearer), await f.status(other.bearer)];
    expect(statuses).toEqual(["resolved", "terminated"]);
  }
  finally {
    await f.scope.close();
  }
});

test("formal Admin authentication accepts candidate roots and preserves Cookie on unknown permission", async () => {
  const f = await fixture();
  try {
    const root = await f.create();
    const app = new Hono();
    app.onError(createErrorHandler(f.logger));
    app.use("/protected", f.authentication.adminAuthenticationHandler);
    app.get("/protected", c => c.json({ allowed: true }));
    const headers = { Client: "iam-admin", Cookie: `global_session=${root.bearer}` };
    const ok = await app.request("/protected", { headers });
    expect(ok.status).toBe(200);
    f.setUnavailable();
    const unknown = await app.request("/protected", { headers });
    expect(unknown.status).toBe(503);
    expect(unknown.headers.get("set-cookie")).toBeNull();
  }
  finally {
    await f.scope.close();
  }
});

test("candidate formal REST serializes only unified counts after real root authentication and password commit", async () => {
  const f = await fixture();
  try {
    const root = await f.create();
    await f.create();
    const app = new Hono();
    app.onError(createErrorHandler(f.logger));
    app.use("*", f.authentication.adminAuthenticationHandler);
    addTestAdminAuthorizationMiddleware(app);
    app.route("/admin", createSessionManagementRoute(f.sessionManagementAdapter));
    app.route("/admin", createUserRoute(f.userAdapter));
    const headers = {
      "Client": "iam-admin",
      "Cookie": `global_session=${root.bearer}`,
      "Content-Type": "application/json",
    };
    const revoke = await app.request("/admin/session-management/sessions/revoke", {
      method: "POST",
      headers,
      body: JSON.stringify({ target: { type: "user", userId: f.account.id } }),
    });
    expect(revoke.status).toBe(200);
    const body = z.object({ data: AdminSessionRevokeResultSchema }).parse(await revoke.json());
    expect(body.data.result).toMatchObject({
      scope: "user",
      generation: "unified",
      currentPrincipalSessionExcluded: true,
      sessions: {
        userSessionsTerminated: 1,
        clientSessionsTerminated: 2,
        excluded: 1,
        failed: 0,
        unknown: 0,
      },
    });
    const reset = await app.request(`/admin/users/${f.account.username}/reset-password`, {
      method: "POST",
      headers,
    });
    expect(reset.status).toBe(200);
    const resetBody = await reset.json();
    expect(resetBody).toMatchObject({
      data: { changed: true, result: "New-Password-183", sessions: { excluded: 1 } },
    });
  }
  finally {
    await f.scope.close();
  }
});

test("self password reset without the current root rejects before changing PostgreSQL", async () => {
  const f = await fixture();
  try {
    let failure: unknown;
    try {
      await f.user.resetPasswordByUsername(f.account.username, {
        actorType: "admin",
        actorUserId: f.account.id,
      });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const [account] = await pg.db.select().from(users).where(eq(users.id, f.account.id));
    expect(account?.password).toBe("old-hash");
    const audits = await pg.db.select().from(auditLogs).where(eq(auditLogs.targetId, f.account.id));
    expect(audits).toEqual([]);
  }
  finally {
    await f.scope.close();
  }
});

test.each(["rest", "trpc"])(
  "formal %s lists both neutral record types and retries only original uncertain instances",
  async (transport) => {
    const f = await fixture();
    try {
      const current = await f.create();
      const [targetUser] = await pg.db
        .insert(users)
        .values({
          username: `target-${randomUUID()}`,
          name: "Disabled target",
          userType: UserType.Formal,
          status: UserStatus.Enable,
        })
        .returning();
      if (!targetUser)
        throw new Error("Target missing");
      const original = await f.create(targetUser.subjectIdentifier);
      await pg.db.update(users).set({ status: UserStatus.Disable }).where(eq(users.id, targetUser.id));
      const app = new Hono();
      app.onError(createErrorHandler(f.logger));
      app.use("*", f.authentication.adminAuthenticationHandler);
      addTestAdminAuthorizationMiddleware(app);
      app.route("/admin", createSessionManagementRoute(f.sessionManagementAdapter));
      app.all("/rpc/*", c =>
        fetchRequestHandler({
          endpoint: "/rpc",
          req: c.req.raw,
          router: f.sessionManagementAdapter.sessionManagementAdminRouter,
          createContext: () => createTRPCContext({ honoCtx: c }),
        }));
      const headers = {
        "Client": "iam-admin",
        "Cookie": `global_session=${current.bearer}`,
        "Content-Type": "application/json",
      };
      async function list(kind: "userSession" | "clientSession") {
        const input = { conditions: { userId: targetUser!.id, kind }, pageNum: 1, pageSize: 1 };
        const response
          = transport === "rest"
            ? await app.request("/admin/session-management/sessions/search", {
                method: "POST",
                headers,
                body: JSON.stringify(input),
              })
            : await app.request(`/rpc/listSessions?input=${encodeURIComponent(JSON.stringify(input))}`, {
                headers,
              });
        expect(response.status).toBe(200);
        const payload = z
          .object({ data: z.unknown().optional(), result: z.object({ data: z.unknown() }).optional() })
          .parse(await response.json());
        return SessionManagementSessionListResultVoSchema.parse(
          transport === "rest" ? payload.data : payload.result?.data,
        );
      }
      const roots = await list("userSession");
      const children = await list("clientSession");
      expect(roots).toMatchObject({
        total: 1,
        allowedActions: { revoke: true },
        result: [{ record: { kind: "userSession" }, user: { accountStatus: "ended" } }],
      });
      expect(children).toMatchObject({
        total: 1,
        result: [{ record: { kind: "clientSession", clientId: "client", protocol: "oidc" } }],
      });
      expect(JSON.stringify(children)).not.toContain("subjectContext");
      const untouched = await f.status(original.bearer);
      expect(untouched).toBe("resolved");
      async function revoke(target: unknown) {
        const response = await app.request(
          transport === "rest" ? "/admin/session-management/sessions/revoke" : "/rpc/revokeSessions",
          { method: "POST", headers, body: JSON.stringify({ target }) },
        );
        expect(response.status).toBe(200);
        const payload = z
          .object({ data: z.unknown().optional(), result: z.object({ data: z.unknown() }).optional() })
          .parse(await response.json());
        return AdminSessionRevokeResultSchema.parse(
          transport === "rest" ? payload.data : payload.result?.data,
        );
      }
      f.scope.failNext("revoke", true);
      const first = await revoke({ type: "captured", targets: [children.result[0]!.record!.identity] });
      expect(first).toMatchObject({
        changed: false,
        result: {
          generation: "unified",
          sessions: { clientSessionsTerminated: 0, unknown: 1 },
          artifactCleanup: { attempted: 0, succeeded: 0, failed: 0 },
        },
      });
      if (!("sessions" in first.result) || !first.result.batch)
        throw new Error("Missing batch");
      expect(first.result.batch.unfinished).toHaveLength(1);
      const later = await f.operations.run(async (operation) => {
        const sessions = f.kernel.forOperation(operation);
        const root = await sessions.resolveUserSession(original.bearer);
        if (root.status !== "resolved")
          throw new Error("Original root missing");
        const child = await sessions.openClientSession(root.value, { clientId: "client", protocol: "oidc" });
        if (child.status !== "created")
          throw new Error("Expected replacement relationship");
        return child.value.clientSession;
      });
      expect(later.clientSessionId).not.toBe(original.child.clientSessionId);
      const retry = await revoke({ type: "captured", targets: first.result.batch.unfinished });
      expect(retry).toMatchObject({
        changed: false,
        result: {
          batch: { results: [{ status: "already_terminated" }], unfinished: [] },
          sessions: { unknown: 0 },
        },
      });
      const laterState = await f.operations.run(
        async operation =>
          await f.kernel
            .forOperation(operation)
            .resolveClientSessionForUse({
              userSessionId: later.userSessionId,
              clientSessionId: later.clientSessionId,
              clientId: "client",
            }),
      );
      expect(laterState.status).toBe("resolved");
      const auditRows = await pg.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "admin.session.revoke"));
      expect(auditRows.length).toBeGreaterThanOrEqual(2);
      expect(auditRows.some(row => row.targetType === "session_batch" && row.targetCode === null)).toBe(
        true,
      );
      const storedDetails = JSON.stringify(
        auditRows.filter(row => row.targetType === "session_batch").map(row => row.details),
      );
      expect(storedDetails).not.toContain(original.child.clientSessionId);
      expect(storedDetails).not.toContain(current.root.userSessionId);
    }
    finally {
      await f.scope.close();
    }
  },
);

test("neutral inventory fails on damaged records and a missing inventory never restores a terminated root", async () => {
  const f = await fixture();
  try {
    const current = await f.create();
    const other = await f.create();
    const actor = { actorUserId: f.account.id, principalSessionId: current.root.userSessionId };
    const page = await f.sessionManagement.listSessions({ pageNum: 1, pageSize: 1 }, actor);
    expect(page.total).toBe(2);
    expect(page.result).toHaveLength(1);
    const target = page.result[0]!.record!.identity;
    const restore = await f.scope.corruptRecord(target);
    let failed: unknown;
    try {
      await f.sessionManagement.listSessions({ pageNum: 1, pageSize: 1 }, actor);
    }
    catch (error) {
      failed = error;
    }
    expect(failed).toBeInstanceOf(Error);
    await restore();
    await f.scope.forgetInventory("userSession");
    const incomplete = await f.sessionManagement.listSessions({ pageNum: 1, pageSize: 20 }, actor);
    expect(incomplete.total).toBe(0);
    await f.sessionManagement.revokeSessions(
      { target: { type: "session", principalSessionId: other.root.userSessionId } },
      actor,
      { actorType: "admin", actorUserId: f.account.id },
    );
    const status = await f.status(other.bearer);
    expect(status).toBe("terminated");
  }
  finally {
    await f.scope.close();
  }
});

test.each(["disable", "delete", "resign"])(
  "real account %s commits PostgreSQL and terminates only its original generation",
  async (command) => {
    const f = await fixture();
    try {
      const original = await f.create();
      const audit = { actorType: "admin" as const, actorUserId: f.account.id };
      const prepared = await f.lifecycleRevocation.prepareUserSessionRevocation({
        userId: f.account.id,
        subjectIdentifier: f.account.subjectIdentifier,
        reason: "user_disabled",
      });
      if (command === "disable") {
        await f.user.updateUserStatus(f.account.username, UserStatus.Disable, audit);
      }
      else if (command === "delete") {
        await f.user.deleteUser(f.account.username, audit);
      }
      else {
        await f.useCases.employment.resignUser.execute(
          { username: f.account.username },
          { auditContext: audit },
        );
      }
      const [committed] = await pg.db.select().from(users).where(eq(users.id, f.account.id));
      expect(command === "delete" ? committed?.isDelete : committed?.status === UserStatus.Disable).toBe(
        true,
      );
      const rootStatus = await f.status(original.bearer);
      expect(rootStatus).toBe("terminated");
      const auditRows = await pg.db.select().from(auditLogs).where(eq(auditLogs.targetId, f.account.id));
      expect(auditRows.length).toBeGreaterThan(0);
      // Test-owned source restoration creates a fresh access generation; it is not a production restore workflow.
      await pg.db
        .update(users)
        .set({ status: UserStatus.Enable, isDelete: false })
        .where(eq(users.id, f.account.id));
      const transition = await f.barrier.beginBlocking(f.account.subjectIdentifier);
      await f.barrier.prepareRepair(transition, "enabled");
      await f.barrier.finalize(transition, "enabled");
      const newer = await f.create();
      await prepared.revoke({});
      const newerStatus = await f.status(newer.bearer);
      expect(newerStatus).toBe("resolved");
    }
    finally {
      await f.scope.close();
    }
  },
);

test("real resignation no-op retries original residual sessions after an unconfirmed first effect", async () => {
  const f = await fixture();
  try {
    const original = await f.create();
    f.scope.failNext("revoke");
    await f.useCases.employment.resignUser.execute(
      { username: f.account.username },
      { auditContext: { actorType: "admin", actorUserId: f.account.id } },
    );
    const firstStatus = await f.status(original.bearer);
    expect(firstStatus).toBe("resolved");
    const retried = await f.useCases.employment.resignUser.execute(
      { username: f.account.username },
      { auditContext: { actorType: "admin", actorUserId: f.account.id } },
    );
    expect(retried.changed).toBe(false);
    const finalStatus = await f.status(original.bearer);
    expect(finalStatus).toBe("terminated");
  }
  finally {
    await f.scope.close();
  }
});

test("Client ordinary edits preserve real sessions; formal deletion and explicit retry terminate only that Client", async () => {
  const f = await fixture();
  try {
    const code = f.clientCode("lifecycle");
    await pg.db
      .insert(clients)
      .values({
        clientCode: code,
        clientName: "Lifecycle",
        clientSecret: "test-internal",
        status: ClientStatus.Enable,
        extAttributes: {},
      });
    const original = await f.create(f.account.subjectIdentifier, code);
    const other = await f.create();
    const { management } = createClientSsoSnapshotManagement({
      clientCache: createAdminClientCache({ redis: f.redis }),
      db: pg.db,
      redis: f.redis,
      logger: f.logger,
      callback: { isManagedCallback: () => false },
      sessionTermination: f.lifecycleRevocation,
    });
    for (const patch of [
      { clientName: "Edited" },
      { status: ClientStatus.Maintenance },
      { status: ClientStatus.Disable },
      { status: ClientStatus.Enable },
    ]) {
      await management.service.save(code, patch);
      const before = await f.operations.run(
        async operation =>
          await f.kernel
            .forOperation(operation)
            .resolveClientSessionForUse({
              userSessionId: original.root.userSessionId,
              clientSessionId: original.child.clientSessionId,
              clientId: code,
            }),
      );
      expect(before.status).toBe("resolved");
    }
    const app = new Hono();
    app.onError(createErrorHandler(f.logger));
    app.use("*", f.authentication.adminAuthenticationHandler);
    addTestAdminAuthorizationMiddleware(app);
    app.route("/admin", management.rest);
    const headers = { Client: "iam-admin", Cookie: `global_session=${other.bearer}` };
    f.scope.failNext("revoke");
    const unknown = await app.request(`/admin/clients-sso/${code}`, { method: "DELETE", headers });
    expect(unknown.status).toBe(500);
    const [deleted] = await pg.db.select().from(clients).where(eq(clients.clientCode, code));
    expect(deleted?.isDelete).toBe(true);
    const retry = await app.request(`/admin/clients-sso/${code}`, { method: "DELETE", headers });
    expect(retry.status).toBe(200);
    const retryBody = await retry.json();
    expect(retryBody).toMatchObject({ data: { changed: false, result: null } });
    const after = await f.operations.run(
      async operation =>
        await f.kernel
          .forOperation(operation)
          .resolveClientSessionForUse({
            userSessionId: original.root.userSessionId,
            clientSessionId: original.child.clientSessionId,
            clientId: code,
          }),
    );
    const otherAfter = await f.operations.run(
      async operation =>
        await f.kernel
          .forOperation(operation)
          .resolveClientSessionForUse({
            userSessionId: other.root.userSessionId,
            clientSessionId: other.child.clientSessionId,
            clientId: "client",
          }),
    );
    expect(after.status).toBe("terminated");
    expect(otherAfter.status).toBe("resolved");
    const rootAfter = await f.status(original.bearer);
    expect(rootAfter).toBe("resolved");
  }
  finally {
    await f.scope.close();
  }
});

test("candidate REST and tRPC keep HR outside session management without changing real records", async () => {
  const f = await fixture();
  try {
    const root = await f.create();
    const app = new Hono();
    app.onError(createErrorHandler(f.logger));
    app.use("*", f.authentication.adminAuthenticationHandler);
    addTestAdminAuthorizationMiddleware(app, ["iam:hr-admin"]);
    app.route("/admin", createSessionManagementRoute(f.sessionManagementAdapter));
    app.all("/rpc/*", c =>
      fetchRequestHandler({
        endpoint: "/rpc",
        req: c.req.raw,
        router: f.sessionManagementAdapter.sessionManagementAdminRouter,
        createContext: () => createTRPCContext({ honoCtx: c }),
      }));
    const headers = {
      "Client": "iam-admin",
      "Cookie": `global_session=${root.bearer}`,
      "Content-Type": "application/json",
    };
    for (const path of ["/admin/session-management/sessions/revoke", "/rpc/revokeSessions"]) {
      const response = await app.request(path, {
        method: "POST",
        headers,
        body: JSON.stringify({ target: { type: "user", userId: f.account.id } }),
      });
      expect(response.status).toBe(403);
    }
    const status = await f.operations.run(
      async operation =>
        await f.kernel
          .forOperation(operation)
          .resolveClientSessionForUse({
            userSessionId: root.root.userSessionId,
            clientSessionId: root.child.clientSessionId,
            clientId: "client",
          }),
    );
    expect(status.status).toBe("resolved");
    const rows = await pg.db.select().from(auditLogs).where(eq(auditLogs.targetId, f.account.id));
    expect(rows).toEqual([]);
  }
  finally {
    await f.scope.close();
  }
});

test("captured batches distinguish missing, replaced, failed, terminated and current-root exclusion", async () => {
  const f = await fixture();
  try {
    const current = await f.create();
    const missing = await f.create();
    const replaced = await f.create();
    const broken = await f.create();
    const actor = { actorUserId: f.account.id, principalSessionId: current.root.userSessionId };
    const children = await f.sessionManagement.listSessions(
      { pageNum: 1, pageSize: 20, kind: "clientSession" },
      actor,
    );
    const roots = await f.sessionManagement.listSessions(
      { pageNum: 1, pageSize: 20, kind: "userSession" },
      actor,
    );
    const identity = (id: string) => {
      const record = [...children.result, ...roots.result].find(
        row => row.record?.identity.id === id,
      )?.record;
      if (!record)
        throw new Error("Identity missing");
      return record.identity;
    };
    const missingIdentity = identity(missing.child.clientSessionId);
    const replacedIdentity = identity(replaced.child.clientSessionId);
    const brokenIdentity = identity(broken.child.clientSessionId);
    const currentIdentity = identity(current.child.clientSessionId);
    await f.scope.removeRecord(missingIdentity);
    await f.scope.replaceInstance(replacedIdentity);
    const restore = await f.scope.corruptRecord(brokenIdentity);
    const result = await f.sessionManagement.revokeSessions(
      {
        target: {
          type: "captured",
          targets: [
            identity(current.root.userSessionId),
            missingIdentity,
            replacedIdentity,
            brokenIdentity,
            currentIdentity,
          ],
        },
      },
      actor,
      { actorType: "admin", actorUserId: f.account.id },
    );
    expect(result).toMatchObject({
      changed: true,
      result: {
        sessions: {
          userSessionsTerminated: 0,
          clientSessionsTerminated: 1,
          excluded: 1,
          failed: 1,
          unknown: 0,
        },
        batch: {
          results: [
            { status: "excluded" },
            { status: "missing" },
            { status: "replaced" },
            { status: "failed" },
            { status: "terminated" },
          ],
          unfinished: [brokenIdentity],
        },
      },
    });
    await restore();
    const rootStatus = await f.status(current.bearer);
    expect(rootStatus).toBe("resolved");
  }
  finally {
    await f.scope.close();
  }
});

test("Client deletion audit rollback and unknown COMMIT preserve their true PostgreSQL and Redis outcomes", async () => {
  const f = await fixture();
  try {
    const code = f.clientCode("commit");
    await pg.db
      .insert(clients)
      .values({
        clientCode: code,
        clientName: "Commit",
        clientSecret: "test-internal",
        status: ClientStatus.Enable,
        extAttributes: {},
      });
    const original = await f.create(f.account.subjectIdentifier, code);
    const { snapshots } = createClientSsoSnapshotManagement({
      clientCache: createAdminClientCache({ redis: f.redis }),
      db: pg.db,
      redis: f.redis,
      logger: f.logger,
      callback: { isManagedCallback: () => false },
      sessionTermination: f.lifecycleRevocation,
    });
    const warm = await snapshots.client.acquire(code);
    expect(warm.kind).toBe("present");
    const auditFailure = new Error("Injected audit rejection");
    const auditRejected = createClientSsoService({
      client: createClientSsoRepository(pg.db),
      uow: createUnitOfWork({
        db: pg.db,
        logger: f.logger,
        createTxPorts: tx => ({
          client: createClientSsoRepository(tx),
          audit: {
            async recordAuditLog() {
              throw auditFailure;
            },
          },
        }),
      }),
      invalidation: snapshots,
      logger: f.logger,
      callback: { isManagedCallback: () => false },
      credentials: {
        create: () => {
          throw new Error("Deletion cannot rotate credentials");
        },
      },
      sessionTermination: f.lifecycleRevocation,
    });
    let failed: unknown;
    try {
      await auditRejected.deleteClient(code);
    }
    catch (error) {
      failed = error;
    }
    expect(failed).toBe(auditFailure);
    const [rolledBack] = await pg.db.select().from(clients).where(eq(clients.clientCode, code));
    expect(rolledBack?.isDelete).toBe(false);
    const rollbackState = await f.operations.run(
      async operation =>
        await f.kernel
          .forOperation(operation)
          .resolveClientSessionForUse({
            userSessionId: original.root.userSessionId,
            clientSessionId: original.child.clientSessionId,
            clientId: code,
          }),
    );
    expect(rollbackState.status).toBe("resolved");
    const unknownCommit = new Error("Injected response loss after real PostgreSQL commit");
    const uncertainDb = new Proxy(pg.db, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return async (
            callback: Parameters<typeof target.transaction>[0],
            options?: Parameters<typeof target.transaction>[1],
          ) => {
            await target.transaction(callback, options);
            throw unknownCommit;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const uncertain = createClientSsoSnapshotManagement({
      clientCache: createAdminClientCache({ redis: f.redis }),
      db: uncertainDb,
      redis: f.redis,
      logger: f.logger,
      callback: { isManagedCallback: () => false },
      sessionTermination: f.lifecycleRevocation,
    });
    let outcome: unknown;
    try {
      await uncertain.management.service.deleteClient(code);
    }
    catch (error) {
      outcome = error;
    }
    expect(outcome).toBe(unknownCommit);
    expect(outcome).not.toBeInstanceOf(AdminMutationCommittedError);
    const [committed] = await pg.db.select().from(clients).where(eq(clients.clientCode, code));
    expect(committed?.isDelete).toBe(true);
    const invalidated = await snapshots.client.acquire(code);
    expect(invalidated.kind).toBe("absent");
    const state = await f.operations.run(
      async operation =>
        await f.kernel
          .forOperation(operation)
          .resolveClientSessionForUse({
            userSessionId: original.root.userSessionId,
            clientSessionId: original.child.clientSessionId,
            clientId: code,
          }),
    );
    expect(state.status).toBe("resolved");
  }
  finally {
    await f.scope.close();
  }
});

test("single-root aggregate rejects 10001 before effects and its 10000-item unfinished batch can be retried", async () => {
  const f = await fixture();
  try {
    const current = await f.create();
    const target = await f.create();
    const actor = { actorUserId: f.account.id, principalSessionId: current.root.userSessionId };
    const audit = { actorType: "admin" as const, actorUserId: f.account.id };
    await f.operations.run(async (operation) => {
      const sessions = f.kernel.forOperation(operation);
      const root = await sessions.resolveUserSession(target.bearer);
      if (root.status !== "resolved")
        throw new Error("Missing root");
      for (let start = 0; start < 9999; start += 100) {
        await Promise.all(
          Array.from({ length: Math.min(100, 9999 - start) }, async (_, index) => {
            const created = await sessions.openClientSession(root.value, {
              clientId: `budget-${start + index}`,
              protocol: "oidc",
            });
            if (created.status !== "created")
              throw new Error("Missing child");
          }),
        );
      }
    });
    async function inventory() {
      return await f.operations.run(async (operation) => {
        const targets: CapturedSession[] = [];
        const states: string[] = [];
        let offset: number | null = 0;
        do {
          const page = await f.kernel
            .forOperation(operation)
            .captureSessions({ scope: { userSessionId: target.root.userSessionId }, offset, limit: 1000 });
          targets.push(...page.targets);
          states.push(...page.records.map(record => record.state));
          offset = page.nextOffset;
        } while (offset !== null);
        return { targets, states };
      });
    }
    let failure: unknown;
    try {
      await f.sessionManagement.revokeSessions(
        { target: { type: "session", principalSessionId: target.root.userSessionId } },
        actor,
        audit,
      );
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const rootStatus = await f.status(target.bearer);
    const before = await inventory();
    expect(rootStatus).toBe("resolved");
    expect(before.targets).toHaveLength(10000);
    expect(before.states.every(state => state === "active")).toBe(true);
    // Direct captured callers use the same pre-effect aggregate check.
    let directFailure: unknown;
    try {
      await f.revocation.executeCapturedSessions([
        ...before.targets,
        {
          kind: "userSession",
          id: target.root.userSessionId,
          instance: target.root.instance,
          userSessionId: target.root.userSessionId,
          subjectIdentifier: target.root.subjectIdentifier,
        },
      ]);
    }
    catch (error) {
      directFailure = error;
    }
    expect(directFailure).toBeInstanceOf(Error);
    const stillPresent = await inventory();
    expect(stillPresent.states.every(state => state === "active")).toBe(true);
    await f.revocation.executeCapturedSessions([before.targets[0]!]);
    f.scope.failNext("revoke", false, 10000);
    const uncertain = await f.sessionManagement.revokeSessions(
      { target: { type: "session", principalSessionId: target.root.userSessionId } },
      actor,
      audit,
    );
    if (!("sessions" in uncertain.result) || !uncertain.result.batch)
      throw new Error("Missing batch");
    expect(uncertain).toMatchObject({
      changed: false,
      result: { sessions: { userSessionsTerminated: 0, clientSessionsTerminated: 0, unknown: 10000 } },
    });
    expect(uncertain.result.batch.unfinished).toHaveLength(10000);
    f.scope.failNext("revoke", false, 10000);
    const duplicateInput = await f.revocation.executeCapturedSessions([
      ...uncertain.result.batch.unfinished,
      uncertain.result.batch.unfinished[0]!,
    ]);
    expect(duplicateInput.results).toHaveLength(10000);
    expect(duplicateInput.unfinished).toHaveLength(10000);
    const retryInput = SessionManagementRevokeSessionsInputSchema.parse({
      target: { type: "captured", targets: uncertain.result.batch.unfinished },
    });
    const newer = await f.create();
    const retried = await f.sessionManagement.revokeSessions(retryInput, actor, audit);
    expect(retried).toMatchObject({
      changed: true,
      result: {
        sessions: { userSessionsTerminated: 1, clientSessionsTerminated: 9999, unknown: 0 },
        batch: { unfinished: [] },
      },
    });
    const statuses = [
      await f.status(target.bearer),
      await f.status(newer.bearer),
      await f.status(current.bearer),
    ];
    expect(statuses).toEqual(["terminated", "resolved", "resolved"]);
  }
  finally {
    await f.scope.close();
  }
}, 120000);
