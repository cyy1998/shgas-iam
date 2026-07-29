import { apiClient } from '@admin/lib/api-client';
import type { AppRouter } from '@iam/admin-api/trpc';
import { ApiErrorCode } from '@iam/contracts';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type SessionManagementInputs =
  inferRouterInputs<AppRouter>['admin']['sessionManagement'];
type SessionManagementOutputs =
  inferRouterOutputs<AppRouter>['admin']['sessionManagement'];

export type SessionListInput = SessionManagementInputs['listSessions'];
export type SessionListResult = SessionManagementOutputs['listSessions'];
export type SessionListItem = SessionListResult['result'][number];
export type LoginRestrictionListInput =
  SessionManagementInputs['listLoginRestrictions'];
export type LoginRestrictionListResult =
  SessionManagementOutputs['listLoginRestrictions'];
export type LoginRestrictionListItem =
  LoginRestrictionListResult['result'][number];
export type LoginRestrictionReleaseInput =
  SessionManagementInputs['releaseLoginRestriction'];
export type LoginRestrictionReleaseResult =
  SessionManagementOutputs['releaseLoginRestriction'];
export type SessionRevokeInput = SessionManagementInputs['revokeSessions'];
export type SessionRevokeResult = SessionManagementOutputs['revokeSessions'];

export const SessionListErrorKind = {
  LoginStateUnavailable: 'login-state-unavailable',
  RequestFailed: 'request-failed',
} as const;

export type SessionListErrorKindValue =
  (typeof SessionListErrorKind)[keyof typeof SessionListErrorKind];

export class SessionListError extends Error {
  public readonly kind: SessionListErrorKindValue;

  constructor(kind: SessionListErrorKindValue, cause?: unknown) {
    super(
      kind === SessionListErrorKind.LoginStateUnavailable
        ? '登录状态服务暂时不可用'
        : '有效会话加载失败',
    );
    this.name = SessionListError.name;
    this.kind = kind;
    this.cause = cause;
  }
}

export const LoginRestrictionListErrorKind = {
  LoginStateUnavailable: 'login-state-unavailable',
  RequestFailed: 'request-failed',
} as const;

export type LoginRestrictionListErrorKindValue =
  (typeof LoginRestrictionListErrorKind)[keyof typeof LoginRestrictionListErrorKind];

export class LoginRestrictionListError extends Error {
  public readonly kind: LoginRestrictionListErrorKindValue;

  constructor(kind: LoginRestrictionListErrorKindValue, cause?: unknown) {
    super(
      kind === LoginRestrictionListErrorKind.LoginStateUnavailable
        ? '登录状态服务暂时不可用'
        : '临时登录限制加载失败',
    );
    this.name = LoginRestrictionListError.name;
    this.kind = kind;
    this.cause = cause;
  }
}

export const LoginRestrictionReleaseErrorKind = {
  AuditFailedAfterEffect: 'audit-failed-after-effect',
  LoginStateUnavailable: 'login-state-unavailable',
  RequestFailed: 'request-failed',
} as const;

export type LoginRestrictionReleaseErrorKindValue =
  (typeof LoginRestrictionReleaseErrorKind)[keyof typeof LoginRestrictionReleaseErrorKind];

export class LoginRestrictionReleaseError extends Error {
  public readonly kind: LoginRestrictionReleaseErrorKindValue;

  constructor(kind: LoginRestrictionReleaseErrorKindValue, cause?: unknown) {
    super(getLoginRestrictionReleaseErrorMessage(kind));
    this.name = LoginRestrictionReleaseError.name;
    this.kind = kind;
    this.cause = cause;
  }
}

export const SessionRevokeErrorKind = {
  AuditFailedAfterEffect: 'audit-failed-after-effect',
  CurrentSessionProtected: 'current-session-protected',
  LoginStateUnavailable: 'login-state-unavailable',
  RequestFailed: 'request-failed',
} as const;

export type SessionRevokeErrorKindValue =
  (typeof SessionRevokeErrorKind)[keyof typeof SessionRevokeErrorKind];

export class SessionRevokeError extends Error {
  public readonly kind: SessionRevokeErrorKindValue;

  constructor(kind: SessionRevokeErrorKindValue, cause?: unknown) {
    super(getSessionRevokeErrorMessage(kind));
    this.name = SessionRevokeError.name;
    this.kind = kind;
    this.cause = cause;
  }
}

export async function listSessions(input: SessionListInput) {
  try {
    return await apiClient.admin.sessionManagement.listSessions.query(input);
  } catch (error) {
    throw new SessionListError(
      getServiceCode(error) === ApiErrorCode.AdminLoginStateUnavailable
        ? SessionListErrorKind.LoginStateUnavailable
        : SessionListErrorKind.RequestFailed,
      error,
    );
  }
}

export async function listLoginRestrictions(input: LoginRestrictionListInput) {
  try {
    return await apiClient.admin.sessionManagement.listLoginRestrictions.query(
      input,
    );
  } catch (error) {
    throw new LoginRestrictionListError(
      getServiceCode(error) === ApiErrorCode.AdminLoginStateUnavailable
        ? LoginRestrictionListErrorKind.LoginStateUnavailable
        : LoginRestrictionListErrorKind.RequestFailed,
      error,
    );
  }
}

export async function releaseLoginRestriction(
  input: LoginRestrictionReleaseInput,
) {
  try {
    return await apiClient.admin.sessionManagement.releaseLoginRestriction.mutate(
      input,
    );
  } catch (error) {
    throw new LoginRestrictionReleaseError(
      toLoginRestrictionReleaseErrorKind(getServiceCode(error)),
      error,
    );
  }
}

export async function revokeSessions(input: SessionRevokeInput) {
  try {
    return await apiClient.admin.sessionManagement.revokeSessions.mutate(input);
  } catch (error) {
    throw new SessionRevokeError(
      toSessionRevokeErrorKind(getServiceCode(error)),
      error,
    );
  }
}

function getServiceCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as { data?: { serviceCode?: unknown } }).data?.serviceCode;
}

function toSessionRevokeErrorKind(
  serviceCode: unknown,
): SessionRevokeErrorKindValue {
  if (serviceCode === ApiErrorCode.AdminLoginStateAuditFailedAfterEffect)
    return SessionRevokeErrorKind.AuditFailedAfterEffect;
  if (serviceCode === ApiErrorCode.AdminSessionCurrentProtected)
    return SessionRevokeErrorKind.CurrentSessionProtected;
  if (serviceCode === ApiErrorCode.AdminLoginStateUnavailable)
    return SessionRevokeErrorKind.LoginStateUnavailable;
  return SessionRevokeErrorKind.RequestFailed;
}

function toLoginRestrictionReleaseErrorKind(
  serviceCode: unknown,
): LoginRestrictionReleaseErrorKindValue {
  if (serviceCode === ApiErrorCode.AdminLoginStateAuditFailedAfterEffect)
    return LoginRestrictionReleaseErrorKind.AuditFailedAfterEffect;
  if (serviceCode === ApiErrorCode.AdminLoginStateUnavailable)
    return LoginRestrictionReleaseErrorKind.LoginStateUnavailable;
  return LoginRestrictionReleaseErrorKind.RequestFailed;
}

function getSessionRevokeErrorMessage(kind: SessionRevokeErrorKindValue) {
  if (kind === SessionRevokeErrorKind.AuditFailedAfterEffect)
    return '操作可能已生效，但审计记录失败';
  if (kind === SessionRevokeErrorKind.CurrentSessionProtected)
    return '当前管理会话受保护';
  if (kind === SessionRevokeErrorKind.LoginStateUnavailable)
    return '登录状态服务暂时不可用';
  return '会话下线失败';
}

function getLoginRestrictionReleaseErrorMessage(
  kind: LoginRestrictionReleaseErrorKindValue,
) {
  if (kind === LoginRestrictionReleaseErrorKind.AuditFailedAfterEffect)
    return '操作可能已生效，但审计记录失败';
  if (kind === LoginRestrictionReleaseErrorKind.LoginStateUnavailable)
    return '登录状态服务暂时不可用';
  return '临时登录限制解除失败';
}
