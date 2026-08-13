import type { AdminEmploymentRecordCreate } from "@admin-api/services/employment/employment.type";
import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createTransferEmploymentUseCase } from "@admin-api/use-cases/employment/transfer-employment/transfer-employment.use-case";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
  EmploymentNotEditableError,
  EmploymentNotFoundError,
  EmploymentOrganizationScopeMismatchError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { UserNotFoundError } from "@iam/domain/user";
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
  const source = employment();
  const user = {
    id: 1,
    subjectIdentifier: "00000000-0000-4000-8000-000000000001",
    username: "zhangsan",
    wxId: null,
    name: "张三",
    password: null,
    mobile: "13800000000",
    userType: UserType.Formal,
    orderNum: 0,
    status: UserStatus.Enable,
    isDelete: false,
    createTime: startTime,
    updateTime: transactionTime,
  };
  const organization = {
    id: 20,
    orgCode: "TARGET_ORG",
    orgName: "Target Organization",
    parentId: -1,
    businessParentId: -1,
    path: "/TARGET_ORG",
    level: OrganizationLevel.Two,
    orgType: OrganizationType.Department,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: startTime,
    updateTime: transactionTime,
  };
  const position = {
    id: 30,
    posCode: "TARGET_POS",
    posName: "Target Position",
    status: PositionStatus.Enable,
    description: null,
    isDelete: false,
    createTime: startTime,
    updateTime: transactionTime,
  };
  const sourceOrganization = {
    ...organization,
    id: 2,
    orgCode: "SOURCE_ORG",
    orgName: "Source Organization",
  };
  const sourcePosition = {
    ...position,
    id: 3,
    posCode: "SOURCE_POS",
    posName: "Source Position",
  };
  const tx = {
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    sessionRevocation: { revokeAllForUser: mock(async () => undefined) },
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
    employmentStore: {
      createEmploymentRecord: mock(async (input: AdminEmploymentRecordCreate) => ({
        id: 10,
        ...input,
        createTime: transactionTime,
        updateTime: transactionTime,
        isDelete: false,
      })),
      getEmploymentLifecycleContextById: mock(async () => ({
        employment: source,
        organization: sourceOrganization,
        position: sourcePosition,
      })),
      getOpenEmploymentByUserOrgPosId: mock(async () => null),
      unsetOpenPrimariesByUserId: mock(async () => undefined),
      updateEmploymentRecord: mock(async (_id: number, patch: Record<string, unknown>) => ({
        ...source,
        ...patch,
      })),
    },
    organizationReader: {
      getOrganizationByCode: mock(async () => organization),
      isOrganizationDescendantOf: mock(async () => true),
    },
    positionReader: { getPositionByCode: mock(async () => position) },
    userReader: { getUserByIdForAdmin: mock(async () => user) },
  };
  const clock = createFakeClock(transactionTime.getTime());

  return {
    clock,
    tx,
    useCase: createTransferEmploymentUseCase({
      clock,
      uow: createImmediateUnitOfWork(tx),
    }),
  };
}

describe("Employment Lifecycle Transfer", () => {
  test("ends the source and creates an enabled non-primary Employment at one transaction time", async () => {
    const { clock, tx, useCase } = createLifecycle();

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
      description: "transferred",
    })).resolves.toEqual({ newEmploymentId: 10 });

    expect(clock.nowDate).toHaveBeenCalledTimes(1);
    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Disable,
      endTime: transactionTime,
      isPrimary: false,
    });
    expect(tx.employmentStore.createEmploymentRecord).toHaveBeenCalledWith({
      userId: 1,
      orgId: 20,
      posId: 30,
      isPrimary: false,
      startTime: transactionTime,
      endTime: null,
      description: "transferred",
      status: EmploymentStatus.Enable,
    });
    expect(tx.employmentStore.unsetOpenPrimariesByUserId).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.transfer",
      targetId: 4,
      details: expect.objectContaining({
        newEmploymentId: 10,
        endTime: transactionTime,
        startTime: transactionTime,
        newIsPrimary: false,
        username: "zhangsan",
        orgCode: "SOURCE_ORG",
        posCode: "SOURCE_POS",
      }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
    expect(tx.sessionRevocation.revokeAllForUser).not.toHaveBeenCalled();
  });

  test("transfers a paused source into an enabled Primary without inheriting its lifecycle state", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.getEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({
        status: EmploymentStatus.Pause,
        isPrimary: false,
      }),
      organization: await tx.organizationReader.getOrganizationByCode(),
      position: await tx.positionReader.getPositionByCode(),
    });

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: true,
    })).resolves.toEqual({ newEmploymentId: 10 });

    expect(tx.employmentStore.unsetOpenPrimariesByUserId).toHaveBeenCalledWith(1);
    expect(tx.employmentStore.createEmploymentRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        isPrimary: true,
        status: EmploymentStatus.Enable,
        endTime: null,
      }),
    );
  });

  test("rejects an Ended Employment before writing either side of the transfer", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.getEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({
        status: EmploymentStatus.Disable,
        endTime: transactionTime,
        isPrimary: false,
      }),
      organization: await tx.organizationReader.getOrganizationByCode(),
      position: await tx.positionReader.getPositionByCode(),
    });

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(EmploymentNotEditableError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a disabled target Organization before ending the source", async () => {
    const { tx, useCase } = createLifecycle();
    const target = await tx.organizationReader.getOrganizationByCode();
    tx.organizationReader.getOrganizationByCode.mockResolvedValueOnce({
      ...target!,
      status: OrganizationStatus.Disable,
    });

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a soft-deleted target Organization before ending the source", async () => {
    const { tx, useCase } = createLifecycle();
    const target = await tx.organizationReader.getOrganizationByCode();
    tx.organizationReader.getOrganizationByCode.mockResolvedValueOnce({
      ...target!,
      isDelete: true,
    });

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a disabled target Position before ending the source", async () => {
    const { tx, useCase } = createLifecycle();
    const target = await tx.positionReader.getPositionByCode();
    tx.positionReader.getPositionByCode.mockResolvedValueOnce({
      ...target!,
      status: PositionStatus.Disable,
    });

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(PositionNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a soft-deleted target Position before ending the source", async () => {
    const { tx, useCase } = createLifecycle();
    const target = await tx.positionReader.getPositionByCode();
    tx.positionReader.getPositionByCode.mockResolvedValueOnce({
      ...target!,
      isDelete: true,
    });

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(PositionNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a missing source User reference before ending the source", async () => {
    const { tx, useCase } = createLifecycle();
    (tx.userReader.getUserByIdForAdmin as any).mockResolvedValueOnce(null);

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(UserNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a target Organization outside the administrator-provided scope", async () => {
    const { tx, useCase } = createLifecycle();
    tx.organizationReader.isOrganizationDescendantOf.mockResolvedValueOnce(false);

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      expectedAncestorOrgCode: "COMPANY",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(EmploymentOrganizationScopeMismatchError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a duplicate Open target combination before ending the source", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.getOpenEmploymentByUserOrgPosId.mockResolvedValueOnce(
      employment({
        id: 9,
        orgId: 20,
        posId: 30,
        status: EmploymentStatus.Pause,
      }) as any,
    );

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(EmploymentAlreadyExistsError);

    expect(tx.employmentStore.getOpenEmploymentByUserOrgPosId).toHaveBeenCalledWith(
      1,
      20,
      30,
      4,
    );
    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a Legacy Employment Tombstone without rewriting it", async () => {
    const { tx, useCase } = createLifecycle();
    (tx.employmentStore.getEmploymentLifecycleContextById as any).mockResolvedValueOnce(null);

    await expect(useCase.execute({
      employmentId: 404,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBeInstanceOf(EmploymentNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rolls back both Employments, audit, and Dirty when the transaction fails", async () => {
    const { clock, tx } = createLifecycle();
    const failure = new Error("dirty write failed");
    const committed = {
      sourceStatus: EmploymentStatus.Enable,
      sourceEndTime: null as Date | null,
      sourceIsPrimary: true,
      newEmploymentIds: [] as number[],
      auditActions: [] as string[],
      dirtyUserIds: [] as number[],
    };
    const attempted = { sourceWrites: 0, targetWrites: 0, auditWrites: 0 };
    const useCase = createTransferEmploymentUseCase({
      clock,
      uow: {
        async transaction(callback) {
          const staged = {
            ...committed,
            newEmploymentIds: [...committed.newEmploymentIds],
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
                attempted.sourceWrites += 1;
                staged.sourceStatus = patch.status;
                staged.sourceEndTime = patch.endTime;
                staged.sourceIsPrimary = patch.isPrimary;
              },
              async createEmploymentRecord(input: AdminEmploymentRecordCreate) {
                attempted.targetWrites += 1;
                staged.newEmploymentIds.push(10);
                return {
                  id: 10,
                  ...input,
                  createTime: transactionTime,
                  updateTime: transactionTime,
                  isDelete: false,
                };
              },
            },
            auditLogWriter: {
              async recordAuditLog(input: { action: string }) {
                attempted.auditWrites += 1;
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
          Object.assign(committed, staged);
          return result;
        },
      },
    });

    await expect(useCase.execute({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      newPosCode: "TARGET_POS",
      isPrimary: false,
    })).rejects.toBe(failure);

    expect(attempted).toEqual({ sourceWrites: 1, targetWrites: 1, auditWrites: 1 });
    expect(committed).toEqual({
      sourceStatus: EmploymentStatus.Enable,
      sourceEndTime: null,
      sourceIsPrimary: true,
      newEmploymentIds: [],
      auditActions: [],
      dirtyUserIds: [],
    });
  });
});
