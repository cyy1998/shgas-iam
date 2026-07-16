import type { ResignUserUseCaseDeps } from "../resign-user.port";
import { createImmediateUnitOfWork } from "@admin-api/testing/fakes";
import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";
import { createResignUserUseCase } from "../resign-user.use-case";

function createSessionRevocation() {
  return { revokeUserSessions: mock(async () => undefined) };
}

describe("createResignUserUseCase", () => {
  test("ends active employments before disabling an existing user", async () => {
    const events: string[] = [];
    const tx = {
      auditLogWriter: {
        recordAuditLog: mock(async () => {
          events.push("audit");
        }),
      },
      employmentStore: {
        endActiveEmploymentsByUserId: mock(async () => {
          events.push("employment:end");
        }),
      },
      profileDirtyMarker: {
        markUsersDirty: mock(async () => {
          events.push("profile:dirty");
          return { marked: 1, userIds: [1] };
        }),
      },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => {
          events.push("user:lookup");
          return { id: 1, username: "zhangsan", name: "张三" };
        }),
        updateUserByUsername: mock(async () => {
          events.push("user:disable");
        }),
      },
    };
    const useCase = createResignUserUseCase({
      sessionRevocation: createSessionRevocation(),
      uow: createImmediateUnitOfWork(tx),
    });

    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);

    expect(tx.userStore.updateUserByUsername).toHaveBeenCalledWith("zhangsan", {
      status: UserStatus.Disable,
    });
    expect(events).toEqual([
      "user:lookup",
      "employment:end",
      "user:disable",
      "audit",
      "profile:dirty",
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
      employmentStore: {
        endActiveEmploymentsByUserId: mock(async () => {
          events.push("employment:end");
        }),
      },
      profileDirtyMarker: {
        markUsersDirty: mock(async () => {
          events.push("profile:dirty");
        }),
      },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({ id: 1, username: "zhangsan", name: "张三" })),
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
      sessionRevocation,
      uow,
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
      userId: 1,
    });
    expect(events).toEqual([
      "employment:end",
      "user:disable",
      "audit",
      "profile:dirty",
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
      employmentStore: { endActiveEmploymentsByUserId: mock(async () => undefined) },
      profileDirtyMarker: { markUsersDirty: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({ id: 1, username: "zhangsan", name: "张三" })),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const useCase = createResignUserUseCase({
      sessionRevocation,
      uow: createImmediateUnitOfWork(tx),
    });

    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);
    expect(sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(1);
  });

  test("retries session revocation when resignation is repeated", async () => {
    const sessionRevocation = createSessionRevocation();
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      employmentStore: { endActiveEmploymentsByUserId: mock(async () => undefined) },
      profileDirtyMarker: { markUsersDirty: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({ id: 1, username: "zhangsan", name: "张三" })),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const useCase = createResignUserUseCase({
      sessionRevocation,
      uow: createImmediateUnitOfWork(tx),
    });

    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);
    await expect(useCase.execute({ username: "zhangsan" })).resolves.toBe(true);

    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledTimes(2);
    expect(sessionRevocation.revokeUserSessions).toHaveBeenCalledTimes(2);
  });

  test("preserves resignation audit, dirty context, and transaction observability", async () => {
    const afterCommit = {
      bestEffort: mock(() => undefined),
      required: mock(() => undefined),
    };
    const tx = {
      afterCommit,
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      employmentStore: { endActiveEmploymentsByUserId: mock(async () => undefined) },
      profileDirtyMarker: { markUsersDirty: mock(async () => ({ marked: 1, userIds: [1] })) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => ({ id: 1, username: "zhangsan", name: "张三" })),
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
    const useCase = createResignUserUseCase({ sessionRevocation: createSessionRevocation(), uow });
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
    expect(tx.profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      afterCommit,
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated, UserProfileDirtyReason.UserUpdated],
      requestId: "req-1",
      traceId: "trace-1",
      userIds: [1],
    });
    expect(transactionOptions).toEqual({
      observability: { requestId: "req-1", traceId: "trace-1" },
    });
  });

  test("stops without side effects when the user does not exist", async () => {
    const tx = {
      auditLogWriter: { recordAuditLog: mock(async () => undefined) },
      employmentStore: { endActiveEmploymentsByUserId: mock(async () => undefined) },
      profileDirtyMarker: { markUsersDirty: mock(async () => undefined) },
      userStore: {
        getUserByUsernameForAdmin: mock(async () => null),
        updateUserByUsername: mock(async () => undefined),
      },
    };
    const sessionRevocation = createSessionRevocation();
    const useCase = createResignUserUseCase({
      sessionRevocation,
      uow: createImmediateUnitOfWork(tx),
    });

    await expect(useCase.execute({ username: "missing" }))
      .rejects
      .toEqual(new UserNotFoundError("用户不存在"));
    expect(tx.employmentStore.endActiveEmploymentsByUserId).not.toHaveBeenCalled();
    expect(tx.userStore.updateUserByUsername).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.profileDirtyMarker.markUsersDirty).not.toHaveBeenCalled();
    expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
  });

  test("propagates each transaction failure without running later side effects", async () => {
    const stages = ["employment:end", "user:disable", "audit", "profile:dirty"] as const;

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
        employmentStore: { endActiveEmploymentsByUserId: mock(async () => runStage("employment:end")) },
        profileDirtyMarker: { markUsersDirty: mock(async () => runStage("profile:dirty")) },
        userStore: {
          getUserByUsernameForAdmin: mock(async () => {
            events.push("user:lookup");
            return { id: 1, username: "zhangsan", name: "张三" };
          }),
          updateUserByUsername: mock(async () => runStage("user:disable")),
        },
      };
      const sessionRevocation = createSessionRevocation();
      const useCase = createResignUserUseCase({
        sessionRevocation,
        uow: createImmediateUnitOfWork(tx),
      });

      await expect(useCase.execute({ username: "zhangsan" })).rejects.toBe(error);
      const failureIndex = stages.indexOf(failingStage);
      expect(events).toEqual(["user:lookup", ...stages.slice(0, failureIndex + 1)]);
      expect(sessionRevocation.revokeUserSessions).not.toHaveBeenCalled();
    }
  });
});
