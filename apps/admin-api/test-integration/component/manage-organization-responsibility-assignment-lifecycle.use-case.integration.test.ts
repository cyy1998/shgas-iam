import type { AdminOrganizationResponsibilityAuthorization } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { OrganizationResponsibilityAssignmentLifecycleContext } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.port";
import {
  createFakeClock,
  createImmediateUnitOfWork,
} from "@admin-api/test/fakes";
import { createManageOrganizationResponsibilityAssignmentLifecycleUseCase } from "@admin-api/use-cases/organization-responsibility/manage-assignment-lifecycle/manage-assignment-lifecycle.use-case";
import { CustomError } from "@iam/api-core/errors";
import {
  ApiErrorCode,
  EmploymentStatus,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from "@iam/contracts";
import {
  OrganizationResponsibilityAssignmentCardinalityConflictError,
  OrganizationResponsibilityAssignmentNotFoundError,
  OrganizationResponsibilityHolderEmploymentUnavailableError,
  OrganizationResponsibilityTargetOrganizationUnavailableError,
} from "@iam/domain/organization-responsibility";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  testFullOrganizationResponsibilityAuthorization,
  withTestFullOrganizationResponsibilityAuthorization,
} from "../helpers/admin-authorization";

const now = new Date("2026-08-20T08:00:00.000Z");
const assignmentStartTime = new Date("2026-08-20T00:00:00.000Z");

function createLifecycle(
  status: OrganizationResponsibilityAssignmentStatus = OrganizationResponsibilityAssignmentStatus.Enable,
) {
  const clock = createFakeClock(now.getTime());
  const context: OrganizationResponsibilityAssignmentLifecycleContext = {
    assignment: {
      id: 31,
      employmentId: 11,
      targetOrganizationId: 22,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      status,
      startTime: assignmentStartTime,
      endTime:
        status === OrganizationResponsibilityAssignmentStatus.Disable
          ? new Date("2026-08-20T06:00:00.000Z")
          : null,
    },
    employment: {
      userId: 7,
      organizationId: 21,
      status: EmploymentStatus.Enable,
      isDelete: false,
    },
    targetOrganization: {
      status: OrganizationStatus.Enable,
      isDelete: false,
    },
  };
  const tx = {
    assignmentStore: {
      isEndpointPairWithinReadScope: mock((input: {
        readScope: AdminOrganizationResponsibilityAuthorization["readScope"];
        holderOrganizationId: number;
        targetOrganizationId: number;
      }) => input.readScope.kind === "full" || (
        input.readScope.organizationIds.includes(input.holderOrganizationId)
        && input.readScope.organizationIds.includes(input.targetOrganizationId)
      )),
      findOpenAssignmentForSlot: mock(
        async (): Promise<{
          id: number;
          employmentId: number;
        } | null> => null,
      ),
      getAssignmentLifecycleContextById: mock(
        async (): Promise<OrganizationResponsibilityAssignmentLifecycleContext | null> =>
          context,
      ),
      updateAssignmentLifecycle: mock(async () => true),
    },
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    userProfileInvalidation: { recordChanges: mock(async () => undefined) },
  };
  const rawUseCase
    = createManageOrganizationResponsibilityAssignmentLifecycleUseCase({
      clock,
      uow: createImmediateUnitOfWork(tx),
    });
  return {
    clock,
    context,
    tx,
    rawUseCase,
    useCase: withTestFullOrganizationResponsibilityAuthorization(
      rawUseCase,
    ),
  };
}

describe("Manage Organization Responsibility Assignment lifecycle", () => {
  beforeEach(() => mock.restore());

  test("authorizes both scoped endpoints inside the transaction before pausing", async () => {
    const { rawUseCase, tx } = createLifecycle();
    const denyMutation = mock((): never => {
      throw new Error("in-scope lifecycle must not be denied");
    });
    const authorization = {
      kind: "scoped",
      readScope: { kind: "scoped", organizationIds: [21, 22] },
      getAllowedActions:
        testFullOrganizationResponsibilityAuthorization.getAllowedActions,
      denyMutation,
    } satisfies AdminOrganizationResponsibilityAuthorization;

    const changed = await rawUseCase.execute(
      { id: 31, command: "pause" },
      { authorization },
    );

    expect(changed).toBe(true);
    expect(
      tx.assignmentStore.isEndpointPairWithinReadScope,
    ).toHaveBeenCalledWith({
      readScope: authorization.readScope,
      holderOrganizationId: 21,
      targetOrganizationId: 22,
    });
    expect(denyMutation).not.toHaveBeenCalled();
    expect(tx.assignmentStore.updateAssignmentLifecycle).toHaveBeenCalledTimes(1);
  });

  test("conceals every out-of-scope endpoint pair before an idempotent retry", async () => {
    const cases = [
      { holderOrganizationId: 21, targetOrganizationId: 23 },
      { holderOrganizationId: 20, targetOrganizationId: 22 },
      { holderOrganizationId: 20, targetOrganizationId: 23 },
    ] as const;

    for (const { holderOrganizationId, targetOrganizationId } of cases) {
      const { context, rawUseCase, tx } = createLifecycle(
        OrganizationResponsibilityAssignmentStatus.Pause,
      );
      if (context.employment === null)
        throw new Error("test fixture requires holder Employment");
      context.employment.organizationId = holderOrganizationId;
      context.assignment.targetOrganizationId = targetOrganizationId;
      const concealed = new OrganizationResponsibilityAssignmentNotFoundError();
      const denyMutation = mock((): never => {
        throw concealed;
      });
      const authorization = {
        kind: "scoped",
        readScope: { kind: "scoped", organizationIds: [21, 22] },
        getAllowedActions:
          testFullOrganizationResponsibilityAuthorization.getAllowedActions,
        denyMutation,
      } satisfies AdminOrganizationResponsibilityAuthorization;

      const caught = await rawUseCase.execute(
        { id: 31, command: "pause" },
        { authorization },
      ).catch(error => error);

      expect(caught).toBe(concealed);
      expect(denyMutation).toHaveBeenCalledWith({
        operationId: "admin.organizationResponsibility.pauseAssignment",
        resourceIdentifier: "assignment-request",
        reason: "RESOURCE_OUT_OF_SCOPE",
      });
      expect(
        tx.assignmentStore.updateAssignmentLifecycle,
      ).not.toHaveBeenCalled();
      expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
      expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    }
  });

  test("atomically pauses an enabled Assignment with a minimal direct audit", async () => {
    const { clock, tx, useCase } = createLifecycle();

    await expect(useCase.execute({ id: 31, command: "pause" })).resolves.toBe(
      true,
    );

    expect(clock.nowDate).not.toHaveBeenCalled();
    expect(tx.assignmentStore.updateAssignmentLifecycle).toHaveBeenCalledWith({
      id: 31,
      expectedStatus: OrganizationResponsibilityAssignmentStatus.Enable,
      status: OrganizationResponsibilityAssignmentStatus.Pause,
      endTime: null,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.organization_responsibility_assignment.pause",
        targetType: "organization_responsibility_assignment",
        targetId: 31,
        details: {
          binding: {
            employmentId: 11,
            targetOrganizationId: 22,
            typeCode: OrganizationResponsibilityTypeCode.Head,
          },
          before: {
            status: OrganizationResponsibilityAssignmentStatus.Enable,
            startTime: assignmentStartTime,
            endTime: null,
          },
          after: {
            status: OrganizationResponsibilityAssignmentStatus.Pause,
            startTime: assignmentStartTime,
            endTime: null,
          },
          cause: "direct",
        },
      }),
    );
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      {
        kind: "organization-responsibility-assignment",
        userId: 7,
      },
    ]);
  });

  test("revalidates holder, target, and the excluding Open slot before Resume", async () => {
    const { tx, useCase } = createLifecycle(
      OrganizationResponsibilityAssignmentStatus.Pause,
    );

    await expect(useCase.execute({ id: 31, command: "resume" })).resolves.toBe(
      true,
    );

    expect(tx.assignmentStore.findOpenAssignmentForSlot).toHaveBeenCalledWith({
      employmentId: 11,
      targetOrganizationId: 22,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      excludeAssignmentId: 31,
    });
    expect(tx.assignmentStore.updateAssignmentLifecycle).toHaveBeenCalledWith({
      id: 31,
      expectedStatus: OrganizationResponsibilityAssignmentStatus.Pause,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      endTime: null,
    });
  });

  test("rejects Resume when its holder, target, or Open slot is unavailable", async () => {
    const unavailableHolder = createLifecycle(
      OrganizationResponsibilityAssignmentStatus.Pause,
    );
    if (unavailableHolder.context.employment === null)
      throw new Error("test fixture requires holder Employment");
    unavailableHolder.context.employment.status = EmploymentStatus.Pause;
    await expect(
      unavailableHolder.useCase.execute({
        id: 31,
        command: "resume",
      }),
    ).rejects.toBeInstanceOf(
      OrganizationResponsibilityHolderEmploymentUnavailableError,
    );

    const unavailableTarget = createLifecycle(
      OrganizationResponsibilityAssignmentStatus.Pause,
    );
    if (unavailableTarget.context.targetOrganization === null)
      throw new Error("test fixture requires target Organization");
    unavailableTarget.context.targetOrganization.status
      = OrganizationStatus.Pause;
    await expect(
      unavailableTarget.useCase.execute({
        id: 31,
        command: "resume",
      }),
    ).rejects.toBeInstanceOf(
      OrganizationResponsibilityTargetOrganizationUnavailableError,
    );

    const occupiedSlot = createLifecycle(
      OrganizationResponsibilityAssignmentStatus.Pause,
    );
    occupiedSlot.tx.assignmentStore.findOpenAssignmentForSlot.mockResolvedValueOnce(
      {
        id: 32,
        employmentId: 99,
      },
    );
    await expect(
      occupiedSlot.useCase.execute({
        id: 31,
        command: "resume",
      }),
    ).rejects.toBeInstanceOf(
      OrganizationResponsibilityAssignmentCardinalityConflictError,
    );
  });

  test("ends either Open state once with the injected transaction time", async () => {
    const { clock, tx, useCase } = createLifecycle(
      OrganizationResponsibilityAssignmentStatus.Pause,
    );

    await expect(useCase.execute({ id: 31, command: "end" })).resolves.toBe(
      true,
    );

    expect(clock.nowDate).toHaveBeenCalledTimes(1);
    expect(tx.assignmentStore.updateAssignmentLifecycle).toHaveBeenCalledWith({
      id: 31,
      expectedStatus: OrganizationResponsibilityAssignmentStatus.Pause,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      endTime: now,
    });
    expect(tx.auditLogWriter.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.organization_responsibility_assignment.end",
        details: expect.objectContaining({
          after: {
            status: OrganizationResponsibilityAssignmentStatus.Disable,
            startTime: assignmentStartTime,
            endTime: now,
          },
        }),
      }),
    );
  });

  test("returns target-state retries without time, audit, Dirty, or writes", async () => {
    const cases = [
      [OrganizationResponsibilityAssignmentStatus.Pause, "pause"],
      [OrganizationResponsibilityAssignmentStatus.Enable, "resume"],
      [OrganizationResponsibilityAssignmentStatus.Disable, "end"],
    ] as const;

    for (const [status, command] of cases) {
      const { clock, tx, useCase } = createLifecycle(status);
      await expect(useCase.execute({ id: 31, command })).resolves.toBe(true);
      expect(clock.nowDate).not.toHaveBeenCalled();
      expect(
        tx.assignmentStore.updateAssignmentLifecycle,
      ).not.toHaveBeenCalled();
      expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
      expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
    }
  });

  test("returns the stable not-found error before any mutation", async () => {
    const { tx, useCase } = createLifecycle();
    tx.assignmentStore.getAssignmentLifecycleContextById.mockResolvedValueOnce(
      null,
    );

    await expect(
      useCase.execute({ id: 404, command: "pause" }),
    ).rejects.toBeInstanceOf(OrganizationResponsibilityAssignmentNotFoundError);
    expect(tx.assignmentStore.updateAssignmentLifecycle).not.toHaveBeenCalled();
  });

  test("fails a non-convergent concurrent change with a safe stable service error", async () => {
    const { tx, useCase } = createLifecycle();
    tx.assignmentStore.updateAssignmentLifecycle.mockResolvedValueOnce(false);

    const caught = await useCase
      .execute({ id: 31, command: "pause" })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(CustomError);
    expect(caught).toMatchObject({
      code: ApiErrorCode.InternalError,
      message: "服务器内部错误",
    });
    expect((caught as Error).message).not.toContain("31");
    expect(tx.auditLogWriter.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });
});
