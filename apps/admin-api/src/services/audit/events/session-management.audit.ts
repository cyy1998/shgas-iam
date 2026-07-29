import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type {
  AdminLoginRestrictionReleaseResult,
  AdminLoginRestrictionTriggerMethodValue,
  AdminSessionRevokeResult,
} from "@admin-api/services/session-management/session-management.type";
import {
  AdminLoginRestrictionCause,
  AdminLoginRestrictionTriggerMethod,
} from "@admin-api/services/session-management/session-management.type";

interface BuildAdminSessionRevokeAuditBaseInput {
  outcome: "success" | "failure";
  result: AdminSessionRevokeResult;
  currentPrincipalSessionProtected?: boolean;
}

export interface BuildAdminSessionRevokeAuditInput
  extends BuildAdminSessionRevokeAuditBaseInput {
  principalSessionId: string;
}

export function buildAdminSessionRevokeAudit(
  input: BuildAdminSessionRevokeAuditInput,
  auditContext: AdminAuditContext,
): AuditLogInput {
  return {
    ...buildSafeAdminSessionRevokeAuditFields(input, auditContext),
    action: "admin.session.revoke",
    targetType: "principal_session",
    targetCode: input.principalSessionId,
  };
}

export interface BuildAdminSessionRevokeUserAuditInput
  extends BuildAdminSessionRevokeAuditBaseInput {
  userId: number;
}

export function buildAdminSessionRevokeUserAudit(
  input: BuildAdminSessionRevokeUserAuditInput,
  auditContext: AdminAuditContext,
): AuditLogInput {
  return {
    ...buildSafeAdminSessionRevokeAuditFields(input, auditContext),
    action: "admin.session.revoke_user",
    targetType: "user",
    targetId: input.userId,
  };
}

export interface BuildAdminLoginRestrictionReleaseAuditInput {
  userId: number;
  outcome: "success";
  result: AdminLoginRestrictionReleaseResult;
  triggerMethod: AdminLoginRestrictionTriggerMethodValue | null;
}

export function buildAdminLoginRestrictionReleaseAudit(
  input: BuildAdminLoginRestrictionReleaseAuditInput,
  auditContext: AdminAuditContext,
): AuditLogInput {
  return {
    ...toSafeAdminSessionManagementAuditContext(auditContext),
    action: "admin.login_restriction.release",
    outcome: input.outcome,
    targetType: "user",
    targetId: input.userId,
    details: {
      cause: AdminLoginRestrictionCause.TooManyLoginFailures,
      triggerMethod: input.triggerMethod ?? AdminLoginRestrictionTriggerMethod.Unknown,
      changed: input.result.changed,
      failureStateCleared: input.result.failureStateCleared,
    },
  };
}

function buildSafeAdminSessionRevokeAuditFields(
  input: BuildAdminSessionRevokeAuditBaseInput,
  auditContext: AdminAuditContext,
) {
  return {
    ...toSafeAdminSessionManagementAuditContext(auditContext),
    outcome: input.outcome,
    details: {
      scope: input.result.scope,
      changed: input.result.changed,
      revoked: { ...input.result.revoked },
      currentPrincipalSessionExcluded: input.result.currentPrincipalSessionExcluded,
      ...(input.currentPrincipalSessionProtected
        ? { currentPrincipalSessionProtected: true }
        : {}),
      cleanupFailedCount: input.result.cleanup.failed,
    },
  };
}

function toSafeAdminSessionManagementAuditContext(auditContext: AdminAuditContext) {
  const {
    action: _action,
    details: _details,
    outcome: _outcome,
    principalSessionId: _principalSessionId,
    targetCode: _targetCode,
    targetId: _targetId,
    targetName: _targetName,
    targetType: _targetType,
    ...safeContext
  } = auditContext;
  return safeContext;
}
