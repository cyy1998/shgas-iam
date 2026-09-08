import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createManagePrimaryEmploymentUseCase } from "@admin-api/use-cases/employment/manage-primary-employment/manage-primary-employment.use-case";
import { EmploymentStatus } from "@iam/contracts";
import {
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";

const now = new Date("2026-01-01T00:00:00.000Z");

function employment(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    userId: 1,
    posId: 3,
    orgId: 2,
    isPrimary: false,
    status: EmploymentStatus.Enable,
    startTime: now,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    ...overrides,
  };
}

function createLifecycle() {
  const currentEmployment = employment();
  const tx = {
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    sessionRevocation: { revokeAllForUser: mock(async () => undefined) },
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
    employmentStore: {
      getEmploymentLifecycleContextById: mock(async () => ({ employment: currentEmployment })),
      getOpenPrimaryEmploymentIdsByUserId: mock(async () => [9]),
      lockEmploymentsByIds: mock(async () => [currentEmployment, employment({ id: 9, isPrimary: true })]),
      updateEmploymentRecord: mock(async (id: number, patch: { isPrimary: boolean }) => ({
        ...currentEmployment,
        id,
        ...patch,
      })),
    },
  };

  return {
    tx,
    useCase: createManagePrimaryEmploymentUseCase({
      uow: createImmediateUnitOfWork(tx),
    }),
  };
}

describe("Employment Lifecycle Primary", () => {
  test("sets an enabled Employment as the only Open Primary", async () => {
    const { tx, useCase } = createLifecycle();

    await expect(useCase.execute({
      command: "set",
      employmentId: 4,
    })).resolves.toEqual({ changed: true, result: null });

    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(9, { isPrimary: false });
    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      isPrimary: true,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.set_primary",
      targetId: 4,
      details: expect.objectContaining({ changed: true, primary: true }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
    expect(tx.sessionRevocation.revokeAllForUser).not.toHaveBeenCalled();
  });

  test("allows a paused Employment to become Primary", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentsByIds.mockResolvedValueOnce([employment({ status: EmploymentStatus.Pause })]);

    await expect(useCase.execute({
      command: "set",
      employmentId: 4,
    })).resolves.toEqual({ changed: true, result: null });

    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      isPrimary: true,
    });
  });

  test("clears the current Primary and permits zero Open Primary Employments", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentsByIds.mockResolvedValueOnce([employment({ isPrimary: true })]);

    await expect(useCase.execute({
      command: "clear",
      employmentId: 4,
    })).resolves.toEqual({ changed: true, result: null });

    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      isPrimary: false,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.clear_primary",
      details: expect.objectContaining({ changed: true, primary: false }),
    }));
  });

  test.each([
    ["set" as const, true],
    ["clear" as const, false],
  ])("treats an already satisfied %s command as an idempotent success", async (command, isPrimary) => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentsByIds.mockResolvedValueOnce([employment({ isPrimary })]);

    await expect(useCase.execute({ command, employmentId: 4 })).resolves.toEqual({ changed: false, result: null });

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ changed: false }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test.each(["set" as const, "clear" as const])(
    "rejects %s for an Ended Employment",
    async (command) => {
      const { tx, useCase } = createLifecycle();
      tx.employmentStore.lockEmploymentsByIds.mockResolvedValueOnce([employment({
        status: EmploymentStatus.Disable,
        endTime: now,
      })]);

      await expect(useCase.execute({ command, employmentId: 4 })).rejects.toBeInstanceOf(
        EmploymentNotEditableError,
      );

      expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
      expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
      expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    },
  );

  test("rejects a Legacy Employment Tombstone without rewriting its Primary field", async () => {
    const { tx, useCase } = createLifecycle();
    (tx.employmentStore.getEmploymentLifecycleContextById as any).mockResolvedValueOnce(null);

    await expect(useCase.execute({
      command: "set",
      employmentId: 4,
    })).rejects.toBeInstanceOf(EmploymentNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("leaves a selected Primary candidate unchanged when it ended before protection", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentsByIds.mockResolvedValueOnce([
      employment(),
      employment({ id: 9, isPrimary: true, status: EmploymentStatus.Disable, endTime: now }),
    ]);

    const result = await useCase.execute({ command: "set", employmentId: 4 });

    expect(result).toEqual({ changed: true, result: null });
    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledTimes(1);
  });

  test("rejects a target that disappeared after selection", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentsByIds.mockResolvedValueOnce([]);
    let failure: unknown;
    try {
      await useCase.execute({ command: "set", employmentId: 4 });
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(EmploymentNotFoundError);
    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test.each([4, 9])("rejects a zero-row update for protected Employment %s without success effects", async (id) => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.updateEmploymentRecord.mockImplementation(async (targetId, patch) => {
      if (targetId === id)
        return undefined as any;
      return employment({ id: targetId, ...patch });
    });
    let failure: unknown;
    try {
      await useCase.execute({ command: "set", employmentId: 4 });
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rolls back Primary replacement, audit, and Dirty when the transaction fails", async () => {
    const { tx } = createLifecycle();
    const failure = new Error("dirty write failed");
    const committed = {
      primaries: [9],
      auditActions: [] as string[],
      dirtyUserIds: [] as number[],
    };
    const useCase = createManagePrimaryEmploymentUseCase({
      uow: {
        async transaction(callback) {
          const staged = {
            primaries: [...committed.primaries],
            auditActions: [...committed.auditActions],
            dirtyUserIds: [...committed.dirtyUserIds],
          };
          const transactionPorts = {
            ...tx,
            employmentStore: {
              ...tx.employmentStore,
              async updateEmploymentRecord(id: number, patch: { isPrimary: boolean }) {
                if (patch.isPrimary)
                  staged.primaries.push(id);
                else
                  staged.primaries = staged.primaries.filter(primaryId => primaryId !== id);
                return employment({ id, ...patch });
              },
            },
            auditLogWriter: {
              async recordAuditLog(input: { action: string }) {
                staged.auditActions.push(input.action);
              },
            },
            userProfileInvalidation: {
              async recordChanges(changes: readonly { userId: number }[]) {
                staged.dirtyUserIds.push(...changes.map(change => change.userId));
                throw failure;
              },
            },
          };
          const result = await callback(transactionPorts as any);
          committed.primaries = staged.primaries;
          committed.auditActions = staged.auditActions;
          committed.dirtyUserIds = staged.dirtyUserIds;
          return result;
        },
      },
    });

    await expect(useCase.execute({
      command: "set",
      employmentId: 4,
    })).rejects.toBe(failure);

    expect(committed).toEqual({
      primaries: [9],
      auditActions: [],
      dirtyUserIds: [],
    });
  });
});
