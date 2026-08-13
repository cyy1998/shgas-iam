import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createEndEmploymentUseCase } from "@admin-api/use-cases/employment/end-employment/end-employment.use-case";
import { EmploymentStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const startTime = new Date("2025-01-01T00:00:00.000Z");
const transactionTime = new Date("2026-01-01T00:00:00.000Z");

function employment(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    userId: 1,
    posId: 3,
    orgId: 2,
    isPrimary: true,
    status: EmploymentStatus.Enable,
    startTime,
    endTime: null,
    description: null,
    isDelete: false,
    createTime: startTime,
    updateTime: transactionTime,
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
      updateEmploymentRecord: mock(async (_id: number, patch: Record<string, unknown>) => ({
        ...currentEmployment,
        ...patch,
      })),
    },
  };

  return {
    tx,
    useCase: createEndEmploymentUseCase({
      clock: createFakeClock(transactionTime.getTime()),
      uow: createImmediateUnitOfWork(tx),
    }),
  };
}

describe("Employment Lifecycle End", () => {
  test("ends an enabled Employment at one transaction time and clears Primary", async () => {
    const { tx, useCase } = createLifecycle();

    await expect(useCase.execute({ employmentId: 4 })).resolves.toBe(true);

    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Disable,
      endTime: transactionTime,
      isPrimary: false,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.end",
      targetId: 4,
      details: expect.objectContaining({
        endTime: transactionTime,
        fromStatus: EmploymentStatus.Enable,
        toStatus: EmploymentStatus.Disable,
      }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
    expect(tx.sessionRevocation.revokeAllForUser).not.toHaveBeenCalled();
  });

  test("ends a paused Employment without rewriting its start time", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.getEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({ status: EmploymentStatus.Pause }),
    });

    await expect(useCase.execute({ employmentId: 4 })).resolves.toBe(true);

    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Disable,
      endTime: transactionTime,
      isPrimary: false,
    });
  });

  test("treats an already ended Employment as an idempotent success", async () => {
    const { tx, useCase } = createLifecycle();
    const originalEndTime = new Date("2025-12-01T00:00:00.000Z");
    tx.employmentStore.getEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({
        status: EmploymentStatus.Disable,
        endTime: originalEndTime,
        isPrimary: false,
      }),
    });

    await expect(useCase.execute({ employmentId: 4 })).resolves.toBe(true);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rolls back End, audit, and Dirty when the transaction fails", async () => {
    const { tx } = createLifecycle();
    const failure = new Error("dirty write failed");
    const committed = {
      status: EmploymentStatus.Enable,
      endTime: null as Date | null,
      isPrimary: true,
      auditActions: [] as string[],
      dirtyUserIds: [] as number[],
    };
    const useCase = createEndEmploymentUseCase({
      clock: createFakeClock(transactionTime.getTime()),
      uow: {
        async transaction(callback) {
          const staged = {
            ...committed,
            auditActions: [...committed.auditActions],
            dirtyUserIds: [...committed.dirtyUserIds],
          };
          const transactionPorts = {
            ...tx,
            employmentStore: {
              ...tx.employmentStore,
              async updateEmploymentRecord(
                _id: number,
                patch: {
                  status: EmploymentStatus.Disable;
                  endTime: Date;
                  isPrimary: false;
                },
              ) {
                staged.status = patch.status;
                staged.endTime = patch.endTime;
                staged.isPrimary = patch.isPrimary;
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
          committed.status = staged.status;
          committed.endTime = staged.endTime;
          committed.isPrimary = staged.isPrimary;
          committed.auditActions = staged.auditActions;
          committed.dirtyUserIds = staged.dirtyUserIds;
          return result;
        },
      },
    });

    await expect(useCase.execute({ employmentId: 4 })).rejects.toBe(failure);

    expect(committed).toEqual({
      status: EmploymentStatus.Enable,
      endTime: null,
      isPrimary: true,
      auditActions: [],
      dirtyUserIds: [],
    });
  });
});
