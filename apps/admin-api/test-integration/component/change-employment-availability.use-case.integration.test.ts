import type { Employment } from "@iam/domain/employment";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createChangeEmploymentAvailabilityUseCase } from "@admin-api/use-cases/employment/change-employment-availability/change-employment-availability.use-case";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
} from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
  EmploymentNotEditableError,
  EmploymentOrganizationScopeMismatchError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";
import { describe, expect, mock, test } from "bun:test";

const startTime = new Date("2025-01-01T00:00:00.000Z");
const now = new Date("2026-01-01T00:00:00.000Z");

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
    updateTime: now,
    ...overrides,
  };
}

function organization(overrides: Record<string, unknown> = {}) {
  return {
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
    createTime: startTime,
    updateTime: now,
    ...overrides,
  };
}

function position(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    posCode: "DEV",
    posName: "Developer",
    status: PositionStatus.Enable,
    description: null,
    isDelete: false,
    createTime: startTime,
    updateTime: now,
    ...overrides,
  };
}

function createLifecycle() {
  const currentEmployment = employment();
  const tx = {
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    responsibilityParentLifecycle: {
      lockAssignmentsForEmployment: mock(async () => []),
      pauseEnabledAssignmentsForEmployment: mock(async () => true),
    },
    sessionRevocation: { revokeAllForUser: mock(async () => undefined) },
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
    employmentStore: {
      lockEmploymentLifecycleContextById: mock(async () => ({
        employment: currentEmployment,
        organization: organization(),
        position: position(),
      })),
      getOpenEmploymentByUserOrgPosId: mock(async (): Promise<Employment | null> => null),
      updateEmploymentRecord: mock(async (_id: number, patch: Record<string, unknown>) => ({
        ...currentEmployment,
        ...patch,
      })),
    },
    organizationReader: {
      isOrganizationDescendantOf: mock(async () => true),
    },
  };

  return {
    tx,
    useCase: createChangeEmploymentAvailabilityUseCase({
      uow: createImmediateUnitOfWork(tx),
    }),
  };
}

describe("Employment Lifecycle Pause/Resume", () => {
  test("pauses an enabled employment without changing its period or Primary fact", async () => {
    const { tx, useCase } = createLifecycle();

    await expect(useCase.execute({
      command: "pause",
      employmentId: 4,
    })).resolves.toEqual({ changed: true, result: null });

    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Pause,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.pause",
      targetId: 4,
    }));
    expect(
      tx.responsibilityParentLifecycle.pauseEnabledAssignmentsForEmployment,
    ).toHaveBeenCalledWith({
      auditContext: undefined,
      selectedAssignments: [],
      employmentId: 4,
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
      { kind: "organization-responsibility-assignment", userId: 1 },
    ]);
    expect(tx.sessionRevocation.revokeAllForUser).not.toHaveBeenCalled();
  });

  test("treats an already paused employment as an idempotent success", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({ status: EmploymentStatus.Pause }),
      organization: organization(),
      position: position(),
    });

    await expect(useCase.execute({
      command: "pause",
      employmentId: 4,
    })).resolves.toEqual({ changed: false, result: null });

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(
      tx.responsibilityParentLifecycle.pauseEnabledAssignmentsForEmployment,
    ).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ changed: false }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("resumes a paused employment after revalidating parents, scope, and Open uniqueness", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({ status: EmploymentStatus.Pause }),
      organization: organization(),
      position: position(),
    });

    await expect(useCase.execute({
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "COMPANY",
    })).resolves.toEqual({ changed: true, result: null });

    expect(tx.organizationReader.isOrganizationDescendantOf).toHaveBeenCalledWith(
      "ORG",
      "COMPANY",
    );
    expect(tx.employmentStore.getOpenEmploymentByUserOrgPosId).toHaveBeenCalledWith(
      1,
      2,
      3,
      4,
    );
    expect(tx.employmentStore.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      status: EmploymentStatus.Enable,
    });
    expect(
      tx.responsibilityParentLifecycle.pauseEnabledAssignmentsForEmployment,
    ).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.resume",
      targetId: 4,
    }));
  });

  test("treats an already enabled employment as an idempotent Resume success", async () => {
    const { tx, useCase } = createLifecycle();

    await expect(useCase.execute({
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "COMPANY",
    })).resolves.toEqual({ changed: false, result: null });

    expect(tx.organizationReader.isOrganizationDescendantOf).not.toHaveBeenCalled();
    expect(tx.employmentStore.getOpenEmploymentByUserOrgPosId).not.toHaveBeenCalled();
    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ changed: false }),
    }));
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test.each([
    ["pause" as const, "暂停"],
    ["resume" as const, "恢复"],
  ])("rejects %s from an Ended employment with a stable business conflict", async (command) => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({
        status: EmploymentStatus.Disable,
        endTime: now,
      }),
      organization: organization(),
      position: position(),
    });

    await expect(useCase.execute(command === "pause"
      ? { command, employmentId: 4 }
      : { command, employmentId: 4, expectedAncestorOrgCode: "ORG" })).rejects.toBeInstanceOf(
      EmploymentNotEditableError,
    );

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rejects Resume when the assigned Organization is disabled", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({ status: EmploymentStatus.Pause }),
      organization: organization({ status: OrganizationStatus.Disable }),
      position: position(),
    });

    await expect(useCase.execute({
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "ORG",
    })).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects Resume when the Position is soft deleted", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({ status: EmploymentStatus.Pause }),
      organization: organization(),
      position: position({ isDelete: true }),
    });

    await expect(useCase.execute({
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "ORG",
    })).rejects.toBeInstanceOf(PositionNotFoundError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects Resume outside the administrator-provided Organization scope", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({ status: EmploymentStatus.Pause }),
      organization: organization(),
      position: position(),
    });
    tx.organizationReader.isOrganizationDescendantOf.mockResolvedValueOnce(false);

    await expect(useCase.execute({
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "OTHER",
    })).rejects.toBeInstanceOf(EmploymentOrganizationScopeMismatchError);

    expect(tx.employmentStore.getOpenEmploymentByUserOrgPosId).not.toHaveBeenCalled();
    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rejects Resume when another Open Employment has the same relationship", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentStore.lockEmploymentLifecycleContextById.mockResolvedValueOnce({
      employment: employment({ status: EmploymentStatus.Pause }),
      organization: organization(),
      position: position(),
    });
    tx.employmentStore.getOpenEmploymentByUserOrgPosId.mockResolvedValueOnce(
      employment({ id: 9, status: EmploymentStatus.Enable }),
    );

    await expect(useCase.execute({
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "ORG",
    })).rejects.toBeInstanceOf(EmploymentAlreadyExistsError);

    expect(tx.employmentStore.updateEmploymentRecord).not.toHaveBeenCalled();
  });

  test("rolls back status, audit, and Dirty when a Pause transaction fails", async () => {
    const { tx } = createLifecycle();
    const failure = new Error("audit write failed");
    const committed = {
      status: EmploymentStatus.Enable,
      auditActions: [] as string[],
      dirtyUserIds: [] as number[],
    };
    const attempted = { statusWrites: 0, auditWrites: 0 };
    const useCase = createChangeEmploymentAvailabilityUseCase({
      uow: {
        async transaction(callback) {
          const staged = {
            status: committed.status,
            auditActions: [...committed.auditActions],
            dirtyUserIds: [...committed.dirtyUserIds],
          };
          const transactionPorts = {
            ...tx,
            employmentStore: {
              ...tx.employmentStore,
              async updateEmploymentRecord(_id: number, patch: { status: EmploymentStatus }) {
                attempted.statusWrites += 1;
                staged.status = patch.status;
                return employment(patch);
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
          committed.status = staged.status;
          committed.auditActions = staged.auditActions;
          committed.dirtyUserIds = staged.dirtyUserIds;
          return result;
        },
      },
    });

    await expect(useCase.execute({
      command: "pause",
      employmentId: 4,
    })).rejects.toBe(failure);

    expect(attempted).toEqual({ statusWrites: 1, auditWrites: 1 });
    expect(committed).toEqual({
      status: EmploymentStatus.Enable,
      auditActions: [],
      dirtyUserIds: [],
    });
  });
});
