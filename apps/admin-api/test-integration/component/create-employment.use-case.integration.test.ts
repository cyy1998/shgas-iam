import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminEmploymentRecordCreate } from "@admin-api/services/employment/employment.type";
import type { Employment } from "@iam/domain/employment";
import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createCreateEmploymentUseCase } from "@admin-api/use-cases/employment/create-employment/create-employment.use-case";
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
  EmploymentOrganizationScopeMismatchError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { UserNotFoundError } from "@iam/domain/user";
import { describe, expect, mock, test } from "bun:test";

const now = new Date("2026-01-01T00:00:00.000Z");

function createLifecycle() {
  const clock = createFakeClock(now.getTime());
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
    createTime: now,
    updateTime: now,
  };
  const organization = {
    id: 2,
    orgCode: "ORG",
    orgName: "Organization",
    parentId: -1,
    businessParentId: -1,
    path: "/ORG",
    level: OrganizationLevel.Two,
    orgType: OrganizationType.Department,
    orderNum: 0,
    isVirtual: false,
    isEntity: true,
    status: OrganizationStatus.Enable,
    isDelete: false,
    createTime: now,
    updateTime: now,
  };
  const position = {
    id: 3,
    posCode: "DEV",
    posName: "Developer",
    status: PositionStatus.Enable,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
  };
  const tx = {
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
    employmentStore: {
      createEmploymentRecord: mock(async (input: AdminEmploymentRecordCreate) => ({
        id: 10,
        ...input,
        createTime: now,
        updateTime: now,
        isDelete: false,
      })),
      getOpenEmploymentByUserOrgPosId: mock(async () => null),
      getOpenPrimaryEmploymentIdsByUserId: mock(async (): Promise<number[]> => []),
      lockEmploymentsByIds: mock(async (): Promise<Employment[]> => []),
      updateEmploymentRecord: mock(async (): Promise<Employment> => { throw new Error("unexpected primary update"); }),
    },
    organizationReader: {
      getOrganizationByCode: mock(async () => organization),
      isOrganizationDescendantOf: mock(async () => true),
    },
    positionReader: { getPositionByCode: mock(async () => position) },
    userReader: { getUserByUsernameForAdmin: mock(async () => user) },
  };

  return {
    clock,
    useCase: createCreateEmploymentUseCase({
      clock,
      uow: createImmediateUnitOfWork(tx),
    }),
    tx,
  };
}

describe("Employment Lifecycle", () => {
  test("creates an immediately effective employment from one authoritative transaction time", async () => {
    const { clock, useCase, tx } = createLifecycle();

    await expect(useCase.execute({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
      isPrimary: true,
      description: "new employment",
    })).resolves.toEqual({ changed: true, result: { id: 10 } });

    expect(clock.nowDate).toHaveBeenCalledTimes(1);
    expect(tx.employmentStore.createEmploymentRecord).toHaveBeenCalledWith({
      userId: 1,
      orgId: 2,
      posId: 3,
      isPrimary: true,
      startTime: now,
      endTime: null,
      description: "new employment",
      status: EmploymentStatus.Enable,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.create",
      targetId: 10,
      details: expect.objectContaining({ startTime: now }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("defaults Primary to false without inferring or replacing another Primary", async () => {
    const { useCase, tx } = createLifecycle();

    await useCase.execute({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
    });

    expect(tx.employmentStore.getOpenPrimaryEmploymentIdsByUserId).not.toHaveBeenCalled();
    expect(tx.employmentStore.createEmploymentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: false }),
    );
  });

  test("rejects a missing or deleted user before creating an employment", async () => {
    const { useCase, tx } = createLifecycle();
    (tx.userReader.getUserByUsernameForAdmin as any).mockResolvedValueOnce(null);

    await expect(useCase.execute({
      username: "missing",
      orgCode: "ORG",
      posCode: "DEV",
    })).rejects.toBeInstanceOf(UserNotFoundError);

    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a disabled organization", async () => {
    const { useCase, tx } = createLifecycle();
    (tx.organizationReader.getOrganizationByCode as any).mockResolvedValueOnce({
      ...(await tx.organizationReader.getOrganizationByCode())!,
      status: OrganizationStatus.Disable,
    });

    await expect(useCase.execute({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
    })).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a disabled position", async () => {
    const { useCase, tx } = createLifecycle();
    (tx.positionReader.getPositionByCode as any).mockResolvedValueOnce({
      ...(await tx.positionReader.getPositionByCode())!,
      status: PositionStatus.Disable,
    });

    await expect(useCase.execute({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
    })).rejects.toBeInstanceOf(PositionNotFoundError);

    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects an organization outside the administrator-provided scope", async () => {
    const { useCase, tx } = createLifecycle();
    tx.organizationReader.isOrganizationDescendantOf.mockResolvedValueOnce(false);

    await expect(useCase.execute({
      username: "zhangsan",
      orgCode: "ORG",
      expectedAncestorOrgCode: "COMPANY",
      posCode: "DEV",
    })).rejects.toBeInstanceOf(EmploymentOrganizationScopeMismatchError);

    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects an HR destination outside server-resolved scope even when the caller ancestor matches", async () => {
    const { useCase, tx } = createLifecycle();
    const authorization: AdminEmploymentAuthorization = {
      kind: "scoped",
      rootOrganizationIds: [99],
      organizationIds: [99],
      getAllowedActions: mock() as never,
      denyMutation: mock((input) => {
        throw new Error(`denied:${input.reason}`);
      }) as never,
    };

    let failure: unknown;
    try {
      await useCase.execute({
        username: "zhangsan",
        orgCode: "ORG",
        expectedAncestorOrgCode: "COMPANY",
        posCode: "DEV",
      }, { authorization });
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(authorization.denyMutation).toHaveBeenCalledWith({
      operationId: "admin.employment.create",
      resourceIdentifier: "ORG",
      reason: "RESOURCE_OUT_OF_SCOPE",
      concealExistence: true,
    });
    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects a duplicate Open Employment returned by the lifecycle store", async () => {
    const { useCase, tx } = createLifecycle();
    tx.employmentStore.getOpenEmploymentByUserOrgPosId.mockResolvedValueOnce({
      id: 9,
      status: EmploymentStatus.Pause,
    } as any);

    await expect(useCase.execute({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
    })).rejects.toBeInstanceOf(EmploymentAlreadyExistsError);

    expect(tx.employmentStore.createEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rolls back Employment, audit, and Dirty when the atomic transaction fails", async () => {
    const { clock, tx } = createLifecycle();
    const failure = new Error("audit write failed");
    const committed = {
      employmentIds: [] as number[],
      auditActions: [] as string[],
      dirtyUserIds: [] as number[],
    };
    const attempted = { employmentWrites: 0, auditWrites: 0 };
    const useCase = createCreateEmploymentUseCase({
      clock,
      uow: {
        async transaction(callback) {
          const staged = {
            employmentIds: [...committed.employmentIds],
            auditActions: [...committed.auditActions],
            dirtyUserIds: [...committed.dirtyUserIds],
          };
          const transactionPorts = {
            ...tx,
            employmentStore: {
              ...tx.employmentStore,
              async createEmploymentRecord(input: AdminEmploymentRecordCreate) {
                attempted.employmentWrites += 1;
                staged.employmentIds.push(10);
                return {
                  id: 10,
                  ...input,
                  createTime: now,
                  updateTime: now,
                  isDelete: false,
                };
              },
            },
            auditLogWriter: {
              async recordAuditLog(input: { action: string }) {
                attempted.auditWrites += 1;
                staged.auditActions.push(input.action);
                throw failure;
              },
            },
            userProfileInvalidation: {
              async recordChanges(changes: readonly { userId: number }[]) {
                staged.dirtyUserIds.push(...changes.map(change => change.userId));
              },
            },
          };
          const result = await callback(transactionPorts as any);
          committed.employmentIds = staged.employmentIds;
          committed.auditActions = staged.auditActions;
          committed.dirtyUserIds = staged.dirtyUserIds;
          return result;
        },
      },
    });

    await expect(useCase.execute({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
    })).rejects.toBe(failure);

    expect(attempted).toEqual({ employmentWrites: 1, auditWrites: 1 });
    expect(committed).toEqual({
      employmentIds: [],
      auditActions: [],
      dirtyUserIds: [],
    });
  });
  test("creation audits only the selected Primary facts actually cleared", async () => {
    const { useCase, tx } = createLifecycle();
    const primary: Employment = {
      id: 7,
      userId: 1,
      posId: 5,
      orgId: 2,
      isPrimary: true,
      status: EmploymentStatus.Pause,
      startTime: now,
      endTime: null,
      description: null,
      isDelete: false,
      createTime: now,
      updateTime: now,
    };
    tx.employmentStore.getOpenPrimaryEmploymentIdsByUserId.mockResolvedValueOnce([7, 8]);
    tx.employmentStore.lockEmploymentsByIds.mockResolvedValueOnce([
      primary,
      { ...primary, id: 8, status: EmploymentStatus.Disable, endTime: now },
    ]);
    tx.employmentStore.updateEmploymentRecord.mockResolvedValueOnce({ ...primary, isPrimary: false });
    const result = await useCase.execute({ username: "zhangsan", orgCode: "ORG", posCode: "DEV", isPrimary: true });
    expect(result).toEqual({ changed: true, result: { id: 10 } });
    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledTimes(1);
    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(7, { isPrimary: false });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ changed: true, clearedPrimaryEmploymentIds: [7] }),
    }));
  });
});
