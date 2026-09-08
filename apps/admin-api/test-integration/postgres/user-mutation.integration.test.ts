import type { AdminUserTransactionPorts } from "@admin-api/services/user/user.port";
import type { AdminApiPostgresTestHarness } from "./postgres-test-harness";
import { randomUUID } from "node:crypto";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createUserService } from "@admin-api/services/user/user.service";
import { BadRequestError } from "@iam/api-core/errors";
import { createSubjectAccessBarrier, createSubjectAccessLifecycle, createSubjectAccessOperations } from "@iam/api-core/subject-access";
import { createInMemorySubjectAccessStore } from "@iam/api-core/subject-access/testing";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { EmploymentStatus, OrganizationLevel, OrganizationType, UserStatus, UserType } from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import { auditLogs, employments, organizations, positions, subjectAccessTransitions, userProfileDirty, users } from "@iam/db/schema";
import { UserHasOpenEmploymentError, UsernameAlreadyExistsError, UserNotFoundError } from "@iam/domain/user";
import { createSubjectAccessTransitionRepository } from "@iam/user-profile-read-model/subject-access-transition";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

function createCommand(
  decorate: (tx: AdminUserTransactionPorts) => AdminUserTransactionPorts = tx => tx,
  prepareRepairError?: Error,
  store = createInMemorySubjectAccessStore(),
) {
  const repositories = createAdminApiRepositories(harness.db);
  const warn = mock(() => undefined);
  const enqueueRebuildJobs = mock(async () => ({ enqueued: 1, jobIds: ["user-job"] }));
  const revokeUserSessions = mock(async () => {
    const counts = { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 };
    return {
      principalSessions: counts,
      bindings: counts,
      credentials: counts,
      artifacts: counts,
      cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
    };
  });
  const clock = { nowDate: () => new Date("2026-09-07T00:00:00Z") };
  const random = { uuid: randomUUID, password: mock(() => "Random123!") };
  const barrier = createSubjectAccessBarrier({ clock, random, store });
  const uow = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn },
    clock,
    userProfileJobProducer: { enqueueRebuildJobs },
  });
  return {
    barrier,
    store,
    enqueueRebuildJobs,
    revokeUserSessions,
    warn,
    random,
    service: createUserService({
      userRepository: repositories.user,
      employmentRepository: repositories.employment,
      roleAssignmentResolver: { resolveEffectiveRoles: async () => new Map() },
      privilegeRepository: { getPrivilegesByRoleIds: async () => [] },
      passwordHasher: { hashPassword: async password => `hash:${password}` },
      random,
      sessionRevocation: { revokeUserSessions },
      subjectAccessLifecycle: createSubjectAccessLifecycle({
        barrier: prepareRepairError
          ? { ...barrier, prepareRepair: async () => {
              throw prepareRepairError;
            } }
          : barrier,
        logger: { warn },
        random,
        transitionIntent: createSubjectAccessTransitionRepository(harness.db),
      }),
      uow: mapUnitOfWork(uow, tx => decorate({
        userRepository: tx.repositories.user,
        auditService: tx.auditService,
        subjectAccessMutation: tx.subjectAccessMutation,
        userProfileInvalidation: tx.userProfileInvalidation,
      })),
    }),
  };
}

async function seedUser(status = UserStatus.Enable, isDelete = false) {
  const [user] = await harness.db.insert(users).values({
    username: "user",
    name: "Original",
    userType: UserType.Formal,
    status,
    isDelete,
    password: "old-hash",
    mobile: "13800000000",
  }).returning();
  return user!;
}

async function facts() {
  return {
    users: await harness.db.select().from(users).orderBy(users.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    dirty: await harness.db.select().from(userProfileDirty).orderBy(userProfileDirty.userId),
  };
}

async function failure(operation: () => Promise<unknown>) {
  try {
    await operation();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected command failure");
}

function stableStore(subjectIdentifier: string, state: "enabled" | "disabled" = "enabled") {
  return createInMemorySubjectAccessStore([{
    version: 1,
    subjectIdentifier,
    state,
    transitionId: randomUUID(),
    updatedAt: "2026-09-07T00:00:00Z",
  }]);
}

async function transitions() {
  return await harness.db.select().from(subjectAccessTransitions).orderBy(subjectAccessTransitions.createTime);
}

async function waitForUserLock() {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const rows = await harness.sql<{ blocked: boolean }[]>`select exists (
      select 1 from pg_stat_activity where wait_event_type = 'Lock'
      and query like '%"user"%' and application_name = current_setting('application_name')
      and pid <> pg_backend_pid()
    ) as blocked`;
    if (rows[0]!.blocked)
      return;
  }
  throw new Error("Expected an independent transaction waiting for the User row lock");
}

describe("User lifecycle mutations through production PostgreSQL UnitOfWork", () => {
  test("missing status/delete and repeated delete return not found without additional effects", async () => {
    const { service } = createCommand();
    for (const operation of [() => service.updateUserStatus("missing", UserStatus.Disable), () => service.deleteUser("missing")]) {
      const error = await failure(operation);
      expect(error).toBeInstanceOf(UserNotFoundError);
    }
    const missingIntents = await transitions();
    expect(missingIntents).toEqual([]);
    await seedUser();
    const result = await service.deleteUser("user");
    expect(result).toEqual({ changed: true, result: null });
    const before = await facts();
    const intentsBefore = await transitions();
    const error = await failure(() => service.deleteUser("user"));
    expect(error).toBeInstanceOf(UserNotFoundError);
    const after = await facts();
    const intentsAfter = await transitions();
    expect(after).toEqual(before);
    expect(intentsAfter).toEqual(intentsBefore);
  });

  for (const status of [EmploymentStatus.Enable, EmploymentStatus.Pause]) {
    test(`Open Employment ${status} blocks deletion and restores the barrier`, async () => {
      const user = await seedUser();
      const [organization] = await harness.db.insert(organizations).values({
        orgCode: "ORG",
        orgName: "Organization",
        path: "/ORG",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
      }).returning();
      const [position] = await harness.db.insert(positions).values({ posCode: "POS", posName: "Position" }).returning();
      await harness.db.insert(employments).values({
        userId: user.id,
        orgId: organization!.id,
        posId: position!.id,
        status,
      });
      const { service, store, revokeUserSessions } = createCommand(
        undefined,
        undefined,
        stableStore(user.subjectIdentifier),
      );
      const barrierBefore = await store.read(user.subjectIdentifier);
      const before = await facts();
      const error = await failure(() => service.deleteUser("user"));
      expect(error).toBeInstanceOf(UserHasOpenEmploymentError);
      const after = await facts();
      const barrierAfter = await store.read(user.subjectIdentifier);
      const intents = await transitions();
      expect(after).toEqual(before);
      expect(barrierAfter).toEqual(barrierBefore);
      expect(intents).toMatchObject([{ status: "rolled_back", targetState: "rollback" }]);
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  for (const status of [UserStatus.Enable, UserStatus.Pause, UserStatus.Disable]) {
    test(`same status ${status} records intent audit without dirty or awaiting publication`, async () => {
      const user = await seedUser(status);
      const initialStore = stableStore(user.subjectIdentifier, status === UserStatus.Enable ? "enabled" : "disabled");
      const { service, store, enqueueRebuildJobs, revokeUserSessions } = createCommand(
        undefined,
        undefined,
        initialStore,
      );
      const barrierBefore = await store.read(user.subjectIdentifier);
      const result = await service.updateUserStatus("user", status);
      const after = await facts();
      const barrierAfter = await store.read(user.subjectIdentifier);
      const backlog = await store.inspectRepairBacklog();
      const intents = await transitions();
      expect(result).toEqual({ changed: false, result: null });
      expect(after.users).toEqual([user]);
      expect(after.audits).toMatchObject([{ action: "admin.user.status_update", details: { changed: false } }]);
      expect(after.dirty).toEqual([]);
      expect(barrierAfter).toEqual(barrierBefore);
      expect(backlog.count).toBe(0);
      expect(intents).toMatchObject([{ status: "committed", targetState: "rollback" }]);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  test("enabling commits facts and leaves access blocking until publication", async () => {
    const user = await seedUser(UserStatus.Disable);
    const { service, store, barrier, revokeUserSessions } = createCommand(
      undefined,
      undefined,
      stableStore(user.subjectIdentifier, "disabled"),
    );
    const result = await service.updateUserStatus("user", UserStatus.Enable);
    const after = await facts();
    const record = await barrier.read(user.subjectIdentifier);
    const backlog = await store.inspectRepairBacklog();
    const intents = await transitions();
    expect(result).toEqual({ changed: true, result: null });
    expect(after.users[0]).toMatchObject({ status: UserStatus.Enable });
    expect(after.audits).toMatchObject([{ action: "admin.user.status_update", details: { changed: true } }]);
    expect(after.dirty).toMatchObject([{ dirtyVersion: "1" }]);
    expect(intents).toMatchObject([{ status: "committed", targetState: "enabled" }]);
    expect(record.state).toBe("blocking");
    expect(backlog.count).toBe(1);
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  for (const operation of ["status", "delete"] as const) {
    const action = operation === "status" ? "admin.user.status_update" : "admin.user.delete";
    for (const stage of ["audit", "dirty", "zero-row"] as const) {
      test(`${operation} rolls back business facts, audit, dirty and intent when ${stage} fails`, async () => {
        const user = await seedUser();
        const sentinel = new Error(`injected ${stage}`);
        const { service, store, enqueueRebuildJobs, revokeUserSessions } = createCommand(tx => ({
          ...tx,
          ...(stage === "audit"
            ? {
                auditService: { ...tx.auditService, recordAuditLog: async (input) => {
                  await tx.auditService.recordAuditLog(input);
                  throw sentinel;
                } },
              }
            : stage === "dirty"
              ? {
                  userProfileInvalidation: { recordChanges: async (changes) => {
                    await tx.userProfileInvalidation.recordChanges(changes);
                    throw sentinel;
                  } },
                }
              : {
                  userRepository: { ...tx.userRepository, [operation === "status" ? "updateUserByUsername" : "softDeleteUserByUsername"]: async () => null },
                }),
        }), undefined, stableStore(user.subjectIdentifier));
        const before = await facts();
        const barrierBefore = await store.read(user.subjectIdentifier);
        const error = await failure(() => operation === "status"
          ? service.updateUserStatus("user", UserStatus.Disable)
          : service.deleteUser("user"));
        if (stage === "zero-row")
          expect(error).toBeInstanceOf(Error);
        else
          expect(error).toBe(sentinel);
        const after = await facts();
        const barrierAfter = await store.read(user.subjectIdentifier);
        const intents = await transitions();
        expect(after).toEqual(before);
        expect(barrierAfter).toEqual(barrierBefore);
        expect(intents).toMatchObject([{ status: "rolled_back", targetState: "rollback" }]);
        expect(enqueueRebuildJobs).not.toHaveBeenCalled();
        expect(revokeUserSessions).not.toHaveBeenCalled();
      });
    }

    test(`${operation} committed lifecycle failure uses the dedicated error`, async () => {
      const user = await seedUser();
      const { service, barrier } = createCommand(undefined, new Error("repair unavailable"), stableStore(user.subjectIdentifier));
      const error = await failure(() => operation === "status"
        ? service.updateUserStatus("user", UserStatus.Disable)
        : service.deleteUser("user"));
      expect(error).toBeInstanceOf(AdminMutationCommittedError);
      const after = await facts();
      const intents = await transitions();
      const record = await barrier.read(user.subjectIdentifier);
      expect(after.users[0]).toMatchObject(operation === "status" ? { status: UserStatus.Disable } : { isDelete: true });
      expect(after.audits).toMatchObject([{ action, details: { changed: true } }]);
      expect(after.dirty).toMatchObject([{ userId: user.id, dirtyVersion: "1" }]);
      expect(intents).toMatchObject([{ status: "committed", targetState: "disabled" }]);
      expect(record.state).toBe("blocking");
    });

    test(`${operation} bestEffort session failure preserves committed success`, async () => {
      const user = await seedUser();
      const { service, barrier, revokeUserSessions, warn } = createCommand(
        undefined,
        undefined,
        stableStore(user.subjectIdentifier),
      );
      revokeUserSessions.mockImplementation(async () => {
        throw new Error("session unavailable");
      });
      const result = await (operation === "status"
        ? service.updateUserStatus("user", UserStatus.Disable)
        : service.deleteUser("user"));
      const after = await facts();
      const record = await barrier.read(user.subjectIdentifier);
      expect(result).toEqual({ changed: true, result: null });
      expect(after.audits).toMatchObject([{ action, details: { changed: true } }]);
      expect(after.dirty).toMatchObject([{ userId: user.id, dirtyVersion: "1" }]);
      expect(record.state).toBe("disabled");
      expect(revokeUserSessions).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalled();
    });

    test(`${operation} waits for an independent profile transaction and keeps its committed fields`, async () => {
      const user = await seedUser();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({ ...tx, userRepository: {
        ...tx.userRepository,
        updateUserByUsername: async (username, patch) => {
          const row = await tx.userRepository.updateUserByUsername(username, patch);
          written.resolve();
          await release.promise;
          return row;
        },
      } })).service;
      const firstPending = first.updateUser("user", { name: "Concurrent profile" });
      await Promise.race([written.promise, firstPending]);
      const second = createCommand(undefined, undefined, stableStore(user.subjectIdentifier)).service;
      const secondPending = operation === "status"
        ? second.updateUserStatus("user", UserStatus.Disable)
        : second.deleteUser("user");
      try {
        await waitForUserLock();
      }
      finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const firstResult = await firstPending;
      const secondResult = await secondPending;
      const after = await facts();
      expect(firstResult).toEqual({ changed: true, result: null });
      expect(secondResult).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({ name: "Concurrent profile", password: "old-hash", ...(operation === "status" ? { status: UserStatus.Disable } : { isDelete: true }) });
      expect(after.audits.map(audit => audit.action)).toEqual(["admin.user.update", action]);
      expect(after.dirty).toMatchObject([{ dirtyVersion: "2" }]);
    });

    test(`pending ${operation} lifecycle rejects the competing lifecycle through the durable intent fence`, async () => {
      const user = await seedUser();
      const locked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const profile = createCommand(tx => ({ ...tx, userRepository: {
        ...tx.userRepository,
        lockUserByUsername: async (...args) => {
          const row = await tx.userRepository.lockUserByUsername(...args);
          locked.resolve();
          await release.promise;
          return row;
        },
      } })).service;
      const profilePending = profile.updateUser("user", { name: "Concurrent profile" });
      await Promise.race([locked.promise, profilePending]);
      const store = stableStore(user.subjectIdentifier);
      const first = createCommand(undefined, undefined, store).service;
      const second = createCommand(undefined, undefined, store).service;
      const firstPending = operation === "status"
        ? first.updateUserStatus("user", UserStatus.Disable)
        : first.deleteUser("user");
      try {
        await waitForUserLock();
        const error = await failure(() => operation === "status"
          ? second.deleteUser("user")
          : second.updateUserStatus("user", UserStatus.Disable));
        expect(extractPostgresError(error)).toEqual({
          code: "23505",
          constraint: "subject_access_transition_pending_subject_idx",
        });
      }
      finally {
        release.resolve();
        await Promise.allSettled([profilePending, firstPending]);
      }
      const result = await firstPending;
      const after = await facts();
      const intents = await transitions();
      expect(result).toEqual({ changed: true, result: null });
      expect(after.users[0]).toMatchObject({ name: "Concurrent profile", status: operation === "status" ? UserStatus.Disable : UserStatus.Enable, isDelete: operation === "delete" });
      expect(after.audits.map(audit => audit.action)).toEqual(["admin.user.update", action]);
      expect(after.dirty).toMatchObject([{ dirtyVersion: "2" }]);
      expect(intents).toMatchObject([{ status: "committed", targetState: "disabled" }]);
    });
  }
});

describe("User mutations through production PostgreSQL UnitOfWork", () => {
  test("concurrent username creates reach the real unique constraint and only one commits", async () => {
    let arrived = 0;
    const gate = Promise.withResolvers<void>();
    const { service } = createCommand(tx => ({ ...tx, userRepository: {
      ...tx.userRepository,
      getAnyUserByUsername: async (username) => {
        const row = await tx.userRepository.getAnyUserByUsername(username);
        if (++arrived === 2)
          gate.resolve();
        await gate.promise;
        return row;
      },
    } }));
    const results = await Promise.allSettled(["First", "Second"].map(name => service.setUserForAdmin({ username: "user", name, userType: UserType.Formal })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")?.reason).toBeInstanceOf(UsernameAlreadyExistsError);
    const after = await facts();
    expect(after.users).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.dirty).toMatchObject([{ dirtyVersion: "1" }]);
  });

  test("transaction precheck catches a tombstone appearing after the root precheck", async () => {
    const { service } = createCommand(tx => ({ ...tx, userRepository: {
      ...tx.userRepository,
      getAnyUserByUsername: async (username) => {
        await seedUser(UserStatus.Enable, true);
        return await tx.userRepository.getAnyUserByUsername(username);
      },
    } }));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "Duplicate", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(UsernameAlreadyExistsError);
    const after = await facts();
    expect(after.users).toMatchObject([{ isDelete: true, password: "old-hash" }]);
    expect(after.audits).toEqual([]);
    expect(after.dirty).toEqual([]);
  });

  test("create reports committed failure when Subject Access repair preparation fails", async () => {
    const { service } = createCommand(undefined, new Error("repair unavailable"));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(AdminMutationCommittedError);
    const after = await facts();
    expect(after.users).toHaveLength(1);
    expect(after.audits).toMatchObject([{ details: { changed: true } }]);
    expect(after.dirty).toMatchObject([{ dirtyVersion: "1" }]);
    expect(JSON.stringify(error)).not.toContain("Random123!");
  });

  test("create failure before commit preserves the original failure and rolls back", async () => {
    const sentinel = new Error("audit unavailable");
    const { service, enqueueRebuildJobs } = createCommand(tx => ({ ...tx, auditService: {
      ...tx.auditService,
      recordAuditLog: async (input) => {
        await tx.auditService.recordAuditLog(input);
        throw sentinel;
      },
    } }));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }));
    expect(error).toBe(sentinel);
    const after = await facts();
    expect(after).toEqual({ users: [], audits: [], dirty: [] });
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  test("zero-row create fails closed", async () => {
    const { service } = createCommand(tx => ({
      ...tx,
      userRepository: { ...tx.userRepository, setUserForAdmin: async () => null },
    }));
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(Error);
    const after = await facts();
    expect(after).toEqual({ users: [], audits: [], dirty: [] });
  });

  test("create returns a safe resource and one-time password with committed audit and dirty", async () => {
    const { service } = createCommand();
    const result = await service.setUserForAdmin({ username: "user", name: "User", userType: UserType.Formal });
    expect(result).toMatchObject({ changed: true, result: {
      username: "user",
      generatedPassword: "Random123!",
      user: { username: "user", name: "User" },
    } });
    expect(result.result.user).not.toHaveProperty("password");
    const after = await facts();
    expect(after.users[0]).toMatchObject({ password: "hash:Random123!", subjectIdentifier: expect.any(String) });
    expect(after.audits).toMatchObject([{ action: "admin.user.create", details: { changed: true, passwordProvided: false } }]);
    expect(after.dirty).toMatchObject([{ userId: after.users[0]!.id, dirtyVersion: "1" }]);
    expect(JSON.stringify(after.audits)).not.toContain("Random123!");
    expect(JSON.stringify(result)).not.toContain("hash:");
  });

  test("soft-deleted usernames remain occupied before lifecycle work", async () => {
    await seedUser(UserStatus.Enable, true);
    const { service, random } = createCommand();
    const before = await facts();
    const error = await failure(() => service.setUserForAdmin({ username: "user", name: "Duplicate", userType: UserType.Formal }));
    expect(error).toBeInstanceOf(UsernameAlreadyExistsError);
    expect(random.password).not.toHaveBeenCalled();
    const after = await facts();
    expect(after).toEqual(before);
  });

  test("real unique violation retains Drizzle cause and unknown constraints remain internal", async () => {
    await seedUser();
    const raw = await failure(async () => await harness.db.insert(users).values({ username: "user", name: "Duplicate", userType: UserType.Formal }));
    expect(raw).toHaveProperty("cause");
    expect(extractPostgresError(raw)?.code).toBe("23505");
    await harness.sql`create unique index user_test_name_unique on "user"(name)`;
    try {
      const before = await facts();
      const error = await failure(() => createCommand().service.setUserForAdmin({ username: "other", name: "Original", userType: UserType.Formal }));
      expect(error).not.toBeInstanceOf(UsernameAlreadyExistsError);
      expect(extractPostgresError(error)).toEqual({ code: "23505", constraint: "user_test_name_unique" });
      const after = await facts();
      expect(after).toEqual(before);
    }
    finally {
      await harness.sql`drop index user_test_name_unique`;
    }
  });

  test("empty/missing updates fail and equal profile values do not write audit or dirty", async () => {
    await seedUser();
    const { service, enqueueRebuildJobs } = createCommand();
    const before = await facts();
    const empty = await failure(() => service.updateUser("missing", {}));
    expect(empty).toBeInstanceOf(BadRequestError);
    const missing = await failure(() => service.updateUser("missing", { name: "Name" }));
    expect(missing).toBeInstanceOf(UserNotFoundError);
    const same = await service.updateUser("user", { name: "Original", mobile: "13800000000", wxId: null });
    expect(same).toEqual({ changed: false, result: null });
    const after = await facts();
    expect(after).toEqual(before);
    expect(enqueueRebuildJobs).not.toHaveBeenCalled();
  });

  for (const stage of ["audit", "dirty"] as const) {
    test(`profile edit rolls back source/audit/dirty when ${stage} fails`, async () => {
      await seedUser();
      const sentinel = new Error(`injected ${stage}`);
      const { service, enqueueRebuildJobs } = createCommand(tx => ({
        ...tx,
        ...(stage === "audit"
          ? {
              auditService: { ...tx.auditService, recordAuditLog: async (input) => {
                await tx.auditService.recordAuditLog(input);
                throw sentinel;
              } },
            }
          : {
              userProfileInvalidation: { recordChanges: async (changes) => {
                await tx.userProfileInvalidation.recordChanges(changes);
                throw sentinel;
              } },
            }),
      }));
      const before = await facts();
      const error = await failure(() => service.updateUser("user", { name: "Changed" }));
      expect(error).toBe(sentinel);
      const after = await facts();
      expect(after).toEqual(before);
      expect(enqueueRebuildJobs).not.toHaveBeenCalled();
    });
  }

  test("profile update commits before queue notification and masks contacts in audit", async () => {
    const user = await seedUser();
    const { service, enqueueRebuildJobs } = createCommand();
    let observed: Awaited<ReturnType<typeof facts>> | undefined;
    enqueueRebuildJobs.mockImplementation(async () => {
      observed = await facts();
      return { enqueued: 1, jobIds: ["user-job"] };
    });
    const result = await service.updateUser("user", { mobile: "13912345678" });
    expect(result).toEqual({ changed: true, result: null });
    expect(observed?.users[0]).toMatchObject({ mobile: "13912345678" });
    expect(observed?.audits).toMatchObject([{ action: "admin.user.update", details: { changed: true } }]);
    expect(observed?.dirty).toMatchObject([{ userId: user.id, dirtyVersion: "1" }]);
    expect(JSON.stringify(observed?.audits)).not.toContain("13912345678");
  });

  for (const method of ["updateUserByUsername", "setPassword"] as const) {
    test(`zero-row ${method} does not fabricate audit, dirty or session revocation`, async () => {
      await seedUser();
      const { service, revokeUserSessions } = createCommand(tx => ({
        ...tx,
        userRepository: { ...tx.userRepository, [method]: async () => null },
      }));
      const before = await facts();
      const error = await failure(() => method === "setPassword" ? service.resetPasswordByUsername("user") : service.updateUser("user", { name: "Changed" }));
      expect(error).toBeInstanceOf(Error);
      const after = await facts();
      expect(after).toEqual(before);
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  for (const status of [UserStatus.Pause, UserStatus.Disable]) {
    test(`guarded reset rejects status ${status} without audit or sessions`, async () => {
      await seedUser(status);
      const { service, revokeUserSessions } = createCommand();
      const before = await facts();
      const error = await failure(() => service.resetPasswordByUsername("user"));
      expect(error).toBeInstanceOf(UserNotFoundError);
      const after = await facts();
      expect(after).toEqual(before);
      expect(revokeUserSessions).not.toHaveBeenCalled();
    });
  }

  test("reset is a credential change and bestEffort session failure preserves safe success", async () => {
    await seedUser();
    const { service, revokeUserSessions, warn } = createCommand();
    revokeUserSessions.mockImplementation(async () => {
      throw new Error("session unavailable");
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await service.resetPasswordByUsername("user");
      expect(result).toEqual({ changed: true, result: "Random123!" });
    }
    const after = await facts();
    expect(after.users[0]!.password).toBe("hash:Random123!");
    expect(after.audits).toMatchObject([
      { action: "admin.user.reset_password", details: { changed: true, passwordReset: true } },
      { action: "admin.user.reset_password", details: { changed: true, passwordReset: true } },
    ]);
    expect(after.dirty).toEqual([]);
    expect(JSON.stringify(after.audits)).not.toContain("Random123!");
    expect(revokeUserSessions).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });

  for (const secondOperation of ["other-field", "same-value"] as const) {
    test(`a waiting ${secondOperation} profile edit observes committed facts`, async () => {
      await seedUser();
      const written = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = createCommand(tx => ({ ...tx, userRepository: {
        ...tx.userRepository,
        updateUserByUsername: async (username, patch) => {
          const row = await tx.userRepository.updateUserByUsername(username, patch);
          written.resolve();
          await release.promise;
          return row;
        },
      } })).service;
      const firstPending = first.updateUser("user", { mobile: "13912345678" });
      await Promise.race([written.promise, firstPending]);
      const secondPending = createCommand().service.updateUser("user", secondOperation === "other-field"
        ? { name: "Changed" }
        : { mobile: "13912345678" });
      try {
        const deadline = Date.now() + 2000;
        let blocked = false;
        while (!blocked && Date.now() < deadline) {
          const rows = await harness.sql<{ blocked: boolean }[]>`select exists (
          select 1 from pg_stat_activity where wait_event_type = 'Lock'
          and query like '%"user"%' and application_name = current_setting('application_name')
          and pid <> pg_backend_pid()
        ) as blocked`;
          blocked = rows[0]!.blocked;
        }
        expect(blocked).toBe(true);
      }
      finally {
        release.resolve();
        await Promise.allSettled([firstPending, secondPending]);
      }
      const firstResult = await firstPending;
      const secondResult = await secondPending;
      expect(firstResult).toEqual({ changed: true, result: null });
      expect(secondResult).toEqual({ changed: secondOperation === "other-field", result: null });
      const after = await facts();
      expect(after.users[0]).toMatchObject({
        name: secondOperation === "other-field" ? "Changed" : "Original",
        mobile: "13912345678",
        password: "old-hash",
        status: UserStatus.Enable,
      });
      expect(after.audits).toHaveLength(secondOperation === "other-field" ? 2 : 1);
      expect(after.dirty).toMatchObject([{ dirtyVersion: secondOperation === "other-field" ? "2" : "1" }]);
    });
  }
});

for (const profileState of [
  { status: UserStatus.Pause, isDelete: false },
  { status: UserStatus.Disable, isDelete: false },
  { status: UserStatus.Disable, isDelete: true },
]) {
  test(`permitted Admin reads retained PostgreSQL profile ${JSON.stringify(profileState)}`, async () => {
    const user = await seedUser(profileState.status, profileState.isDelete);
    const command = createCommand();
    const readBarrier = mock(async () => "20000000-0000-4000-8000-000000000001");
    const operations = createSubjectAccessOperations({
      barrier: { readCommittedTransitionId: readBarrier },
      revocation: {
        revokePrincipalSession: command.revokeUserSessions,
        revokeUserSessions: command.revokeUserSessions,
      },
    });
    const detail = await operations.run(async (operation) => {
      await operation.acquireForAuthentication(user.subjectIdentifier);
      return await command.service.getUserDetailForPermittedAdmin(operation, user.subjectIdentifier);
    });
    expect(detail).toMatchObject({ id: user.id, ...profileState });
    expect(readBarrier).toHaveBeenCalledTimes(1);
    expect(command.revokeUserSessions).toHaveBeenCalledTimes(0);
  });
}
