import type { AdminOrganizationResponsibilityAuthorization } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { OrganizationResponsibilityAssignmentRecordCreate } from "@iam/domain/organization-responsibility";
import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { createCreateOrganizationResponsibilityAssignmentUseCase } from "@admin-api/use-cases/organization-responsibility/create-assignment/create-assignment.use-case";
import {
  EmploymentStatus,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from "@iam/contracts";
import {
  EmploymentNotFoundError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import {
  OrganizationResponsibilityAssignmentCardinalityConflictError,
  OrganizationResponsibilityAssignmentDuplicateOpenError,
  OrganizationResponsibilityAssignmentUnmanageableConflictError,
  OrganizationResponsibilityHolderEmploymentUnavailableError,
  OrganizationResponsibilityTargetOrganizationUnavailableError,
} from "@iam/domain/organization-responsibility";
import { describe, expect, mock, test } from "bun:test";
import {
  testFullOrganizationResponsibilityAuthorization,
  withTestFullOrganizationResponsibilityAuthorization,
} from "../helpers/admin-authorization";

const now = new Date("2026-08-20T00:00:00.000Z");

function createLifecycle() {
  const clock = createFakeClock(now.getTime());
  const employment = {
    id: 11,
    userId: 7,
    organizationId: 12,
    status: EmploymentStatus.Enable,
    isDelete: false,
  };
  const organization = {
    id: 22,
    orgCode: "TARGET",
    status: OrganizationStatus.Enable,
    isDelete: false,
  };
  const tx = {
    assignmentStore: {
      findOpenAssignmentForSlot: mock(async (): Promise<{
        id: number;
        employmentId: number;
        isManageable: boolean;
      } | null> => null),
      createAssignmentRecord: mock(async (input: OrganizationResponsibilityAssignmentRecordCreate) => ({
        id: 31,
        ...input,
        createTime: now,
        updateTime: now,
      })),
      isEndpointPairWithinReadScope: mock(() => true),
    },
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    employmentReader: {
      getEmploymentForResponsibilityById: mock(
        async (): Promise<typeof employment | null> => employment,
      ),
    },
    organizationReader: {
      getOrganizationForResponsibilityByCode: mock(
        async (): Promise<typeof organization | null> => organization,
      ),
    },
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
  };

  const rawUseCase = createCreateOrganizationResponsibilityAssignmentUseCase({
    clock,
    uow: createImmediateUnitOfWork(tx),
  });
  return {
    clock,
    tx,
    rawUseCase,
    useCase: withTestFullOrganizationResponsibilityAuthorization(
      rawUseCase,
    ),
  };
}

describe("Create Organization Responsibility Assignment", () => {
  test("authorizes both endpoints inside the transaction before scoped create checks", async () => {
    const { rawUseCase, tx } = createLifecycle();
    const authorization = {
      kind: "scoped",
      readScope: { kind: "scoped", organizationIds: [12, 22] },
      getAllowedActions:
        testFullOrganizationResponsibilityAuthorization.getAllowedActions,
      denyMutation: testFullOrganizationResponsibilityAuthorization.denyMutation,
    } satisfies AdminOrganizationResponsibilityAuthorization;

    const result = await rawUseCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    }, { authorization });

    expect(result).toEqual({ id: 31 });
    expect(tx.assignmentStore.isEndpointPairWithinReadScope).toHaveBeenCalledWith({
      readScope: authorization.readScope,
      holderOrganizationId: 12,
      targetOrganizationId: 22,
    });
    expect(tx.assignmentStore.createAssignmentRecord).toHaveBeenCalledTimes(1);
  });

  test("does not check parents, cardinality, or write when scoped authorization denies either endpoint", async () => {
    const { rawUseCase, tx } = createLifecycle();
    const denied = new Error("resource concealed");
    tx.assignmentStore.isEndpointPairWithinReadScope.mockReturnValueOnce(false);
    const authorization = {
      kind: "scoped",
      readScope: { kind: "scoped", organizationIds: [12] },
      getAllowedActions:
        testFullOrganizationResponsibilityAuthorization.getAllowedActions,
      denyMutation: mock((): never => {
        throw denied;
      }),
    } satisfies AdminOrganizationResponsibilityAuthorization;

    const caught = await rawUseCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    }, { authorization }).catch(error => error);

    expect(caught).toBe(denied);
    expect(tx.assignmentStore.findOpenAssignmentForSlot).not.toHaveBeenCalled();
    expect(tx.assignmentStore.createAssignmentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("atomically creates, audits, and dirties an immediately enabled cross-tree assignment", async () => {
    const { clock, tx, useCase } = createLifecycle();

    await expect(useCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    })).resolves.toEqual({ id: 31 });

    expect(clock.nowDate).toHaveBeenCalledTimes(1);
    expect(tx.assignmentStore.createAssignmentRecord).toHaveBeenCalledWith({
      employmentId: 11,
      targetOrganizationId: 22,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: now,
      endTime: null,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.organization_responsibility_assignment.create",
      targetType: "organization_responsibility_assignment",
      targetId: 31,
      details: {
        binding: {
          employmentId: 11,
          targetOrganizationId: 22,
          typeCode: OrganizationResponsibilityTypeCode.Head,
        },
        before: null,
        after: {
          status: OrganizationResponsibilityAssignmentStatus.Enable,
          startTime: now,
          endTime: null,
        },
        cause: "direct",
      },
    }));
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([{
      kind: "organization-responsibility-assignment",
      userId: 7,
    }]);
  });

  test("rejects a holder employment that is not enabled", async () => {
    const { tx, useCase } = createLifecycle();
    tx.employmentReader.getEmploymentForResponsibilityById.mockResolvedValueOnce({
      id: 11,
      userId: 7,
      organizationId: 12,
      status: EmploymentStatus.Pause,
      isDelete: false,
    });

    await expect(useCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    })).rejects.toBeInstanceOf(OrganizationResponsibilityHolderEmploymentUnavailableError);
    expect(tx.assignmentStore.createAssignmentRecord).not.toHaveBeenCalled();
  });

  test("maps missing holder and target parents to their stable not-found errors", async () => {
    const missingHolder = createLifecycle();
    missingHolder.tx.employmentReader.getEmploymentForResponsibilityById.mockResolvedValueOnce(null);

    await expect(missingHolder.useCase.execute({
      employmentId: 404,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    })).rejects.toBeInstanceOf(EmploymentNotFoundError);

    const missingTarget = createLifecycle();
    missingTarget.tx.organizationReader.getOrganizationForResponsibilityByCode.mockResolvedValueOnce(null);

    await expect(missingTarget.useCase.execute({
      employmentId: 11,
      targetOrganizationCode: "MISSING",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    })).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  test("rejects a target organization that is not enabled", async () => {
    const { tx, useCase } = createLifecycle();
    tx.organizationReader.getOrganizationForResponsibilityByCode.mockResolvedValueOnce({
      id: 22,
      orgCode: "TARGET",
      status: OrganizationStatus.Pause,
      isDelete: false,
    });

    await expect(useCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    })).rejects.toBeInstanceOf(OrganizationResponsibilityTargetOrganizationUnavailableError);
    expect(tx.assignmentStore.createAssignmentRecord).not.toHaveBeenCalled();
  });

  test("distinguishes a head cardinality conflict from a duplicate holder", async () => {
    const { tx, useCase } = createLifecycle();
    tx.assignmentStore.findOpenAssignmentForSlot.mockResolvedValueOnce({
      id: 30,
      employmentId: 99,
      isManageable: true,
    });

    await expect(useCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    })).rejects.toBeInstanceOf(OrganizationResponsibilityAssignmentCardinalityConflictError);
  });

  test("returns a stable safe conflict when an invisible assignment occupies the scoped slot", async () => {
    const { rawUseCase, tx } = createLifecycle();
    tx.assignmentStore.findOpenAssignmentForSlot.mockResolvedValueOnce({
      id: 30,
      employmentId: 99,
      isManageable: false,
    });
    const authorization = {
      kind: "scoped",
      readScope: { kind: "scoped", organizationIds: [12, 22] },
      getAllowedActions:
        testFullOrganizationResponsibilityAuthorization.getAllowedActions,
      denyMutation: testFullOrganizationResponsibilityAuthorization.denyMutation,
    } satisfies AdminOrganizationResponsibilityAuthorization;

    const caught = await rawUseCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    }, { authorization }).catch(error => error);

    expect(caught).toBeInstanceOf(
      OrganizationResponsibilityAssignmentUnmanageableConflictError,
    );
    expect(caught.message).toBe(
      "责任槽位已占用；如果当前列表没有可管理记录，请联系完整管理员",
    );
    expect(JSON.stringify(caught)).not.toContain("30");
    expect(JSON.stringify(caught)).not.toContain("99");
    expect(tx.assignmentStore.createAssignmentRecord).not.toHaveBeenCalled();
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });

  test("rejects a duplicate supervising holder while allowing other holders", async () => {
    const { tx, useCase } = createLifecycle();
    tx.assignmentStore.findOpenAssignmentForSlot.mockResolvedValueOnce({
      id: 30,
      employmentId: 11,
      isManageable: true,
    });

    await expect(useCase.execute({
      employmentId: 11,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    })).rejects.toBeInstanceOf(OrganizationResponsibilityAssignmentDuplicateOpenError);
  });
});
