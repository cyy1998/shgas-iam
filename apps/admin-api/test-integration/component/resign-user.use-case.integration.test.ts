import type {
  ResignUserSubjectAccessLifecyclePort,
  ResignUserTransactionPorts,
  ResignUserUseCaseDeps,
} from "@admin-api/use-cases/employment/resign-user/resign-user.port";
import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/testing/fakes";
import { createResignUserUseCase } from "@admin-api/use-cases/employment/resign-user/resign-user.use-case";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const previousSubjectAccessTransitionId = "20000000-0000-4000-8000-000000000001";
const subjectAccessMutationReceipt: SubjectAccessMutationReceipt = {
  subjectIdentifier,
  transitionId: "10000000-0000-4000-8000-000000000001",
  ownerToken: "10000000-0000-4000-8000-000000000002",
};

function createSubjectAccessMutation(): ResignUserTransactionPorts["subjectAccessMutation"] {
  return {
    runMutation: async <T>(
      _receipt: SubjectAccessMutationReceipt,
      mutation: () => Promise<T>,
    ) => await mutation(),
  };
}

function createSessionRevocation() {
  return { revokeUserSessions: mock(async () => undefined) };
}

function createResponsibilityParentLifecycle(changed = false) {
  return {
    endOpenAssignmentsForUserResignation: mock(async () => changed),
  };
}

function createSubjectAccessLifecycle(preBlockError?: Error) {
  return {
    run: mock(async (
      input: Parameters<ResignUserSubjectAccessLifecyclePort["run"]>[0],
    ) => {
      if (preBlockError)
        throw preBlockError;
      const result = await input.mutate(subjectAccessMutationReceipt);
      try {
        await input.revokeSessions(result, {
          invalidatedSubjectAccessTransitionId:
            previousSubjectAccessTransitionId,
        });
      }
      catch {
        // Session revocation remains best-effort after the account mutation commits.
      }
      return result;
    }),
  };
}

function createUserReader(
  value: ResignUserUseCaseDeps["userReader"] extends {
    getUserByUsernameForAdmin: (...args: never[]) => Promise<infer T>;
  } ? T : never = {
      id: 1,
      subjectIdentifier,
      username: "zhangsan",
      name: "张三",
    },
) {
  return {
    getUserByUsernameForAdmin: mock(async () => value),
  };
}

describe("createResignUserUseCase", () => {
  test("ends Open Employments at one authoritative time before disabling an existing user", async () => {
    const events: string[] = [];
    const transactionTime = new Date("2026-08-11T10:30:00.000Z");
    const clock = createFakeClock(transactionTime.getTime());
    const tx = {
      auditLogWriter: {
        recordAuditLog: mock(async () => {
          events.push("audit");
        }),
      },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: {
        endOpenEmploymentsByUserId: mock(async () => {
          events.push("employment:end");
        }),
      },
      responsibilityParentLifecycle: {
        endOpenAssignmentsForUserResignation: mock(async () => {
          events.push("responsibility:end");
          return true;
        }),
      },
      userProfileInvalidation: {
        recordChanges: mock(async () => {
          events.push("profile:invalidate");
        }),
      },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => {
          events.push("user:lookup");
          return { id: 1, subjectIdentifier, username: "zhangsan", name: "张三" };
        }),
        updateUserByUsername: mock(async () => {
          events.push("user:disable");
        }),
      },
    };
    const useCase = createResignUserUseCase({
      clock,
      sessionRevocation: createSessionRevocation(),
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: createImmediateUnitOfWork(tx),
      userReader: createUserReader(),
    });

    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);

    expect(tx.userStore.updateUserByUsername).toHaveBeenCalledWith("zhangsan", {
      status: UserStatus.Disable,
    });
    expect(clock.nowDate).toHaveBeenCalledTimes(1);
    expect(tx.employmentStore.endOpenEmploymentsByUserId).toHaveBeenCalledWith(
      1,
      transactionTime,
    );
    expect(
      tx.responsibilityParentLifecycle.endOpenAssignmentsForUserResignation,
    ).toHaveBeenCalledWith({
      auditContext: undefined,
      endTime: transactionTime,
      userId: 1,
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 1 },
      { kind: "employment", userId: 1 },
      { kind: "organization-responsibility-assignment", userId: 1 },
    ]);
    expect(events).toEqual([
      "user:lookup",
      "employment:end",
      "responsibility:end",
      "user:disable",
      "audit",
      "profile:invalidate",
    ]);
  });

  test("revokes every active session after resignation takes effect", async () => {
    const events: string[] = [];
    const afterCommitTasks: Array<() => Promise<void> | void> = [];
    const afterCommit = {
      bestEffort: mock((_name: string, callback: () => Promise<void> | void) => {
        afterCommitTasks.push(callback);
      }),
      required: mock(() => undefined),
    };
    const sessionRevocation = {
      revokeUserSessions: mock(async () => {
        events.push("sessions:revoke");
      }),
    };
    const tx = {
      auditLogWriter: {
        recordAuditLog: mock(async () => {
          events.push("audit");
        }),
      },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: {
        endOpenEmploymentsByUserId: mock(async () => {
          events.push("employment:end");
        }),
      },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: {
        recordChanges: mock(async () => {
          events.push("profile:invalidate");
        }),
      },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({
          id: 1,
          subjectIdentifier,
          username: "zhangsan",
          name: "张三",
        })),
        updateUserByUsername: mock(async () => {
          events.push("user:disable");
        }),
      },
    };
    const uow: ResignUserUseCaseDeps["uow"] = {
      async transaction(callback) {
        const result = await callback({ ...tx, afterCommit });
        events.push("transaction:committed");
        for (const task of afterCommitTasks)
          await task();
        return result;
      },
    };
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow,
      userReader: createUserReader(),
    });
    const auditContext = {
      actorType: "admin" as const,
      actorUserId: 1,
      principalSessionId: "ps-current",
      requestId: "req-1",
      traceId: "trace-1",
    };

    await expect(useCase.execute(
      { username: "zhangsan" },
      { auditContext },
    )).resolves.toBe(true);

    expect(sessionRevocation.revokeUserSessions).toHaveBeenCalledWith({
      auditContext,
      reason: "user_disabled",
      onlySubjectAccessTransitionId: previousSubjectAccessTransitionId,
      subjectIdentifier,
      userId: 1,
    });
    expect(events).toEqual([
      "employment:end",
      "user:disable",
      "audit",
      "profile:invalidate",
      "transaction:committed",
      "sessions:revoke",
    ]);
  });

  test("keeps resignation successful when session revocation fails", async () => {
    const revocationFailure = new Error("session revocation unavailable");
    const sessionRevocation = {
      revokeUserSessions: mock(async () => {
        throw revocationFailure;
      }),
    };
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { endOpenEmploymentsByUserId: mock(async () => undefined) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({
          id: 1,
          subjectIdentifier,
          username: "zhangsan",
          name: "张三",
        })),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: createImmediateUnitOfWork(tx),
      userReader: createUserReader(),
    });

    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);
    expect(sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(1);
  });

  test("retries session revocation when resignation is repeated", async () => {
    const sessionRevocation = createSessionRevocation();
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { endOpenEmploymentsByUserId: mock(async () => undefined) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({
          id: 1,
          subjectIdentifier,
          username: "zhangsan",
          name: "张三",
        })),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: createImmediateUnitOfWork(tx),
      userReader: createUserReader(),
    });

    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);
    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);

    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledTimes(2);
    expect(sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(2);
  });

  test("preserves first End times when resignation is repeated", async () => {
    const firstResignationTime = new Date("2026-08-11T10:30:00.000Z");
    const retryTime = new Date("2026-08-11T11:30:00.000Z");
    const times = [firstResignationTime, retryTime];
    const clock = { nowDate: mock(() => times.shift()!) };
    const openEmployments = [
      {
        lifecycle: "enabled-open",
        status: EmploymentStatus.Enable as EmploymentStatus,
        isPrimary: true,
        endTime: null as Date | null,
      },
      {
        lifecycle: "paused-open",
        status: EmploymentStatus.Pause as EmploymentStatus,
        isPrimary: false,
        endTime: null as Date | null,
      },
    ];
    const employmentStore = {
      endOpenEmploymentsByUserId: mock(async (_userId: number, endTime: Date) => {
        for (const employment of openEmployments) {
          if (employment.endTime !== null)
            continue;
          employment.status = EmploymentStatus.Disable;
          employment.endTime = endTime;
          employment.isPrimary = false;
        }
      }),
    };
    const sessionRevocation = createSessionRevocation();
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore,
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({
          id: 1,
          subjectIdentifier,
          username: "zhangsan",
          name: "张三",
        })),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const useCase = createResignUserUseCase({
      clock,
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: createImmediateUnitOfWork(tx),
      userReader: createUserReader(),
    });

    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);
    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);

    expect(openEmployments).toEqual([
      {
        lifecycle: "enabled-open",
        status: EmploymentStatus.Disable,
        isPrimary: false,
        endTime: firstResignationTime,
      },
      {
        lifecycle: "paused-open",
        status: EmploymentStatus.Disable,
        isPrimary: false,
        endTime: firstResignationTime,
      },
    ]);
    expect(clock.nowDate).toHaveBeenCalledTimes(2);
    expect(sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(2);
  });

  test("records resignation changes and preserves transaction observability", async () => {
    const afterCommit = {
      bestEffort: mock(() => undefined),
      required: mock(() => undefined),
    };
    const tx = {
      afterCommit,
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { endOpenEmploymentsByUserId: mock(async () => undefined) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({
          id: 1,
          subjectIdentifier,
          username: "zhangsan",
          name: "张三",
        })),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    let transactionOptions: unknown;
    const uow: ResignUserUseCaseDeps["uow"] = {
      async transaction(callback, options) {
        transactionOptions = options;
        return await callback(tx);
      },
    };
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation: createSessionRevocation(),
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow,
      userReader: createUserReader(),
    });
    const auditContext = {
      actorType: "admin" as const,
      actorUserId: 1001,
      actorUsername: "admin",
      requestId: "req-1",
      traceId: "trace-1",
      route: "/admin/employments/zhangsan/resign",
      method: "POST",
    };

    await expect(useCase.execute(
      { username: "zhangsan" },
      { auditContext },
    )).resolves.toBe(true);

    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith({
      ...auditContext,
      action: "admin.employment.resign_user",
      details: { resigned: true, username: "zhangsan" },
      outcome: "success",
      targetCode: "zhangsan",
      targetId: 1,
      targetName: null,
      targetType: "user",
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "user", userId: 1 },
      { kind: "employment", userId: 1 },
    ]);
    expect(transactionOptions).toEqual({
      observability: { requestId: "req-1", traceId: "trace-1" },
    });
  });

  test("stops without side effects when the user does not exist", async () => {
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { endOpenEmploymentsByUserId: mock(async () => undefined) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => null),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const sessionRevocation = createSessionRevocation();
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: createImmediateUnitOfWork(tx),
      userReader: createUserReader(null),
    });

    await expect(useCase.execute({ username: "missing" }))
      .rejects
      .toEqual(new UserNotFoundError("用户不存在"));
    expect(tx.employmentStore.endOpenEmploymentsByUserId).not.toHaveBeenCalled();
    expect(tx.userStore.updateUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("propagates each transaction failure without running later side effects", async () => {
    const stages = ["employment:end", "user:disable", "audit", "profile:invalidate"] as const;

    for (const failingStage of stages) {
      const events: string[] = [];
      const error = new Error(`${failingStage} failed`);
      const runStage = async (stage: typeof failingStage) => {
        events.push(stage);
        if (stage === failingStage)
          throw error;
      };
      const tx = {
        auditLogWriter: { recordAuditLog: mock(async () => runStage("audit")) },
        subjectAccessMutation: createSubjectAccessMutation(),
        employmentStore: { endOpenEmploymentsByUserId: mock(async () => runStage("employment:end")) },
        responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
        userProfileInvalidation: { recordChanges: mock(async () => runStage("profile:invalidate")) },
        userStore: {
          getUserByUsernameForAdmin: mock(async () => {
            events.push("user:lookup");
            return { id: 1, subjectIdentifier, username: "zhangsan", name: "张三" };
          }),
          updateUserByUsername: mock(async () => runStage("user:disable")),
        },
      };
      const sessionRevocation = createSessionRevocation();
      const useCase = createResignUserUseCase({
        clock: createFakeClock(),
        sessionRevocation,
        subjectAccessLifecycle: createSubjectAccessLifecycle(),
        uow: createImmediateUnitOfWork(tx),
        userReader: createUserReader(),
      });

      await expect(useCase.execute({ username: "zhangsan" })).rejects.toBe(error);
      const failureIndex = stages.indexOf(failingStage);
      expect(events).toEqual(["user:lookup", ...stages.slice(0, failureIndex + 1)]);
      expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
    }
  });

  test("rolls back Employment End, User Disable, audit, and Dirty when the transaction fails", async () => {
    const failure = new Error("dirty write failed");
    const committed = {
      employmentStatus: EmploymentStatus.Enable as EmploymentStatus,
      employmentEndTime: null as Date | null,
      employmentIsPrimary: true,
      userStatus: UserStatus.Enable as UserStatus,
      auditActions: [] as string[],
      dirtyKinds: [] as string[],
    };
    const sessionRevocation = createSessionRevocation();
    const useCase = createResignUserUseCase({
      clock: createFakeClock(new Date("2026-08-11T10:30:00.000Z").getTime()),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(),
      uow: {
        async transaction(callback) {
          const staged = {
            ...committed,
            auditActions: [...committed.auditActions],
            dirtyKinds: [...committed.dirtyKinds],
          };
          const tx: ResignUserTransactionPorts = {
            subjectAccessMutation: createSubjectAccessMutation(),
            employmentStore: {
              async endOpenEmploymentsByUserId(_userId, endTime) {
                staged.employmentStatus = EmploymentStatus.Disable;
                staged.employmentEndTime = endTime;
                staged.employmentIsPrimary = false;
              },
            },
            responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
            userStore: {
              async getUserByUsernameForAdmin() {
                return { id: 1, subjectIdentifier, username: "zhangsan", name: "张三" };
              },
              async updateUserByUsername(_username, patch) {
                staged.userStatus = patch.status;
              },
            },
            auditLogWriter: {
              async recordAuditLog(input) {
                staged.auditActions.push(input.action);
              },
            },
            userProfileInvalidation: {
              async recordChanges(changes) {
                staged.dirtyKinds.push(...changes.map(change => change.kind));
                throw failure;
              },
            },
          };
          const result = await callback({
            ...tx,
            afterCommit: {
              bestEffort: mock(() => undefined),
              required: mock(() => undefined),
            },
          });
          Object.assign(committed, staged);
          return result;
        },
      },
      userReader: createUserReader(),
    });

    await expect(useCase.execute({ username: "zhangsan" })).rejects.toBe(failure);

    expect(committed).toEqual({
      employmentStatus: EmploymentStatus.Enable,
      employmentEndTime: null,
      employmentIsPrimary: true,
      userStatus: UserStatus.Enable,
      auditActions: [],
      dirtyKinds: [],
    });
    expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("does not start resignation when Subject Access pre-block fails", async () => {
    const preBlockError = new Error("subject access unavailable");
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      subjectAccessMutation: createSubjectAccessMutation(),
      employmentStore: { endOpenEmploymentsByUserId: mock(async () => undefined) },
      responsibilityParentLifecycle: createResponsibilityParentLifecycle(),
      userProfileInvalidation: { recordChanges: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({
          id: 1,
          subjectIdentifier,
          username: "zhangsan",
          name: "张三",
        })),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const sessionRevocation = createSessionRevocation();
    const useCase = createResignUserUseCase({
      clock: createFakeClock(),
      sessionRevocation,
      subjectAccessLifecycle: createSubjectAccessLifecycle(preBlockError),
      uow: createImmediateUnitOfWork(tx),
      userReader: createUserReader(),
    });

    await expect(useCase.execute({ username: "zhangsan" }))
      .rejects
      .toBe(preBlockError);
    expect(tx.employmentStore.endOpenEmploymentsByUserId).not.toHaveBeenCalled();
    expect(tx.userStore.updateUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });
});
