import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { ADMIN_OPERATION_REGISTRY } from "@admin-api/services/admin-authorization/admin-operation.registry";
import { SystemLogEvent } from "@iam/api-core/logger";
import {
  ADMIN_MODULE_CODES,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationStatus,
  UserStatus,
} from "@iam/contracts";
import { OrganizationResponsibilityAssignmentNotFoundError } from "@iam/domain/organization-responsibility";
import { describe, expect, mock, test } from "bun:test";

function actor(roles: string[]) {
  return {
    userId: 7,
    username: "operator",
    roles,
  };
}

const hrScope = {
  rootOrganizationIds: [10],
  organizationIds: [10, 11],
} as const;

function createPolicy(scope: typeof hrScope | null = null) {
  return createAdminAuthorizationPolicy({
    logger: { warn: mock() },
    hrAdministrationScopeResolver: {
      resolveForActor: async () => scope,
    },
  });
}

describe("Admin Authorization Policy", () => {
  test("unions role capabilities and maps only canonical iam:admin to the complete summary", async () => {
    const policy = createPolicy();

    const summary = await policy.getCapabilitySummary(
      actor(["iam:user", "iam:admin"]),
    );

    expect(summary.visibleModules).toEqual([...ADMIN_MODULE_CODES]);
    expect(summary.collectionActions).toEqual({
      user: { create: { allowed: true, reason: null } },
      employment: { create: { allowed: true, reason: null } },
      organization: { createRoot: { allowed: true, reason: null } },
      organizationResponsibility: {
        create: { allowed: true, reason: null },
      },
      position: {
        create: { allowed: true, reason: null },
        edit: { allowed: true, reason: null },
        changeStatus: { allowed: true, reason: null },
        delete: { allowed: true, reason: null },
      },
    });
    expect((await policy.getCapabilitySummary(actor(["configured:admin"]))).visibleModules)
      .toEqual([]);
  });

  test("projects lifecycle Assignment actions for full and scoped administrators", async () => {
    const policy = createPolicy(hrScope);

    for (const roles of [["iam:admin"], ["iam:admin", "iam:hr-admin"]]) {
      const authorization
        = await policy.getOrganizationResponsibilityAuthorization(actor(roles));
      expect(authorization).toMatchObject({
        kind: "full",
        readScope: { kind: "full" },
      });
      expect(authorization.getAllowedActions({
        status: OrganizationResponsibilityAssignmentStatus.Enable,
      })).toEqual({
        pause: { allowed: true, reason: null },
        resume: {
          allowed: false,
          reason: "RESOURCE_STATE_NOT_ACTIONABLE",
        },
        end: { allowed: true, reason: null },
      });
      expect(authorization.getAllowedActions({
        status: OrganizationResponsibilityAssignmentStatus.Pause,
      })).toEqual({
        pause: {
          allowed: false,
          reason: "RESOURCE_STATE_NOT_ACTIONABLE",
        },
        resume: { allowed: true, reason: null },
        end: { allowed: true, reason: null },
      });
      expect(authorization.getAllowedActions({
        status: OrganizationResponsibilityAssignmentStatus.Disable,
      })).toEqual({
        pause: {
          allowed: false,
          reason: "RESOURCE_STATE_NOT_ACTIONABLE",
        },
        resume: {
          allowed: false,
          reason: "RESOURCE_STATE_NOT_ACTIONABLE",
        },
        end: {
          allowed: false,
          reason: "RESOURCE_STATE_NOT_ACTIONABLE",
        },
      });
    }

    const scopedAuthorization
      = await policy.getOrganizationResponsibilityAuthorization(
        actor(["iam:hr-admin"]),
      );
    expect(scopedAuthorization).toMatchObject({
      kind: "scoped",
      readScope: {
        kind: "scoped",
        organizationIds: hrScope.organizationIds,
      },
    });
    expect(scopedAuthorization.getAllowedActions({
      status: OrganizationResponsibilityAssignmentStatus.Enable,
    })).toEqual({
      pause: { allowed: true, reason: null },
      resume: {
        allowed: false,
        reason: "RESOURCE_STATE_NOT_ACTIONABLE",
      },
      end: { allowed: true, reason: null },
    });
  });

  test("conceals scoped Organization Responsibility mutation denials with a safe log identifier", async () => {
    const logger = { warn: mock() };
    const policy = createAdminAuthorizationPolicy({
      logger,
      hrAdministrationScopeResolver: {
        resolveForActor: async () => ({
          rootOrganizationIds: [10, 20],
          organizationIds: [10, 11, 20, 21],
        }),
      },
    });
    const authorization = await policy.getOrganizationResponsibilityAuthorization(
      actor(["iam:hr-admin"]),
    );
    expect(() => authorization.denyMutation({
      operationId: "admin.organizationResponsibility.createAssignment",
      resourceIdentifier: "create-request",
      reason: "RESOURCE_OUT_OF_SCOPE",
    })).toThrow(OrganizationResponsibilityAssignmentNotFoundError);
    expect(logger.warn).toHaveBeenCalledWith({
      event: SystemLogEvent.AdminAuthorizationDenied,
      actor: { userId: 7, username: "operator" },
      action: "admin.organizationResponsibility.createAssignment",
      resourceType: "organizationResponsibilityAssignment",
      resourceIdentifier: "create-request",
      reasonCode: "RESOURCE_OUT_OF_SCOPE",
    }, "admin mutation authorization denied");
  });

  test("grants User, Organization, Position, and the approved Employment slice to HR", async () => {
    const policy = createPolicy(hrScope);

    const summary = await policy.getCapabilitySummary(
      actor(["iam:user", "iam:hr-admin"]),
    );

    expect(summary.visibleModules).toEqual([
      "user",
      "organization",
      "organizationResponsibility",
      "position",
      "employment",
    ]);
    expect(summary.collectionActions.organizationResponsibility.create).toEqual({
      allowed: true,
      reason: null,
    });
    expect(summary.collectionActions.employment.create).toEqual({
      allowed: true,
      reason: null,
    });
    expect(summary.collectionActions.user.create).toEqual({
      allowed: false,
      reason: "ACTION_NOT_GRANTED",
    });
    expect(summary.collectionActions.organization.createRoot).toEqual({
      allowed: false,
      reason: "ACTION_NOT_GRANTED",
    });
    const allowedOperationIds = [
      "admin.authorization.capabilitySummary",
      "admin.user.search",
      "admin.user.detail",
      "admin.user.update",
      "admin.user.updateStatus",
      "admin.user.resetPassword",
      "admin.organization.search",
      "admin.organization.children",
      "admin.organization.selector",
      "admin.organization.detail",
      "admin.organization.create",
      "admin.organization.update",
      "admin.organization.updateStatus",
      "admin.organization.delete",
      "admin.organizationResponsibility.listTypes",
      "admin.organizationResponsibility.listAssignments",
      "admin.organizationResponsibility.searchAssignments",
      "admin.organizationResponsibility.detailAssignment",
      "admin.organizationResponsibility.scopedDetailAssignment",
      "admin.organizationResponsibility.createAssignment",
      "admin.organizationResponsibility.pauseAssignment",
      "admin.organizationResponsibility.resumeAssignment",
      "admin.organizationResponsibility.endAssignment",
      "admin.position.search",
      "admin.position.detail",
      "admin.employment.search",
      "admin.employment.detail",
      "admin.employment.create",
      "admin.employment.update",
      "admin.employment.pause",
      "admin.employment.resume",
      "admin.employment.end",
      "admin.employment.transfer",
      "admin.employment.setPrimary",
      "admin.employment.clearPrimary",
      "admin.employment.resignUser",
    ] as const;
    for (const operationId of allowedOperationIds) {
      expect(await policy.decideOperation({
        actor: actor(["iam:hr-admin"]),
        operationId,
      })).toEqual({ allowed: true, reason: null });
    }
    for (const operationId of Object.keys(ADMIN_OPERATION_REGISTRY)) {
      if (allowedOperationIds.includes(operationId as typeof allowedOperationIds[number]))
        continue;
      expect(await policy.decideOperation({
        actor: actor(["iam:hr-admin"]),
        operationId,
      })).toEqual({ allowed: false, reason: "ACTION_NOT_GRANTED" });
    }
  });

  test("projects HR User profile and password actions from any in-scope Open Employment", async () => {
    const authorization = await createPolicy(hrScope)
      .getUserAuthorization(actor(["iam:hr-admin"]));

    expect(authorization.getAllowedActions({
      status: UserStatus.Enable,
      isDelete: false,
      openEmploymentOrganizationIds: [20, 10],
      endedEmploymentOrganizationIds: [],
    })).toEqual({
      editProfile: { allowed: true, reason: null },
      resetPassword: { allowed: true, reason: null },
      changeStatus: {
        allowed: false,
        reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
      },
      delete: { allowed: false, reason: "ACTION_NOT_GRANTED" },
      resign: {
        allowed: false,
        reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
      },
    });
    expect(authorization.getAllowedActions({
      status: UserStatus.Pause,
      isDelete: false,
      openEmploymentOrganizationIds: [10],
      endedEmploymentOrganizationIds: [],
    })).toMatchObject({
      editProfile: { allowed: true, reason: null },
      resetPassword: { allowed: false, reason: "USER_NOT_ENABLED" },
    });
    expect(authorization.getAllowedActions({
      status: UserStatus.Enable,
      isDelete: false,
      openEmploymentOrganizationIds: [20],
      endedEmploymentOrganizationIds: [],
    })).toMatchObject({
      editProfile: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      resetPassword: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
    });
    expect(authorization.getAllowedActions({
      status: UserStatus.Enable,
      isDelete: false,
      openEmploymentOrganizationIds: [],
      endedEmploymentOrganizationIds: [],
    })).toMatchObject({
      editProfile: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      resetPassword: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
    });
  });

  test("allows HR resignation only for an all-in-scope first execution or a completed retry", async () => {
    const authorization = await createPolicy(hrScope)
      .getUserAuthorization(actor(["iam:hr-admin"]));

    const cases = [
      {
        facts: {
          status: UserStatus.Enable,
          isDelete: false,
          openEmploymentOrganizationIds: [10, 11],
          endedEmploymentOrganizationIds: [],
        },
        expected: { allowed: true, reason: null },
      },
      {
        facts: {
          status: UserStatus.Pause,
          isDelete: false,
          openEmploymentOrganizationIds: [10, 20],
          endedEmploymentOrganizationIds: [],
        },
        expected: {
          allowed: false,
          reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
        },
      },
      {
        facts: {
          status: UserStatus.Disable,
          isDelete: false,
          openEmploymentOrganizationIds: [],
          endedEmploymentOrganizationIds: [10, 20],
        },
        expected: { allowed: true, reason: null },
      },
      {
        facts: {
          status: UserStatus.Enable,
          isDelete: false,
          openEmploymentOrganizationIds: [],
          endedEmploymentOrganizationIds: [10],
        },
        expected: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      },
      {
        facts: {
          status: UserStatus.Pause,
          isDelete: false,
          openEmploymentOrganizationIds: [],
          endedEmploymentOrganizationIds: [10],
        },
        expected: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      },
      {
        facts: {
          status: UserStatus.Disable,
          isDelete: false,
          openEmploymentOrganizationIds: [],
          endedEmploymentOrganizationIds: [20],
        },
        expected: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      },
      {
        facts: {
          status: UserStatus.Disable,
          isDelete: true,
          openEmploymentOrganizationIds: [],
          endedEmploymentOrganizationIds: [10],
        },
        expected: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      },
    ] as const;

    for (const { facts, expected } of cases)
      expect(authorization.getAllowedActions(facts).resign).toEqual(expected);
  });

  test("allows HR User status changes only when every Open Employment is in scope", async () => {
    const authorization = await createPolicy(hrScope)
      .getUserAuthorization(actor(["iam:hr-admin"]));

    for (const status of [
      UserStatus.Enable,
      UserStatus.Pause,
      UserStatus.Disable,
    ]) {
      expect(authorization.getAllowedActions({
        status,
        isDelete: false,
        openEmploymentOrganizationIds: [10, 11],
        endedEmploymentOrganizationIds: [],
      }).changeStatus).toEqual({ allowed: true, reason: null });
      expect(authorization.getAllowedActions({
        status,
        isDelete: false,
        openEmploymentOrganizationIds: [10, 20],
        endedEmploymentOrganizationIds: [],
      }).changeStatus).toEqual({
        allowed: false,
        reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
      });
      expect(authorization.getAllowedActions({
        status,
        isDelete: false,
        openEmploymentOrganizationIds: [],
        endedEmploymentOrganizationIds: [],
      }).changeStatus).toEqual({
        allowed: false,
        reason: "USER_NOT_HR_MANAGED",
      });
    }
  });

  test("rejects every HR profile update field outside the four-field allowlist before input parsing", async () => {
    const warn = mock();
    const policy = createAdminAuthorizationPolicy({
      logger: { warn },
      hrAdministrationScopeResolver: { resolveForActor: async () => hrScope },
    });
    const hrActor = actor(["iam:hr-admin"]);

    const trpcAuthorization = await policy.assertOperationAllowed({
      actor: hrActor,
      operationId: "admin.user.update",
      operationInput: {
        username: "target",
        data: { name: "Target", mobile: null, wxId: null, userType: 1 },
      },
    });
    const restAuthorization = await policy.assertOperationAllowed({
      actor: hrActor,
      operationId: "admin.user.update",
      operationInput: {
        params: { username: "target" },
        query: {},
        body: { name: "Target", mobile: null, wxId: null, userType: 1 },
      },
    });

    expect(trpcAuthorization.hrAdministrationScope).toEqual(hrScope);
    expect(restAuthorization.hrAdministrationScope).toEqual(hrScope);

    for (const operationInput of [
      { username: "target", data: { status: UserStatus.Pause } },
      { username: "target", data: { orderNum: 3 } },
      { username: "target", data: { unexpected: true } },
      { params: { username: "target" }, query: {}, body: { status: UserStatus.Pause } },
      { params: { username: "target" }, query: {}, body: { orderNum: 3 } },
      { params: { username: "target" }, query: {}, body: { unexpected: true } },
    ]) {
      let failure: unknown;
      try {
        await policy.assertOperationAllowed({
          actor: hrActor,
          operationId: "admin.user.update",
          operationInput,
        });
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ httpStatus: 403 });
    }
    expect(warn).toHaveBeenCalledTimes(6);
  });

  test("projects the complete Employment action map for HR and full administrators", async () => {
    const policy = createPolicy(hrScope);
    const hrAuthorization = await policy.getEmploymentAuthorization(actor(["iam:hr-admin"]));
    const fullAuthorization = await policy.getEmploymentAuthorization(actor(["iam:admin"]));

    expect(hrAuthorization.getAllowedActions({
      status: EmploymentStatus.Enable,
      isPrimary: false,
    })).toEqual({
      editDescription: { allowed: true, reason: null },
      pause: { allowed: true, reason: null },
      resume: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      end: { allowed: true, reason: null },
      transfer: { allowed: true, reason: null },
      setPrimary: { allowed: true, reason: null },
      clearPrimary: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
    });
    expect(hrAuthorization.getAllowedActions({
      status: EmploymentStatus.Pause,
      isPrimary: false,
    })).toEqual({
      editDescription: { allowed: true, reason: null },
      pause: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      resume: { allowed: true, reason: null },
      end: { allowed: true, reason: null },
      transfer: { allowed: true, reason: null },
      setPrimary: { allowed: true, reason: null },
      clearPrimary: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
    });
    expect(hrAuthorization.getAllowedActions({
      status: EmploymentStatus.Enable,
      isPrimary: true,
    })).toEqual({
      editDescription: { allowed: true, reason: null },
      pause: { allowed: true, reason: null },
      resume: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      end: { allowed: true, reason: null },
      transfer: { allowed: true, reason: null },
      setPrimary: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      clearPrimary: { allowed: true, reason: null },
    });
    expect(hrAuthorization.getAllowedActions({
      status: EmploymentStatus.Disable,
      isPrimary: false,
    })).toEqual({
      editDescription: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      pause: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      resume: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      end: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      transfer: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      setPrimary: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      clearPrimary: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
    });
    expect(fullAuthorization.getAllowedActions({
      status: EmploymentStatus.Pause,
      isPrimary: true,
    })).toEqual({
      editDescription: { allowed: true, reason: null },
      pause: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      resume: { allowed: true, reason: null },
      end: { allowed: true, reason: null },
      transfer: { allowed: true, reason: null },
      setPrimary: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      clearPrimary: { allowed: true, reason: null },
    });
  });

  test("reuses the HR scope resolved while authorizing an Employment operation", async () => {
    const resolveForActor = mock(async () => hrScope);
    const policy = createAdminAuthorizationPolicy({
      logger: { warn: mock() },
      hrAdministrationScopeResolver: { resolveForActor },
    });
    const hrActor = actor(["iam:hr-admin"]);

    const operationAuthorization = await policy.assertOperationAllowed({
      actor: hrActor,
      operationId: "admin.employment.detail",
      operationInput: { id: 4 },
    });
    const employmentAuthorization = await policy.getEmploymentAuthorization(
      hrActor,
      operationAuthorization.hrAdministrationScope,
    );

    expect(employmentAuthorization).toMatchObject({
      kind: "scoped",
      rootOrganizationIds: [10],
      organizationIds: [10, 11],
    });
    expect(resolveForActor).toHaveBeenCalledTimes(1);
  });

  test("fails closed when the HR role is missing, misbound, disabled, deleted, or has no structural root", async () => {
    const policy = createPolicy(null);

    expect(await policy.getCapabilitySummary(actor(["iam:hr-admin"]))).toMatchObject({
      visibleModules: [],
    });
    for (const roles of [["iam:hr-admin"], ["ordinary-role"]]) {
      expect(await policy.decideOperation({
        actor: actor(roles),
        operationId: "admin.user.updateStatus",
      })).toEqual({ allowed: false, reason: "ACTION_NOT_GRANTED" });
    }
  });

  test("preserves full administrator capabilities for a mixed-role actor", async () => {
    const policy = createPolicy(null);
    const mixedActor = actor(["iam:admin", "iam:hr-admin"]);

    expect((await policy.getCapabilitySummary(mixedActor)).visibleModules)
      .toEqual([...ADMIN_MODULE_CODES]);
    for (const roles of [["iam:admin"], ["iam:admin", "iam:hr-admin"]]) {
      const authorization = await policy.getUserAuthorization(actor(roles));
      for (const status of [
        UserStatus.Enable,
        UserStatus.Pause,
        UserStatus.Disable,
      ]) {
        expect(authorization.getAllowedActions({
          status,
          isDelete: true,
          openEmploymentOrganizationIds: [],
          endedEmploymentOrganizationIds: [],
        })).toEqual({
          editProfile: { allowed: true, reason: null },
          resetPassword: { allowed: true, reason: null },
          changeStatus: { allowed: true, reason: null },
          delete: { allowed: true, reason: null },
          resign: { allowed: true, reason: null },
        });
      }
    }
    expect(await policy.getOrganizationAuthorization(mixedActor)).toMatchObject({
      kind: "full",
      rootOrganizationIds: null,
      organizationIds: null,
    });
  });

  test("denies an unregistered operation even to the canonical full administrator", async () => {
    const policy = createPolicy();

    expect(await policy.decideOperation({
      actor: actor(["iam:admin"]),
      operationId: "admin.future.unregistered",
    })).toEqual({ allowed: false, reason: "ACTION_NOT_GRANTED" });
  });

  test("logs a structured mutation denial without resolved scope", async () => {
    const warn = mock();
    const policy = createAdminAuthorizationPolicy({
      logger: { warn },
      hrAdministrationScopeResolver: {
        resolveForActor: async () => null,
      },
    });

    let failure: unknown;
    try {
      await policy.assertOperationAllowed({
        actor: actor(["iam:user"]),
        operationId: "admin.user.delete",
        operationInput: { username: "zhangsan" },
      });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      httpStatus: 403,
      message: "无管理端操作权限",
    });

    expect(warn).toHaveBeenCalledWith({
      event: SystemLogEvent.AdminAuthorizationDenied,
      actor: { userId: 7, username: "operator" },
      action: "admin.user.delete",
      resourceType: "user",
      resourceIdentifier: "zhangsan",
      reasonCode: "ACTION_NOT_GRANTED",
    }, "admin mutation authorization denied");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("scope");
  });

  test("uses a safe Create identifier when the operation gate rejects Organization Responsibility input", async () => {
    const warn = mock();
    const policy = createAdminAuthorizationPolicy({
      logger: { warn },
      hrAdministrationScopeResolver: { resolveForActor: async () => null },
    });

    const failure = await policy.assertOperationAllowed({
      actor: actor(["iam:hr-admin"]),
      operationId: "admin.organizationResponsibility.createAssignment",
      operationInput: {
        employmentId: 999,
        orgCode: "OUTSIDE_SECRET",
      },
    }).catch(error => error);

    expect(failure).toMatchObject({ httpStatus: 403 });
    expect(warn).toHaveBeenCalledWith({
      event: SystemLogEvent.AdminAuthorizationDenied,
      actor: { userId: 7, username: "operator" },
      action: "admin.organizationResponsibility.createAssignment",
      resourceType: "organizationResponsibilityAssignment",
      resourceIdentifier: "create-request",
      reasonCode: "ACTION_NOT_GRANTED",
    }, "admin mutation authorization denied");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("999");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("OUTSIDE_SECRET");
  });

  test("projects the complete Organization action map from server-side state and integrity facts", async () => {
    const authorization = await createPolicy(hrScope)
      .getOrganizationAuthorization(actor(["iam:hr-admin"]));

    expect(authorization).toMatchObject({
      kind: "scoped",
      rootOrganizationIds: [10],
      organizationIds: [10, 11],
    });
    expect(authorization.getAllowedActions({
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.One,
      childrenCount: 1,
      employmentCount: 0,
      hasOpenResponsibilityAssignment: false,
      hasUnmanageableOpenResponsibilityAssignment: false,
    })).toEqual({
      createChild: { allowed: true, reason: null },
      edit: { allowed: true, reason: null },
      changeStatus: { allowed: true, reason: null },
      delete: { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" },
    });
    expect(authorization.getAllowedActions({
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.Five,
      childrenCount: 0,
      employmentCount: 1,
      hasOpenResponsibilityAssignment: true,
      hasUnmanageableOpenResponsibilityAssignment: false,
    })).toEqual({
      createChild: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      edit: { allowed: true, reason: null },
      changeStatus: { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" },
      delete: { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" },
    });
    expect(authorization.getAllowedActions({
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.Three,
      childrenCount: 0,
      employmentCount: 0,
      hasOpenResponsibilityAssignment: true,
      hasUnmanageableOpenResponsibilityAssignment: true,
    })).toMatchObject({
      changeStatus: {
        allowed: false,
        reason: "UNMANAGEABLE_RESPONSIBILITY_BLOCKED",
      },
      delete: {
        allowed: false,
        reason: "UNMANAGEABLE_RESPONSIBILITY_BLOCKED",
      },
    });
  });

  test("logs an out-of-scope Organization mutation and conceals existence as 404", async () => {
    const warn = mock();
    const policy = createAdminAuthorizationPolicy({
      logger: { warn },
      hrAdministrationScopeResolver: {
        resolveForActor: async () => hrScope,
      },
    });
    const authorization = await policy.getOrganizationAuthorization(
      actor(["iam:hr-admin"]),
    );

    let failure: unknown;
    try {
      authorization.denyMutation({
        operationId: "admin.organization.delete",
        resourceIdentifier: "OTHER",
        reason: "RESOURCE_OUT_OF_SCOPE",
        concealExistence: true,
      });
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ httpStatus: 404 });
    expect(warn).toHaveBeenCalledWith({
      event: SystemLogEvent.AdminAuthorizationDenied,
      actor: { userId: 7, username: "operator" },
      action: "admin.organization.delete",
      resourceType: "organization",
      resourceIdentifier: "OTHER",
      reasonCode: "RESOURCE_OUT_OF_SCOPE",
    }, "admin mutation authorization denied");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("organizationIds");
  });

  test("classifies Role Assignment denials as assignment resources", () => {
    expect(ADMIN_OPERATION_REGISTRY["admin.role.assignments.create"].resourceType)
      .toBe("roleAssignment");
    expect(ADMIN_OPERATION_REGISTRY["admin.role.assignments.updateScope"].resourceType)
      .toBe("roleAssignment");
    expect(ADMIN_OPERATION_REGISTRY["admin.role.assignments.delete"].resourceType)
      .toBe("roleAssignment");
  });
});
