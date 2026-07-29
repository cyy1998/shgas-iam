export const AdminSessionAccountStatus = {
  Deleted: "deleted",
  Ended: "ended",
  Normal: "normal",
  Paused: "paused",
  Unknown: "unknown",
} as const;

export type AdminSessionAccountStatusValue
  = typeof AdminSessionAccountStatus[keyof typeof AdminSessionAccountStatus];

export const AdminSessionAuthMethod = {
  Mobile: "mobile",
  Oa: "oa",
  Password: "password",
  Unknown: "unknown",
  Wechat: "wechat",
} as const;

export type AdminSessionAuthMethodValue
  = typeof AdminSessionAuthMethod[keyof typeof AdminSessionAuthMethod];

export const AdminSessionDeviceType = {
  Desktop: "desktop",
  Mobile: "mobile",
  Tablet: "tablet",
  Unknown: "unknown",
} as const;

export type AdminSessionDeviceTypeValue
  = typeof AdminSessionDeviceType[keyof typeof AdminSessionDeviceType];

export const AdminSessionOperatingSystem = {
  Android: "android",
  Ios: "ios",
  Linux: "linux",
  Macos: "macos",
  Unknown: "unknown",
  Windows: "windows",
} as const;

export type AdminSessionOperatingSystemValue
  = typeof AdminSessionOperatingSystem[keyof typeof AdminSessionOperatingSystem];

export const AdminSessionBrowser = {
  Chrome: "chrome",
  Edge: "edge",
  Firefox: "firefox",
  Other: "other",
  Safari: "safari",
  Wechat: "wechat",
} as const;

export type AdminSessionBrowserValue
  = typeof AdminSessionBrowser[keyof typeof AdminSessionBrowser];

export interface AdminSessionListInput {
  pageNum: number;
  pageSize: number;
  userId?: number;
}

export interface AdminSessionActorContext {
  actorUserId: number;
  principalSessionId: string | null;
}

export interface AdminSessionRevokeInput {
  target:
    | {
      type: "session";
      principalSessionId: string;
    }
    | {
      type: "user";
      userId: number;
    };
}

export interface AdminSessionRevokeResult {
  changed: boolean;
  scope: "session" | "user";
  revoked: {
    principalSessions: number;
    bindings: number;
    credentials: number;
    artifacts: number;
  };
  currentPrincipalSessionExcluded: boolean;
  cleanup: {
    attempted: number;
    succeeded: number;
    failed: number;
  };
}

export interface AdminSessionOriginSummary {
  ip: string | null;
  deviceType: AdminSessionDeviceTypeValue;
  operatingSystem: AdminSessionOperatingSystemValue;
  browser: AdminSessionBrowserValue;
}

export interface AdminSessionListItem {
  principalSessionId: string;
  user: {
    id: number | null;
    subjectId: string;
    username: string | null;
    name: string | null;
    accountStatus: AdminSessionAccountStatusValue;
  };
  authMethods: AdminSessionAuthMethodValue[];
  authTime: number;
  expiresAt: number;
  origin: AdminSessionOriginSummary | null;
  isCurrentSession: boolean;
  isCurrentUser: boolean;
}

export interface AdminSessionListResult {
  result: AdminSessionListItem[];
  total: number;
  pageNum: number;
  pageSize: number;
  pages: number;
}

export const AdminLoginRestrictionCause = {
  TooManyLoginFailures: "too_many_login_failures",
} as const;

export type AdminLoginRestrictionCauseValue
  = typeof AdminLoginRestrictionCause[keyof typeof AdminLoginRestrictionCause];

export const AdminLoginRestrictionTriggerMethod = {
  Mobile: "mobile",
  Password: "password",
  Unknown: "unknown",
} as const;

export type AdminLoginRestrictionTriggerMethodValue
  = typeof AdminLoginRestrictionTriggerMethod[keyof typeof AdminLoginRestrictionTriggerMethod];

export interface AdminLoginRestrictionListInput {
  pageNum: number;
  pageSize: number;
  userId?: number;
}

export interface AdminLoginRestrictionListItem {
  user: {
    id: number;
    username: string | null;
    name: string | null;
    accountStatus: AdminSessionAccountStatusValue;
  };
  cause: AdminLoginRestrictionCauseValue;
  triggerMethod: AdminLoginRestrictionTriggerMethodValue;
  restrictedUntil: number;
  remainingSeconds: number;
}

export interface AdminLoginRestrictionListResult {
  result: AdminLoginRestrictionListItem[];
  total: number;
  pageNum: number;
  pageSize: number;
  pages: number;
}

export interface AdminLoginRestrictionReleaseInput {
  userId: number;
}

export interface AdminLoginRestrictionReleaseResult {
  changed: boolean;
  failureStateCleared: true;
}
