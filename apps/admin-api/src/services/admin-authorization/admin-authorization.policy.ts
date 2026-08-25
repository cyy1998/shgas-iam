import type {
  AdminAuthorizationDecision,
  AdminAuthorizationReasonCode,
  AdminCapabilitySummary,
  AdminEmploymentAllowedActions,
  AdminOrganizationAllowedActions,
  AdminUserAllowedActions,
} from "@iam/contracts";
import type {
  AdminEmploymentActionFacts,
  AdminEmploymentAuthorization,
  AdminEmploymentMutationDenial,
} from "./admin-employment-authorization.type";
import type { AdminOperationId } from "./admin-operation.registry";
import type {
  AdminOrganizationActionFacts,
  AdminOrganizationAuthorization,
  AdminOrganizationMutationDenial,
} from "./admin-organization-authorization.type";
import type {
  AdminUserActionFacts,
  AdminUserAuthorization,
  AdminUserMutationDenial,
} from "./admin-user-authorization.type";
import type {
  HrAdministrationScope,
  HrAdministrationScopeResolver,
} from "./hr-administration-scope.resolver";
import { AuthzForbiddenError } from "@iam/api-core/errors/AuthzForbiddenError";
import { SystemLogEvent } from "@iam/api-core/logger";
import { ADMIN_MODULE_CODES, EmploymentStatus, OrganizationLevel as OrganizationLevelValue, OrganizationStatus as OrganizationStatusValue, UserStatus } from "@iam/contracts";
import { EmploymentNotFoundError } from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { ADMIN_OPERATION_REGISTRY } from "./admin-operation.registry";

export interface AdminAuthorizationActor {
  userId: number;
  username: string;
  roles: readonly string[];
}

export interface AdminOperationAuthorization {
  hrAdministrationScope: HrAdministrationScope | null;
}

interface AdminAuthorizationLogger {
  warn: (fields: Record<string, unknown>, message: string) => void;
}

export interface CreateAdminAuthorizationPolicyDeps {
  logger: AdminAuthorizationLogger;
  hrAdministrationScopeResolver: HrAdministrationScopeResolver;
}

const FULL_ADMIN_ROLE_CODE = "iam:admin";
const HR_USER_PROFILE_UPDATE_FIELDS = new Set([
  "name",
  "mobile",
  "wxId",
  "userType",
]);
const HR_ADMIN_OPERATION_IDS = new Set<string>([
  "admin.authorization.capabilitySummary",
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
  "admin.position.search",
  "admin.position.detail",
]);

const allowedDecision = {
  allowed: true,
  reason: null,
} as const satisfies AdminAuthorizationDecision;

const actionNotGrantedDecision = {
  allowed: false,
  reason: "ACTION_NOT_GRANTED",
} as const satisfies AdminAuthorizationDecision;

function hasForbiddenHrUserProfileField(operationInput: unknown) {
  if (operationInput === null || typeof operationInput !== "object" || Array.isArray(operationInput))
    return false;
  const input = operationInput as Record<string, unknown>;
  const patch = Object.hasOwn(input, "data")
    ? input.data
    : Object.hasOwn(input, "body")
      ? input.body
      : undefined;
  if (patch === null || typeof patch !== "object" || Array.isArray(patch))
    return false;
  return Object.keys(patch).some(key => !HR_USER_PROFILE_UPDATE_FIELDS.has(key));
}

function userAllowedActions(
  decision: AdminAuthorizationDecision,
): AdminUserAllowedActions {
  return {
    editProfile: decision,
    resetPassword: decision,
    changeStatus: decision,
    delete: decision,
    resign: decision,
  };
}

function scopedUserAllowedActions(
  facts: AdminUserActionFacts,
  organizationIds: readonly number[],
): AdminUserAllowedActions {
  const userNotHrManagedDecision = {
    allowed: false,
    reason: "USER_NOT_HR_MANAGED",
  } as const satisfies AdminAuthorizationDecision;
  const userNotEnabledDecision = {
    allowed: false,
    reason: "USER_NOT_ENABLED",
  } as const satisfies AdminAuthorizationDecision;
  const userHasOutOfScopeOpenEmploymentDecision = {
    allowed: false,
    reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
  } as const satisfies AdminAuthorizationDecision;
  const isHrManaged = !facts.isDelete
    && facts.openEmploymentOrganizationIds.some(id => organizationIds.includes(id));
  const editProfile = isHrManaged ? allowedDecision : userNotHrManagedDecision;
  const resetPassword = !isHrManaged
    ? userNotHrManagedDecision
    : facts.status === UserStatus.Enable
      ? allowedDecision
      : userNotEnabledDecision;
  const changeStatus = !isHrManaged
    ? userNotHrManagedDecision
    : facts.openEmploymentOrganizationIds.every(id => organizationIds.includes(id))
      ? allowedDecision
      : userHasOutOfScopeOpenEmploymentDecision;
  const isCompletedResignation = !facts.isDelete
    && facts.status === UserStatus.Disable
    && facts.openEmploymentOrganizationIds.length === 0
    && facts.endedEmploymentOrganizationIds.some(id => organizationIds.includes(id));
  const resign = isCompletedResignation
    ? allowedDecision
    : !isHrManaged
        ? userNotHrManagedDecision
        : facts.openEmploymentOrganizationIds.every(id => organizationIds.includes(id))
          ? allowedDecision
          : userHasOutOfScopeOpenEmploymentDecision;
  return {
    editProfile,
    resetPassword,
    changeStatus,
    delete: actionNotGrantedDecision,
    resign,
  };
}

function organizationAllowedActions(
  facts: AdminOrganizationActionFacts,
): AdminOrganizationAllowedActions {
  const stateNotActionableDecision = {
    allowed: false,
    reason: "RESOURCE_STATE_NOT_ACTIONABLE",
  } as const satisfies AdminAuthorizationDecision;
  const integrityGuardBlockedDecision = {
    allowed: false,
    reason: "INTEGRITY_GUARD_BLOCKED",
  } as const satisfies AdminAuthorizationDecision;
  const integrityBlocked = facts.childrenCount > 0
    || facts.employmentCount > 0
    || facts.hasOpenResponsibilityAssignment;
  const lifecycleBlocked = facts.employmentCount > 0
    || facts.hasOpenResponsibilityAssignment;
  return {
    createChild: facts.status === OrganizationStatusValue.Enable
      && facts.level !== OrganizationLevelValue.Five
      ? allowedDecision
      : stateNotActionableDecision,
    edit: allowedDecision,
    changeStatus: facts.status === OrganizationStatusValue.Enable && lifecycleBlocked
      ? integrityGuardBlockedDecision
      : allowedDecision,
    delete: integrityBlocked ? integrityGuardBlockedDecision : allowedDecision,
  };
}

function employmentAllowedActions(
  facts: AdminEmploymentActionFacts,
): AdminEmploymentAllowedActions {
  const stateNotActionable = {
    allowed: false,
    reason: "RESOURCE_STATE_NOT_ACTIONABLE",
  } as const satisfies AdminAuthorizationDecision;
  const isOpen = facts.status !== EmploymentStatus.Disable;
  return {
    editDescription: isOpen ? allowedDecision : stateNotActionable,
    pause: facts.status === EmploymentStatus.Enable
      ? allowedDecision
      : stateNotActionable,
    resume: facts.status === EmploymentStatus.Pause
      ? allowedDecision
      : stateNotActionable,
    end: isOpen ? allowedDecision : stateNotActionable,
    transfer: isOpen ? allowedDecision : stateNotActionable,
    setPrimary: isOpen && !facts.isPrimary
      ? allowedDecision
      : stateNotActionable,
    clearPrimary: isOpen && facts.isPrimary
      ? allowedDecision
      : stateNotActionable,
  };
}

export function createAdminAuthorizationPolicy(
  deps: CreateAdminAuthorizationPolicyDeps,
) {
  function hasFullAdminCapability(actor: AdminAuthorizationActor) {
    return actor.roles.includes(FULL_ADMIN_ROLE_CODE);
  }

  function logMutationDenial(
    actor: AdminAuthorizationActor,
    input: {
      operationId: string;
      resourceType: string;
      resourceIdentifier: string | number | null;
      reason: AdminAuthorizationReasonCode;
    },
  ) {
    deps.logger.warn({
      event: SystemLogEvent.AdminAuthorizationDenied,
      actor: {
        userId: actor.userId,
        username: actor.username,
      },
      action: input.operationId,
      resourceType: input.resourceType,
      resourceIdentifier: input.resourceIdentifier,
      reasonCode: input.reason,
    }, "admin mutation authorization denied");
  }

  function createUserAuthorization(
    actor: AdminAuthorizationActor,
    scope: HrAdministrationScope | null,
  ): AdminUserAuthorization {
    const denyMutation = (input: AdminUserMutationDenial): never => {
      logMutationDenial(actor, { ...input, resourceType: "user" });
      throw new AuthzForbiddenError("无管理端操作权限");
    };
    return scope === null
      ? {
          kind: "full",
          organizationIds: null,
          getAllowedActions: () => userAllowedActions(allowedDecision),
          denyMutation,
        }
      : {
          kind: "scoped",
          organizationIds: scope.organizationIds,
          getAllowedActions: facts => scopedUserAllowedActions(
            facts,
            scope.organizationIds,
          ),
          denyMutation,
        };
  }

  async function getUserAuthorization(
    actor: AdminAuthorizationActor,
    resolvedScope?: HrAdministrationScope | null,
  ): Promise<AdminUserAuthorization> {
    if (hasFullAdminCapability(actor))
      return createUserAuthorization(actor, null);
    const scope = resolvedScope === undefined
      ? await deps.hrAdministrationScopeResolver.resolveForActor(actor.userId)
      : resolvedScope;
    if (scope === null)
      throw new AuthzForbiddenError("无管理端操作权限");
    return createUserAuthorization(actor, scope);
  }

  function createEmploymentAuthorization(
    actor: AdminAuthorizationActor,
    scope: HrAdministrationScope | null,
  ): AdminEmploymentAuthorization {
    const full = scope === null;
    const denyMutation = (input: AdminEmploymentMutationDenial): never => {
      logMutationDenial(actor, { ...input, resourceType: "employment" });
      if (input.concealExistence)
        throw new EmploymentNotFoundError();
      throw new AuthzForbiddenError("无管理端操作权限");
    };
    return full
      ? {
          kind: "full",
          rootOrganizationIds: null,
          organizationIds: null,
          getAllowedActions: employmentAllowedActions,
          denyMutation,
        }
      : {
          kind: "scoped",
          rootOrganizationIds: scope.rootOrganizationIds,
          organizationIds: scope.organizationIds,
          getAllowedActions: employmentAllowedActions,
          denyMutation,
        };
  }

  async function getEmploymentAuthorization(
    actor: AdminAuthorizationActor,
    resolvedScope?: HrAdministrationScope | null,
  ): Promise<AdminEmploymentAuthorization> {
    if (hasFullAdminCapability(actor))
      return createEmploymentAuthorization(actor, null);
    const scope = resolvedScope === undefined
      ? await deps.hrAdministrationScopeResolver.resolveForActor(actor.userId)
      : resolvedScope;
    if (scope === null)
      throw new AuthzForbiddenError("无管理端操作权限");
    return createEmploymentAuthorization(actor, scope);
  }

  function createOrganizationAuthorization(
    actor: AdminAuthorizationActor,
    scope: Awaited<ReturnType<HrAdministrationScopeResolver["resolveForActor"]>>,
  ): AdminOrganizationAuthorization {
    const denyMutation = (input: AdminOrganizationMutationDenial): never => {
      logMutationDenial(actor, { ...input, resourceType: "organization" });
      if (input.concealExistence)
        throw new OrganizationNotFoundError();
      throw new AuthzForbiddenError("无管理端操作权限");
    };
    return scope === null
      ? {
          kind: "full",
          rootOrganizationIds: null,
          organizationIds: null,
          getAllowedActions: organizationAllowedActions,
          denyMutation,
        }
      : {
          kind: "scoped",
          rootOrganizationIds: scope.rootOrganizationIds,
          organizationIds: scope.organizationIds,
          getAllowedActions: organizationAllowedActions,
          denyMutation,
        };
  }

  async function getOrganizationAuthorization(
    actor: AdminAuthorizationActor,
  ): Promise<AdminOrganizationAuthorization> {
    if (hasFullAdminCapability(actor))
      return createOrganizationAuthorization(actor, null);
    const scope = await deps.hrAdministrationScopeResolver.resolveForActor(
      actor.userId,
    );
    if (scope === null)
      throw new AuthzForbiddenError("无管理端操作权限");
    return createOrganizationAuthorization(actor, scope);
  }

  async function evaluateOperation(input: {
    actor: AdminAuthorizationActor;
    operationId: AdminOperationId | string;
  }): Promise<
    | {
      decision: typeof allowedDecision;
      authorization: AdminOperationAuthorization;
    }
    | {
      decision: typeof actionNotGrantedDecision;
      authorization: null;
    }
  > {
    if (!Object.hasOwn(ADMIN_OPERATION_REGISTRY, input.operationId))
      return { decision: actionNotGrantedDecision, authorization: null };
    if (hasFullAdminCapability(input.actor)) {
      return {
        decision: allowedDecision,
        authorization: { hrAdministrationScope: null },
      };
    }
    if (!HR_ADMIN_OPERATION_IDS.has(input.operationId))
      return { decision: actionNotGrantedDecision, authorization: null };
    const scope = await deps.hrAdministrationScopeResolver.resolveForActor(
      input.actor.userId,
    );
    return scope === null
      ? { decision: actionNotGrantedDecision, authorization: null }
      : {
          decision: allowedDecision,
          authorization: { hrAdministrationScope: scope },
        };
  }

  async function decideOperation(input: {
    actor: AdminAuthorizationActor;
    operationId: AdminOperationId | string;
  }): Promise<AdminAuthorizationDecision> {
    return (await evaluateOperation(input)).decision;
  }

  async function getCapabilitySummary(
    actor: AdminAuthorizationActor,
  ): Promise<AdminCapabilitySummary> {
    if (hasFullAdminCapability(actor)) {
      return {
        visibleModules: [...ADMIN_MODULE_CODES],
        collectionActions: {
          user: { create: allowedDecision },
          employment: { create: allowedDecision },
          organization: { createRoot: allowedDecision },
          position: {
            create: allowedDecision,
            edit: allowedDecision,
            changeStatus: allowedDecision,
            delete: allowedDecision,
          },
        },
      };
    }
    const scope = await deps.hrAdministrationScopeResolver.resolveForActor(
      actor.userId,
    );
    const hasHrCapability = scope !== null;
    return {
      visibleModules: hasHrCapability ? ["user", "organization", "position", "employment"] : [],
      collectionActions: {
        user: { create: actionNotGrantedDecision },
        employment: { create: hasHrCapability ? allowedDecision : actionNotGrantedDecision },
        organization: { createRoot: actionNotGrantedDecision },
        position: {
          create: actionNotGrantedDecision,
          edit: actionNotGrantedDecision,
          changeStatus: actionNotGrantedDecision,
          delete: actionNotGrantedDecision,
        },
      },
    };
  }

  async function assertOperationAllowed(input: {
    actor: AdminAuthorizationActor;
    operationId: AdminOperationId | string;
    operationInput: unknown;
  }) {
    assertOperationInputAllowed(input);
    const evaluation = await evaluateOperation(input);
    if (evaluation.authorization !== null)
      return evaluation.authorization;

    const operation = Object.hasOwn(ADMIN_OPERATION_REGISTRY, input.operationId)
      ? ADMIN_OPERATION_REGISTRY[input.operationId as AdminOperationId]
      : undefined;
    if (operation?.type === "mutation") {
      logMutationDenial(input.actor, {
        operationId: input.operationId,
        resourceType: operation.resourceType,
        resourceIdentifier: operation.resourceIdentifier(input.operationInput),
        reason: evaluation.decision.reason,
      });
    }
    throw new AuthzForbiddenError("无管理端操作权限");
  }

  function assertOperationInputAllowed(input: {
    actor: AdminAuthorizationActor;
    operationId: AdminOperationId | string;
    operationInput: unknown;
  }) {
    if (
      hasFullAdminCapability(input.actor)
      || input.operationId !== "admin.user.update"
      || !hasForbiddenHrUserProfileField(input.operationInput)
    ) {
      return;
    }
    const operation = ADMIN_OPERATION_REGISTRY["admin.user.update"];
    logMutationDenial(input.actor, {
      operationId: input.operationId,
      resourceType: operation.resourceType,
      resourceIdentifier: operation.resourceIdentifier(input.operationInput),
      reason: actionNotGrantedDecision.reason,
    });
    throw new AuthzForbiddenError("无管理端操作权限");
  }

  return {
    assertOperationInputAllowed,
    assertOperationAllowed,
    decideOperation,
    getCapabilitySummary,
    getEmploymentAuthorization,
    getOrganizationAuthorization,
    getUserAuthorization,
  };
}

export type AdminAuthorizationPolicy = ReturnType<
  typeof createAdminAuthorizationPolicy
>;
