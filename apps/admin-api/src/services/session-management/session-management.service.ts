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
  buildAdminSessionBatchRevokeAudit,
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
    effectMayHaveOccurred?: boolean;
    auditContext: AdminAuditContext;
    actorUserIdFallback: number | null;
    logFields: Record<string, unknown>;
  }) {
    try {
      await deps.audit.recordAuditLog(input.audit);
    }
    catch (cause) {
      if (!input.changed && !input.effectMayHaveOccurred)
        throw new AdminLoginStateAuditFailedError(cause);
      deps.logger.error(
        {
          event: SystemLogEvent.AdminLoginStateAuditFailedAfterEffect,
          sourceApp: "iam-admin-api",
          requestId: input.auditContext.requestId ?? null,
          traceId: input.auditContext.traceId ?? null,
          actorUserId: input.auditContext.actorUserId ?? input.actorUserIdFallback,
          ...input.logFields,
          changed: input.changed,
          ...(input.effectMayHaveOccurred ? { effectMayHaveOccurred: true } : {}),
          err: cause,
        },
        "admin login state audit failed after effect",
      );
      throw new AdminLoginStateAuditFailedAfterEffectError(cause);
    }
  }

  async function revokeSessions(
    input: AdminSessionRevokeInput,
    actor: AdminSessionActorContext,
    auditContext: AdminAuditContext,
  ): Promise<AdminSessionRevokeResult> {
    const currentPrincipalSessionId = actor.principalSessionId?.trim() || null;

    if (input.target.type === "captured") {
      if (!currentPrincipalSessionId || !deps.control.executeCapturedSessions)
        throw new AdminSessionCurrentProtectedError();
      const summary = await deps.control.executeCapturedSessions(
        input.target.targets,
        currentPrincipalSessionId,
      );
      const result = toSessionRevokeResult(summary, "session");
      await recordMutationAudit({
        audit: buildAdminSessionBatchRevokeAudit(
          {
            outcome:
              "sessions" in result.result
              && (result.result.sessions.failed > 0 || result.result.sessions.unknown > 0)
                ? "failure"
                : "success",
            result,
          },
          auditContext,
        ),
        changed: result.changed,
        effectMayHaveOccurred: "sessions" in result.result && result.result.sessions.unknown > 0,
        auditContext,
        actorUserIdFallback: actor.actorUserId,
        logFields: {
          targetScope: "captured",
          ...("sessions" in result.result ? { sessions: result.result.sessions } : {}),
        },
      });
      return result;
    }

    if (input.target.type === "user") {
      const isCurrentUser = input.target.userId === actor.actorUserId;
      const exceptPrincipalSessionId = isCurrentUser ? currentPrincipalSessionId : undefined;
      if (exceptPrincipalSessionId === null) {
        const result = emptySessionRevokeResult("user");
        return rejectProtectedRevoke(
          buildAdminSessionRevokeUserAudit(
            {
              userId: input.target.userId,
              outcome: "failure",
              result,
              currentPrincipalSessionProtected: true,
            },
            auditContext,
          ),
        );
      }

      const [targetUser] = await deps.users.getSessionManagementUserSummaries([input.target.userId]);
      if (targetUser === undefined) {
        const result = emptySessionRevokeResult("user");
        await recordMutationAudit({
          audit: buildAdminSessionRevokeUserAudit(
            {
              userId: input.target.userId,
              outcome: "success",
              result,
            },
            auditContext,
          ),
          changed: false,
          auditContext,
          actorUserIdFallback: actor.actorUserId,
          logFields: {
            targetScope: result.result.scope,
            targetUserId: input.target.userId,
            sessions: result.result.sessions,
          },
        });
        return result;
      }

      let summary: AdminSessionControlSummary;
      try {
        summary = await deps.userControl.revokeUserSessions({
          userId: input.target.userId,
          subjectIdentifier: targetUser.subjectIdentifier,
          reason: "admin_revoke",
          ...(exceptPrincipalSessionId ? { exceptPrincipalSessionId } : {}),
          auditContext,
        });
      }
      catch (cause) {
        throw new AdminLoginStateUnavailableError(cause);
      }
      const result = toSessionRevokeResult(summary, "user", exceptPrincipalSessionId !== undefined);
      await recordMutationAudit({
        audit: buildAdminSessionRevokeUserAudit(
          {
            userId: input.target.userId,
            outcome:
              "sessions" in result.result
              && (result.result.sessions.failed > 0 || result.result.sessions.unknown > 0)
                ? "failure"
                : "success",
            result,
          },
          auditContext,
        ),
        changed: result.changed,
        effectMayHaveOccurred: "sessions" in result.result && result.result.sessions.unknown > 0,
        auditContext,
        actorUserIdFallback: actor.actorUserId,
        logFields: {
          targetScope: result.result.scope,
          targetUserId: input.target.userId,
          sessions: result.result.sessions,
        },
      });
      return result;
    }

    if (currentPrincipalSessionId === null || input.target.principalSessionId === currentPrincipalSessionId) {
      const result = emptySessionRevokeResult("session");
      return rejectProtectedRevoke(
        buildAdminSessionRevokeAudit(
          {
            principalSessionId: input.target.principalSessionId,
            outcome: "failure",
            result,
            currentPrincipalSessionProtected: true,
          },
          auditContext,
        ),
      );
    }

    let summary: AdminSessionControlSummary;
    try {
      summary = await deps.control.revokePrincipalSession(input.target.principalSessionId, "admin_revoke");
    }
    catch (cause) {
      throw new AdminLoginStateUnavailableError(cause);
    }
    const result = toSessionRevokeResult(summary, "session");
    await recordMutationAudit({
      audit: buildAdminSessionRevokeAudit(
        {
          principalSessionId: input.target.principalSessionId,
          outcome:
            "sessions" in result.result
            && (result.result.sessions.failed > 0 || result.result.sessions.unknown > 0)
              ? "failure"
              : "success",
          result,
        },
        auditContext,
      ),
      changed: result.changed,
      effectMayHaveOccurred: "sessions" in result.result && result.result.sessions.unknown > 0,
      auditContext,
      actorUserIdFallback: actor.actorUserId,
      logFields: {
        targetScope: result.result.scope,
        targetPrincipalSessionId: input.target.principalSessionId,
        sessions: result.result.sessions,
      },
    });
    return result;
  }

  async function listSessions(
    input: AdminSessionListInput,
    actor: AdminSessionActorContext,
  ): Promise<AdminSessionListResult> {
    const filteredUser
      = input.userId === undefined
        ? undefined
        : (await deps.users.getSessionManagementUserSummaries([input.userId]))[0];
    if (input.userId !== undefined && filteredUser === undefined) {
      return {
        result: [],
        total: 0,
        pageNum: input.pageNum,
        pageSize: input.pageSize,
        pages: 0,
      };
    }

    let inventory;
    try {
      inventory = await deps.inventory.listPrincipalSessions({
        offset: (input.pageNum - 1) * input.pageSize,
        limit: input.pageSize,
        subjectIdentifier: filteredUser?.subjectIdentifier,
        kind: input.kind,
      });
    }
    catch (cause) {
      throw new AdminLoginStateUnavailableError(cause);
    }
    const subjectIdentifiers = uniqueSubjectIdentifiers(inventory.items);
    const userSummaries
      = subjectIdentifiers.length === 0
        ? []
        : await deps.users.getSessionManagementUserSummariesBySubjectIdentifiers(subjectIdentifiers);
    const usersBySubjectIdentifier = new Map(userSummaries.map(user => [user.subjectIdentifier, user]));

    return {
      result: inventory.items.map(item => toAdminSessionListItem(item, usersBySubjectIdentifier, actor)),
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
    const userSummaries
      = userIds.length === 0 ? [] : await deps.users.getSessionManagementUserSummaries(userIds);
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
      result: { failureStateCleared: transition.failureStateCleared },
    };

    await recordMutationAudit({
      audit: buildAdminLoginRestrictionReleaseAudit(
        {
          userId: input.userId,
          outcome: "success",
          result,
          triggerMethod: transition.restriction?.triggerMethod ?? null,
        },
        auditContext,
      ),
      changed: result.changed,
      auditContext,
      actorUserIdFallback: null,
      logFields: {
        targetScope: "login_restriction",
        targetUserId: input.userId,
        cause: transition.restriction?.cause ?? AdminLoginRestrictionCause.TooManyLoginFailures,
        triggerMethod: transition.restriction?.triggerMethod ?? AdminLoginRestrictionTriggerMethod.Unknown,
        failureStateCleared: result.result.failureStateCleared,
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
  usersBySubjectIdentifier: ReadonlyMap<string, AdminSessionUserSummary>,
  actor: AdminSessionActorContext,
): AdminSessionListItem {
  const user = usersBySubjectIdentifier.get(item.principal.subjectId);

  return {
    principalSessionId: item.principalSessionId,
    ...(item.record ? { record: item.record } : {}),
    user: {
      id: user?.id ?? null,
      subjectId: item.principal.subjectId,
      username: user?.username ?? null,
      name: user?.name ?? null,
      accountStatus: toAccountStatus(user),
    },
    authMethods: normalizeAuthMethods(item.amr),
    authTime: item.authTime,
    expiresAt: item.expiresAt,
    origin: summarizeOrigin(item.origin),
    isCurrentSession:
      item.record?.kind !== "clientSession" && actor.principalSessionId === item.principalSessionId,
    isCurrentUser: user?.id === actor.actorUserId,
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

function uniqueSubjectIdentifiers(items: readonly AdminSessionInventoryItem[]) {
  return [...new Set(items.map(item => item.principal.subjectId))];
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
    else methods.add(AdminSessionAuthMethod.Unknown);
  }
  return methods.size === 0 ? [AdminSessionAuthMethod.Unknown] : [...methods];
}

function summarizeOrigin(origin: AdminSessionInventoryItem["origin"]): AdminSessionOriginSummary | null {
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
  scope: AdminSessionRevokeResult["result"]["scope"],
): AdminSessionRevokeResult {
  return toSessionRevokeResult(
    { sessions: { userSessionsTerminated: 0, clientSessionsTerminated: 0, results: [], unfinished: [] } },
    scope,
  );
}

function toSessionRevokeResult(
  summary: AdminSessionControlSummary,
  scope: AdminSessionRevokeResult["result"]["scope"],
  currentPrincipalSessionExcluded = false,
): AdminSessionRevokeResult {
  return {
    changed: summary.sessions.userSessionsTerminated > 0 || summary.sessions.clientSessionsTerminated > 0,
    result: {
      scope,
      generation: "unified",
      currentPrincipalSessionExcluded:
        currentPrincipalSessionExcluded
        || summary.sessions.results.some(result => result.status === "excluded"),
      sessions: {
        userSessionsTerminated: summary.sessions.userSessionsTerminated,
        clientSessionsTerminated: summary.sessions.clientSessionsTerminated,
        excluded: summary.sessions.results.filter(result => result.status === "excluded").length,
        failed: summary.sessions.results.filter(result => result.status === "failed").length,
        unknown: summary.sessions.results.filter(result => result.status === "unknown").length,
      },
      batch: { results: summary.sessions.results, unfinished: summary.sessions.unfinished },
      artifactCleanup: { attempted: 0, succeeded: 0, failed: 0 },
    },
  };
}
