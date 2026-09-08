import type { ResignUserTransactionPorts } from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import type { AdminApiRedisTestHarness, AdminApiRedisTestScope } from "./redis-test-harness";
import { randomUUID } from "node:crypto";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { createSessionKernel, createSessionKernelConfig, createSessionKernelKeyBuilder } from "@iam/api-core/session/kernel";
import { createRedisSubjectAccessStore, createSubjectAccessBarrier, createSubjectAccessBootstrap, createSubjectAccessLifecycle, createSubjectAccessPrincipalValidator } from "@iam/api-core/subject-access";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createAdminApiRedisTestHarness } from "./redis-test-harness";

let harness: AdminApiRedisTestHarness;
let scope: AdminApiRedisTestScope;
beforeAll(async () => {
  harness = await createAdminApiRedisTestHarness();
});
beforeEach(async () => {
  scope = await harness.createScope();
});
afterEach(async () => {
  await scope.close();
});
afterAll(async () => {
  await harness.close();
});

async function fixture() {
  const subjectIdentifier = randomUUID();
  const namespace = scope.clientCode("resignation-kernel");
  const keyPrefix = `${scope.clientCode("subject-access")}:`;
  const clock = { nowDate: () => new Date() };
  const random = { uuid: randomUUID };
  await createSubjectAccessBootstrap({ redis: scope.redis, random, keyPrefix }).seedMany([
    { subjectIdentifier, state: "enabled" },
  ], clock.nowDate());
  const barrier = createSubjectAccessBarrier({
    clock,
    random,
    store: createRedisSubjectAccessStore({ redis: scope.redis, keyPrefix }),
  });
  const config = createSessionKernelConfig({
    namespace,
    lookupHmacKeys: { current: { id: "resign-test", secret: "resign-test-secret-00000000000000000000000000" } },
    principalAbsoluteTtlMs: 60_000,
    principalIdleTtlMs: 30_000,
  });
  let failNextPreparation = false;
  const preparationFailure = mock(() => undefined);
  const kernelRedis = new Proxy(scope.redis, {
    get(target, property) {
      if (property === "zrange") {
        return async (...args: Parameters<typeof target.zrange>) => {
          if (failNextPreparation) {
            failNextPreparation = false;
            preparationFailure();
            throw new Error("injected preparation read failure");
          }
          return await target.zrange(...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const kernel = createSessionKernel({ redis: kernelRedis, config, principalAccessFence: createSubjectAccessPrincipalValidator(barrier) });
  const keys = createSessionKernelKeyBuilder(config.namespace);
  const user = { id: 1, username: "holder", subjectIdentifier, status: UserStatus.Enable, isDelete: false };
  const employment = {
    id: 1,
    userId: 1,
    orgId: 10,
    posId: 1,
    status: EmploymentStatus.Enable,
    isPrimary: true,
    isDelete: false,
    description: null,
    startTime: clock.nowDate(),
    endTime: null as Date | null,
    createTime: clock.nowDate(),
    updateTime: clock.nowDate(),
  };
  const authorization = await createAdminAuthorizationPolicy({
    logger: { warn: mock() },
    hrAdministrationScopeResolver: { resolveForActor: async () => ({ rootOrganizationIds: [10], organizationIds: [10] }) },
  }).getUserAuthorization({ userId: 99, username: "hr", roles: ["iam:hr-admin"] });
  const readUser = async () => user;
  const userReader = {
    getUserByUsernameForAdmin: readUser,
    getUserByUsernameIncludingDeletedForAuthorization: readUser,
    getOpenEmploymentOrganizationIdsByUserId: async () => employment.endTime === null ? [10] : [],
    getEndedEmploymentOrganizationIdsByUserId: async () => employment.endTime === null ? [] : [10],
  };
  // Business rows and durable intent are fake seams here; PostgreSQL atomicity has a separate owner suite.
  const committed = new Set<string>();
  const audits: unknown[] = [];
  const dirty = mock(async () => undefined);
  const tx: ResignUserTransactionPorts = {
    userStore: { ...userReader, lockUserByUsername: readUser, updateUserByUsername: async (_username, patch) => {
      user.status = patch.status;
      return user;
    } },
    employmentStore: {
      getOpenEmploymentIdsByUserId: async () => employment.endTime === null ? [employment.id] : [],
      lockEmploymentsByIds: async ids => ids.length ? [employment] : [],
      updateEmploymentRecord: async (_id, patch) => Object.assign(employment, patch),
    },
    responsibilityParentLifecycle: {
      lockAssignmentsForEmployments: async () => [],
      endOpenAssignmentsForUserResignation: async () => false,
    },
    auditLogWriter: { recordAuditLog: async (input) => { audits.push(input); } },
    userProfileInvalidation: { recordChanges: dirty },
    subjectAccessMutation: { runMutation: async <T>(receipt: SubjectAccessMutationReceipt, mutation: () => Promise<T>) => {
      const result = await mutation();
      committed.add(receipt.transitionId);
      return result;
    } },
  };
  const lifecycle = createSubjectAccessLifecycle({
    barrier,
    random,
    logger: { warn: mock() },
    transitionIntent: {
      create: async () => undefined,
      markRolledBack: async () => undefined,
      assertCommitted: async (receipt) => {
        if (!committed.has(receipt.transitionId))
          throw new Error("fixture mutation did not commit");
      },
    },
  });
  let failNextCleanup = false;
  let delayNextCleanup: (() => Promise<void>) | undefined;
  const revocation = createAdminSessionRevocationPort({
    sessionKernel: {
      ...kernel,
      prepareUserSessionRevocation: async (principal) => {
        const plan = await kernel.prepareUserSessionRevocation(principal);
        return { revoke: async (...args: Parameters<typeof plan.revoke>) => {
          if (failNextCleanup) {
            failNextCleanup = false;
            throw new Error("injected cleanup transport failure");
          }
          const delay = delayNextCleanup;
          delayNextCleanup = undefined;
          await delay?.();
          return await plan.revoke(...args);
        } };
      },
    },
    logger: { logUserRevocation: mock(), logClientProtocolRevocation: mock(), logClientAllProtocolsRevocation: mock() },
  });
  const command = createResignUserUseCase({ clock, userReader, sessionRevocation: revocation, subjectAccessLifecycle: lifecycle, uow: createImmediateUnitOfWork(tx) });
  async function createSession() {
    const result = await kernel.createPrincipalSession(subjectIdentifier);
    if (result.status !== "created")
      throw new Error("Principal Session fixture creation failed");
    return result;
  }
  return {
    command,
    authorization,
    preparationFailure,
    failNextPreparation: () => { failNextPreparation = true; },
    kernel,
    audits,
    dirty,
    createSession,
    failNextCleanup: () => { failNextCleanup = true; },
    delayNextCleanup: (delay: () => Promise<void>) => { delayNextCleanup = delay; },
    exists: async (id: string) => await scope.observer.exists(keys.active("principal_session", id)),
    reenable: async () => {
      user.status = UserStatus.Enable;
      const transition = await barrier.beginBlocking(subjectIdentifier);
      await barrier.prepareRepair(transition, "enabled");
      await barrier.finalize(transition, "enabled");
    },
  };
}

describe("Resignation recovery with production Redis Session Kernel and fake business persistence", () => {
  for (const scoped of [false, true]) {
    test(`no-op ${scoped ? "HR" : "Full"} retry actually removes the original generation after first cleanup fails`, async () => {
      const subject = await fixture();
      const original = await subject.createSession();
      subject.failNextCleanup();
      const first = await subject.command.execute({ username: "holder" }, { authorization: scoped ? subject.authorization : undefined });
      expect(first).toEqual({ changed: true, result: null });
      const retained = await subject.exists(original.value.principalSessionId);
      expect(retained).toBe(1);
      const retry = await subject.command.execute({ username: "holder" }, { authorization: scoped ? subject.authorization : undefined });
      expect(retry).toEqual({ changed: false, result: null });
      const removed = await subject.exists(original.value.principalSessionId);
      expect(removed).toBe(0);
      expect(subject.dirty).toHaveBeenCalledTimes(1);
      expect(subject.audits).toMatchObject([{ details: { changed: true } }, { details: { changed: false } }]);
    });
  }

  test("preparation read failure still commits resignation and uses the prior generation fallback", async () => {
    const subject = await fixture();
    const original = await subject.createSession();
    subject.failNextPreparation();
    const result = await subject.command.execute({ username: "holder" });
    expect(result).toEqual({ changed: true, result: null });
    expect(subject.preparationFailure).toHaveBeenCalledTimes(1);
    const removed = await subject.exists(original.value.principalSessionId);
    expect(removed).toBe(0);
    expect(subject.dirty).toHaveBeenCalledTimes(1);
    expect(subject.audits).toMatchObject([{ details: { changed: true } }]);
  });

  test("delayed retry cleanup preserves a Session issued by a later re-enable generation", async () => {
    const subject = await fixture();
    const original = await subject.createSession();
    subject.failNextCleanup();
    await subject.command.execute({ username: "holder" });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    subject.delayNextCleanup(async () => {
      entered.resolve();
      await release.promise;
    });
    const pending = subject.command.execute({ username: "holder" });
    await Promise.race([entered.promise, pending]);
    let later: Awaited<ReturnType<typeof subject.createSession>>;
    try {
      await subject.reenable();
      later = await subject.createSession();
    }
    finally {
      release.resolve();
      await Promise.allSettled([pending]);
    }
    const result = await pending;
    expect(result).toEqual({ changed: false, result: null });
    const originalExists = await subject.exists(original.value.principalSessionId);
    expect(originalExists).toBe(0);
    const resolved = await subject.kernel.resolvePrincipalSessionById(later.value.principalSessionId);
    expect(resolved).toMatchObject({ status: "resolved", value: { principalSessionId: later.value.principalSessionId } });
  });
});
