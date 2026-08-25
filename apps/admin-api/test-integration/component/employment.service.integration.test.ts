import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createFakeClock, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { EmploymentStatus, OrganizationLevel, OrganizationStatus, OrganizationType, PositionStatus, UserStatus, UserType } from "@iam/contracts";
import { EmploymentNotEditableError } from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";
import { createTestHrEmploymentAuthorization } from "../helpers/hr-employment-authorization";

const now = new Date("2026-01-01T00:00:00Z");

function user(overrides: Record<string, unknown> = {}) {
  return {
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
    createTime: now,
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
    createTime: now,
    updateTime: now,
    ...overrides,
  };
}

function employment(overrides: Record<string, unknown> = {}) {
  const assignedOrg = {
    ...organization(),
    pathIndex: 0,
    distanceToAssignedOrg: 0,
  };
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
    user: user(),
    position: position(),
    organization: {
      assignedOrg,
      fullOrgPath: [assignedOrg],
      companyNodes: [],
    },
    ...overrides,
  };
}

function createService() {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    userProfileInvalidation: {
      recordChanges: mock(async () => undefined),
    },
    employmentRepository: {
      createEmploymentRecord: mock(async () => employment({ id: 10 })),
      getEmploymentByIdForAdmin: mock(async () => employment()),
      getOpenEmploymentByUserOrgPosId: mock(async () => null),
      updateEmploymentRecord: mock(async () => employment()),
    },
    organizationRepository: {
      getOrganizationByCode: mock(async () => organization()),
      isOrganizationDescendantOf: mock(async () => true),
    },
    positionRepository: {
      getPositionByCode: mock(async () => position()),
    },
    userRepository: {
      getUserByUsernameForAdmin: mock(async () => user()),
    },
  };
  const deps = {
    clock: createFakeClock(now.getTime()),
    employmentRepository: {
      getEmploymentByIdForAdmin: mock(async () => employment()),
      getEmploymentAuthorizationFactsByIdForAdmin: mock(async () => ({
        organizationId: 2,
        status: EmploymentStatus.Enable,
        isPrimary: false,
      })),
      searchEmploymentsFuzzyForAdminPaged: mock(async () => ({ rows: [], total: 0 })),
    },
    privilegeRepository: {
      getPrivilegesByRoleIds: mock(async () => []),
    },
    roleAssignmentResolver: {
      resolveEffectiveRoles: mock(async () => new Map()),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createEmploymentService(deps), tx, deps };
}

function scopedAuthorization(
  organizationIds: readonly number[] = [2],
): Promise<AdminEmploymentAuthorization> {
  return createTestHrEmploymentAuthorization({
    organizationIds,
    rootOrganizationIds: [2],
    denyMutation: mock((input) => {
      throw new Error(`denied:${input.reason}`);
    }) as AdminEmploymentAuthorization["denyMutation"],
  });
}

describe("createEmploymentService", () => {
  test.each([
    ["admin.employment.pause" as const, false],
    ["admin.employment.transfer" as const, false],
    ["admin.employment.setPrimary" as const, false],
    ["admin.employment.clearPrimary" as const, true],
  ])("allows scoped %s from current Employment facts", async (operationId, isPrimary) => {
    const { service, deps } = createService();
    const authorization = await scopedAuthorization([2]);
    deps.employmentRepository.getEmploymentAuthorizationFactsByIdForAdmin
      .mockResolvedValueOnce({
        organizationId: 2,
        status: EmploymentStatus.Enable,
        isPrimary,
      });

    await service.guardEmploymentMutationForAdmin(
      4,
      operationId,
      authorization,
    );

    expect(deps.employmentRepository.getEmploymentAuthorizationFactsByIdForAdmin)
      .toHaveBeenCalledWith(4);
    expect(deps.employmentRepository.getEmploymentByIdForAdmin).not.toHaveBeenCalled();
    expect(authorization.denyMutation).not.toHaveBeenCalled();
  });

  test("rejects lifecycle actions that are not actionable from current Employment facts", async () => {
    const { service, deps } = createService();
    const authorization = await scopedAuthorization([2]);
    deps.employmentRepository.getEmploymentAuthorizationFactsByIdForAdmin
      .mockResolvedValueOnce({
        organizationId: 2,
        status: EmploymentStatus.Pause,
        isPrimary: false,
      });

    let failure: unknown;
    try {
      await service.guardEmploymentMutationForAdmin(
        4,
        "admin.employment.pause",
        authorization,
      );
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toEqual(new Error("denied:RESOURCE_STATE_NOT_ACTIONABLE"));
    expect(authorization.denyMutation).toHaveBeenCalledWith({
      operationId: "admin.employment.pause",
      resourceIdentifier: 4,
      reason: "RESOURCE_STATE_NOT_ACTIONABLE",
    });
  });

  test("conceals missing and out-of-scope lifecycle mutation targets", async () => {
    const { service, deps } = createService();
    const authorization = await scopedAuthorization([2]);
    deps.employmentRepository.getEmploymentAuthorizationFactsByIdForAdmin
      .mockResolvedValueOnce({
        organizationId: 99,
        status: EmploymentStatus.Enable,
        isPrimary: false,
      })
      .mockResolvedValueOnce(null);

    for (const id of [4, 404]) {
      let failure: unknown;
      try {
        await service.guardEmploymentMutationForAdmin(
          id,
          "admin.employment.end",
          authorization,
        );
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toEqual(new Error("denied:RESOURCE_OUT_OF_SCOPE"));
    }

    expect(authorization.denyMutation).toHaveBeenNthCalledWith(1, {
      operationId: "admin.employment.end",
      resourceIdentifier: 4,
      reason: "RESOURCE_OUT_OF_SCOPE",
      concealExistence: true,
    });
    expect(authorization.denyMutation).toHaveBeenNthCalledWith(2, {
      operationId: "admin.employment.end",
      resourceIdentifier: 404,
      reason: "RESOURCE_OUT_OF_SCOPE",
      concealExistence: true,
    });
  });

  test("applies HR scope and the server-owned Open default before pagination", async () => {
    const { service, deps } = createService();
    const authorization = await scopedAuthorization();
    const query = {
      pageNum: 1,
      pageSize: 20,
      conditions: { fuzzyConditions: {}, exactConditions: {} },
    };

    await service.searchEmploymentsFuzzyForAdmin(query, authorization);
    await service.getEmploymentDetailByIdForAdmin(4, authorization);

    expect(deps.employmentRepository.searchEmploymentsFuzzyForAdminPaged)
      .toHaveBeenCalledWith({
        ...query,
        conditions: {
          ...query.conditions,
          exactConditions: {
            statuses: [EmploymentStatus.Enable, EmploymentStatus.Pause],
          },
        },
      }, { organizationIds: [2] });
    expect(deps.employmentRepository.getEmploymentByIdForAdmin)
      .toHaveBeenCalledWith(4, { organizationIds: [2] });
  });

  test("conceals an out-of-scope Employment before description update writes", async () => {
    const { service, tx } = createService();
    const authorization = await scopedAuthorization([99]);

    let failure: unknown;
    try {
      await service.updateEmployment(
        4,
        { description: "forbidden" },
        undefined,
        authorization,
      );
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeDefined();
    expect(authorization.denyMutation).toHaveBeenCalledWith({
      operationId: "admin.employment.update",
      resourceIdentifier: 4,
      reason: "RESOURCE_OUT_OF_SCOPE",
      concealExistence: true,
    });
    expect(tx.employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
  });

  test("resolves Effective Roles for an employment detail through the batch interface", async () => {
    const { service, deps } = createService();
    deps.roleAssignmentResolver.resolveEffectiveRoles.mockResolvedValueOnce(new Map([
      [4, [
        { id: 11, roleCode: "admin" },
        { id: 12, roleCode: "reviewer" },
      ]],
    ]));
    deps.privilegeRepository.getPrivilegesByRoleIds.mockResolvedValueOnce([
      { privilegeCode: "user:read" },
      { privilegeCode: "user:write" },
    ]);

    const detail = await service.getEmploymentDetailByIdForAdmin(4);

    expect(deps.roleAssignmentResolver.resolveEffectiveRoles).toHaveBeenCalledWith({ employmentIds: [4] });
    expect(deps.privilegeRepository.getPrivilegesByRoleIds).toHaveBeenCalledWith([11, 12]);
    expect(detail.roles).toEqual(["admin", "reviewer"]);
    expect(detail.privileges).toEqual(["user:read", "user:write"]);
  });

  test("keeps the existing employment-not-found behavior before resolving roles", async () => {
    const { service, deps } = createService();
    deps.employmentRepository.getEmploymentByIdForAdmin.mockResolvedValueOnce(null);

    await expect(service.getEmploymentDetailByIdForAdmin(404)).rejects.toThrow();

    expect(deps.roleAssignmentResolver.resolveEffectiveRoles).not.toHaveBeenCalled();
  });

  test("updates an employment and marks its existing user dirty", async () => {
    const { service, tx } = createService();

    await expect(service.updateEmployment(4, { description: "updated" })).resolves.toBe(true);

    expect(tx.employmentRepository.updateEmploymentRecord).toHaveBeenCalledWith(4, {
      description: "updated",
    });
    expect(tx.userProfileInvalidation.recordChanges).toHaveBeenCalledWith([
      { kind: "employment", userId: 1 },
    ]);
  });

  test("rejects description edits for an Ended Employment", async () => {
    const { service, tx } = createService();
    tx.employmentRepository.getEmploymentByIdForAdmin.mockResolvedValue(
      employment({ status: EmploymentStatus.Disable, endTime: now, isPrimary: false }),
    );

    await expect(
      service.updateEmployment(4, { description: "rewritten" }),
    ).rejects.toBeInstanceOf(EmploymentNotEditableError);

    expect(tx.employmentRepository.updateEmploymentRecord).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(tx.userProfileInvalidation.recordChanges).not.toHaveBeenCalled();
  });
});
