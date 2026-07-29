import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type {
  AdminLoginRestrictionState,
  AdminSessionControlSummary,
  AdminSessionInventoryItem,
  AdminSessionManagementServiceDeps,
  AdminSessionUserSummary,
} from "./session-management.port";
import type {
  AdminLoginRestrictionListInput,
  AdminLoginRestrictionListItem,
  AdminLoginRestrictionListResult,
  AdminLoginRestrictionReleaseInput,
  AdminLoginRestrictionReleaseResult,
  AdminSessionAccountStatusValue,
  AdminSessionActorContext,
  AdminSessionAuthMethodValue,
  AdminSessionListInput,
  AdminSessionListItem,
  AdminSessionListResult,
  AdminSessionOriginSummary,
  AdminSessionRevokeInput,
  AdminSessionRevokeResult,
} from "./session-management.type";
import {
  buildAdminLoginRestrictionReleaseAudit,
  buildAdminSessionRevokeAudit,
  buildAdminSessionRevokeUserAudit,
} from "@admin-api/services/audit/events/session-management.audit";
import { SystemLogEvent } from "@iam/api-core/logger";
import { UserStatus } from "@iam/contracts";
import {
  AdminLoginStateAuditFailedAfterEffectError,
  AdminLoginStateAuditFailedError,
  AdminLoginStateUnavailableError,
  AdminSessionCurrentProtectedError,
} from "./session-management.error";
import {
  AdminLoginRestrictionCause,
  AdminLoginRestrictionTriggerMethod,
  AdminSessionAccountStatus,
  AdminSessionAuthMethod,
  AdminSessionBrowser,
  AdminSessionDeviceType,
  AdminSessionOperatingSystem,
} from "./session-management.type";

export function createSessionManagementService(deps: AdminSessionManagementServiceDeps) {
  async function rejectProtectedRevoke(audit: AuditLogInput): Promise<never> {
    try {
      await deps.audit.recordAuditLog(audit);
    }
    catch (cause) {
      throw new AdminLoginStateAuditFailedError(cause);
    }
    throw new AdminSessionCurrentProtectedError();
  }

  async function recordMutationAudit(input: {
    audit: AuditLogInput;
    changed: boolean;
    auditContext: AdminAuditContext;
    actorUserIdFallback: number | null;
    logFields: Record<string, unknown>;
  }) {
    try {
      await deps.audit.recordAuditLog(input.audit);
    }
    catch (cause) {
      if (!input.changed)
        throw new AdminLoginStateAuditFailedError(cause);
      deps.logger.error({
        event: SystemLogEvent.AdminLoginStateAuditFailedAfterEffect,
        sourceApp: "iam-admin-api",
        requestId: input.auditContext.requestId ?? null,
        traceId: input.auditContext.traceId ?? null,
        actorUserId:
          input.auditContext.actorUserId ?? input.actorUserIdFallback,
        ...input.logFields,
        changed: input.changed,
        err: cause,
      }, "admin login state audit failed after effect");
      throw new AdminLoginStateAuditFailedAfterEffectError(cause);
    }
  }

  async function revokeSessions(
    input: AdminSessionRevokeInput,
    actor: AdminSessionActorContext,
    auditContext: AdminAuditContext,
  ): Promise<AdminSessionRevokeResult> {
    const currentPrincipalSessionId = actor.principalSessionId?.trim() || null;

    if (input.target.type === "user") {
      const isCurrentUser = input.target.userId === actor.actorUserId;
      const exceptPrincipalSessionId = isCurrentUser
        ? currentPrincipalSessionId
        : undefined;
      if (exceptPrincipalSessionId === null) {
        const result = emptySessionRevokeResult("user");
        return rejectProtectedRevoke(
          buildAdminSessionRevokeUserAudit({
            userId: input.target.userId,
            outcome: "failure",
            result,
            currentPrincipalSessionProtected: true,
          }, auditContext),
        );
      }

      let summary: AdminSessionControlSummary;
      try {
        summary = await deps.userControl.revokeUserSessions({
          userId: input.target.userId,
          reason: "admin_revoke",
          ...(exceptPrincipalSessionId
            ? { exceptPrincipalSessionId }
            : {}),
          auditContext,
        });
      }
      catch (cause) {
        throw new AdminLoginStateUnavailableError(cause);
      }
      const result = toSessionRevokeResult(
        summary,
        "user",
        exceptPrincipalSessionId !== undefined,
      );
      await recordMutationAudit({
        audit: buildAdminSessionRevokeUserAudit({
          userId: input.target.userId,
          outcome: "success",
          result,
        }, auditContext),
        changed: result.changed,
        auditContext,
        actorUserIdFallback: actor.actorUserId,
        logFields: {
          targetScope: result.scope,
          targetUserId: input.target.userId,
          revoked: result.revoked,
          cleanup: result.cleanup,
        },
      });
      return result;
    }

    if (
      currentPrincipalSessionId === null
      || input.target.principalSessionId === currentPrincipalSessionId
    ) {
      const result = emptySessionRevokeResult("session");
      return rejectProtectedRevoke(
        buildAdminSessionRevokeAudit({
          principalSessionId: input.target.principalSessionId,
          outcome: "failure",
          result,
          currentPrincipalSessionProtected: true,
        }, auditContext),
      );
    }

    let summary: AdminSessionControlSummary;
    try {
      summary = await deps.control.revokePrincipalSession(
        input.target.principalSessionId,
        "admin_revoke",
      );
    }
    catch (cause) {
      throw new AdminLoginStateUnavailableError(cause);
    }
    const result = toSessionRevokeResult(summary, "session");
    await recordMutationAudit({
      audit: buildAdminSessionRevokeAudit({
        principalSessionId: input.target.principalSessionId,
        outcome: "success",
        result,
      }, auditContext),
      changed: result.changed,
      auditContext,
      actorUserIdFallback: actor.actorUserId,
      logFields: {
        targetScope: result.scope,
        targetPrincipalSessionId: input.target.principalSessionId,
        revoked: result.revoked,
        cleanup: result.cleanup,
      },
    });
    return result;
  }

  async function listSessions(
    input: AdminSessionListInput,
    actor: AdminSessionActorContext,
  ): Promise<AdminSessionListResult> {
    let inventory;
    try {
      inventory = await deps.inventory.listPrincipalSessions({
        offset: (input.pageNum - 1) * input.pageSize,
        limit: input.pageSize,
        userId: input.userId === undefined ? undefined : String(input.userId),
      });
    }
    catch (cause) {
      throw new AdminLoginStateUnavailableError(cause);
    }
    const userIds = uniqueNumericUserIds(inventory.items);
    const userSummaries = userIds.length === 0
      ? []
      : await deps.users.getSessionManagementUserSummaries(userIds);
    const usersById = new Map(userSummaries.map(user => [user.id, user]));

    return {
      result: inventory.items.map(item => toAdminSessionListItem(item, usersById, actor)),
      total: inventory.total,
      pageNum: input.pageNum,
      pageSize: input.pageSize,
      pages: inventory.total === 0 ? 0 : Math.ceil(inventory.total / input.pageSize),
    };
  }

  async function listLoginRestrictions(
    input: AdminLoginRestrictionListInput,
  ): Promise<AdminLoginRestrictionListResult> {
    let inventory;
    try {
      inventory = await deps.loginRestrictions.listRestrictions({
        offset: (input.pageNum - 1) * input.pageSize,
        limit: input.pageSize,
        userId: input.userId,
      });
    }
    catch (cause) {
      throw new AdminLoginStateUnavailableError(cause);
    }
    const userIds = [...new Set(inventory.items.map(item => item.userId))];
    const userSummaries = userIds.length === 0
      ? []
      : await deps.users.getSessionManagementUserSummaries(userIds);
    const usersById = new Map(userSummaries.map(user => [user.id, user]));

    return {
      result: inventory.items.map(item => toAdminLoginRestrictionListItem(item, usersById)),
      total: inventory.total,
      pageNum: input.pageNum,
      pageSize: input.pageSize,
      pages: inventory.total === 0 ? 0 : Math.ceil(inventory.total / input.pageSize),
    };
  }

  async function releaseLoginRestriction(
    input: AdminLoginRestrictionReleaseInput,
    auditContext: AdminAuditContext,
  ): Promise<AdminLoginRestrictionReleaseResult> {
    let transition;
    try {
      transition = await deps.loginRestrictions.clearLoginState(input.userId);
    }
    catch (cause) {
      throw new AdminLoginStateUnavailableError(cause);
    }
    const result: AdminLoginRestrictionReleaseResult = {
      changed: transition.changed,
      failureStateCleared: transition.failureStateCleared,
    };

    await recordMutationAudit({
      audit: buildAdminLoginRestrictionReleaseAudit({
        userId: input.userId,
        outcome: "success",
        result,
        triggerMethod: transition.restriction?.triggerMethod ?? null,
      }, auditContext),
      changed: result.changed,
      auditContext,
      actorUserIdFallback: null,
      logFields: {
        targetScope: "login_restriction",
        targetUserId: input.userId,
        cause: transition.restriction?.cause
          ?? AdminLoginRestrictionCause.TooManyLoginFailures,
        triggerMethod: transition.restriction?.triggerMethod
          ?? AdminLoginRestrictionTriggerMethod.Unknown,
        failureStateCleared: result.failureStateCleared,
      },
    });

    return result;
  }

  return {
    listLoginRestrictions,
    listSessions,
    releaseLoginRestriction,
    revokeSessions,
  };
}

export type SessionManagementService = ReturnType<typeof createSessionManagementService>;

function toAdminSessionListItem(
  item: AdminSessionInventoryItem,
  usersById: ReadonlyMap<number, AdminSessionUserSummary>,
  actor: AdminSessionActorContext,
): AdminSessionListItem {
  const numericUserId = parseNumericUserId(item.principal.subjectId);
  const user = numericUserId === null ? undefined : usersById.get(numericUserId);

  return {
    principalSessionId: item.principalSessionId,
    user: {
      id: numericUserId,
      subjectId: item.principal.subjectId,
      username: user?.username ?? null,
      name: user?.name ?? null,
      accountStatus: toAccountStatus(user),
    },
    authMethods: normalizeAuthMethods(item.amr),
    authTime: item.authTime,
    expiresAt: item.expiresAt,
    origin: summarizeOrigin(item.origin),
    isCurrentSession: actor.principalSessionId === item.principalSessionId,
    isCurrentUser: String(actor.actorUserId) === item.principal.subjectId,
  };
}

function toAdminLoginRestrictionListItem(
  item: AdminLoginRestrictionState,
  usersById: ReadonlyMap<number, AdminSessionUserSummary>,
): AdminLoginRestrictionListItem {
  const user = usersById.get(item.userId);
  return {
    user: {
      id: item.userId,
      username: user?.username ?? null,
      name: user?.name ?? null,
      accountStatus: toAccountStatus(user),
    },
    cause: item.cause,
    triggerMethod: item.triggerMethod,
    restrictedUntil: item.restrictedUntil,
    remainingSeconds: item.remainingSeconds,
  };
}

function uniqueNumericUserIds(items: readonly AdminSessionInventoryItem[]) {
  const userIds = new Set<number>();
  for (const item of items) {
    const userId = parseNumericUserId(item.principal.subjectId);
    if (userId !== null)
      userIds.add(userId);
  }
  return [...userIds];
}

function parseNumericUserId(subjectId: string): number | null {
  if (!/^[1-9]\d*$/.test(subjectId))
    return null;
  const userId = Number(subjectId);
  return Number.isSafeInteger(userId) ? userId : null;
}

function toAccountStatus(user: AdminSessionUserSummary | undefined): AdminSessionAccountStatusValue {
  if (!user)
    return AdminSessionAccountStatus.Unknown;
  if (user.isDelete)
    return AdminSessionAccountStatus.Deleted;
  if (user.status === UserStatus.Enable)
    return AdminSessionAccountStatus.Normal;
  if (user.status === UserStatus.Pause)
    return AdminSessionAccountStatus.Paused;
  if (user.status === UserStatus.Disable)
    return AdminSessionAccountStatus.Ended;
  return AdminSessionAccountStatus.Unknown;
}

function normalizeAuthMethods(amr: readonly string[]): AdminSessionAuthMethodValue[] {
  const methods = new Set<AdminSessionAuthMethodValue>();
  for (const rawMethod of amr) {
    const method = rawMethod.trim().toLowerCase();
    if (method === "pwd")
      methods.add(AdminSessionAuthMethod.Password);
    else if (method === "sms")
      methods.add(AdminSessionAuthMethod.Mobile);
    else if (method === "oa")
      methods.add(AdminSessionAuthMethod.Oa);
    else if (method === "wechat")
      methods.add(AdminSessionAuthMethod.Wechat);
    else
      methods.add(AdminSessionAuthMethod.Unknown);
  }
  return methods.size === 0 ? [AdminSessionAuthMethod.Unknown] : [...methods];
}

function summarizeOrigin(
  origin: AdminSessionInventoryItem["origin"],
): AdminSessionOriginSummary | null {
  if (!origin)
    return null;
  const userAgent = origin.userAgent?.toLowerCase() ?? "";

  return {
    ip: origin.ip ?? null,
    deviceType: classifyDeviceType(userAgent),
    operatingSystem: classifyOperatingSystem(userAgent),
    browser: classifyBrowser(userAgent),
  };
}

function classifyDeviceType(userAgent: string) {
  if (!userAgent)
    return AdminSessionDeviceType.Unknown;
  if (
    /ipad|tablet|kindle|playbook|silk/.test(userAgent)
    || (/android/.test(userAgent) && !/mobile/.test(userAgent))
  ) {
    return AdminSessionDeviceType.Tablet;
  }
  if (/iphone|ipod|mobile|android/.test(userAgent))
    return AdminSessionDeviceType.Mobile;
  if (/windows|macintosh|cros|x11|linux/.test(userAgent))
    return AdminSessionDeviceType.Desktop;
  return AdminSessionDeviceType.Unknown;
}

function classifyOperatingSystem(userAgent: string) {
  if (/iphone|ipad|ipod|cpu (?:iphone )?os/.test(userAgent))
    return AdminSessionOperatingSystem.Ios;
  if (/android/.test(userAgent))
    return AdminSessionOperatingSystem.Android;
  if (/windows/.test(userAgent))
    return AdminSessionOperatingSystem.Windows;
  if (/macintosh|mac os x/.test(userAgent))
    return AdminSessionOperatingSystem.Macos;
  if (/linux|x11/.test(userAgent))
    return AdminSessionOperatingSystem.Linux;
  return AdminSessionOperatingSystem.Unknown;
}

function classifyBrowser(userAgent: string) {
  if (/micromessenger/.test(userAgent))
    return AdminSessionBrowser.Wechat;
  if (/edg(?:e|a|ios)?\//.test(userAgent))
    return AdminSessionBrowser.Edge;
  if (/firefox|fxios/.test(userAgent))
    return AdminSessionBrowser.Firefox;
  if (/chrome|crios/.test(userAgent))
    return AdminSessionBrowser.Chrome;
  if (/safari/.test(userAgent))
    return AdminSessionBrowser.Safari;
  return AdminSessionBrowser.Other;
}

function emptySessionRevokeResult(
  scope: AdminSessionRevokeResult["scope"],
): AdminSessionRevokeResult {
  return {
    changed: false,
    scope,
    revoked: {
      principalSessions: 0,
      bindings: 0,
      credentials: 0,
      artifacts: 0,
    },
    currentPrincipalSessionExcluded: false,
    cleanup: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
    },
  };
}

function toSessionRevokeResult(
  summary: AdminSessionControlSummary,
  scope: AdminSessionRevokeResult["scope"],
  currentPrincipalSessionExcluded = false,
): AdminSessionRevokeResult {
  const revoked = {
    principalSessions: summary.principalSessions.revoked,
    bindings: summary.bindings.revoked,
    credentials: summary.credentials.revoked,
    artifacts: summary.artifacts.revoked,
  };
  return {
    changed: Object.values(revoked).some(count => count > 0),
    scope,
    revoked,
    currentPrincipalSessionExcluded,
    cleanup: {
      attempted: summary.cleanup.attempted,
      succeeded: summary.cleanup.succeeded,
      failed: summary.cleanup.failed,
    },
  };
}
