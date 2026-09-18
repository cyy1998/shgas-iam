import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { UnifiedSessionRevocationSummary } from "@iam/api-core/subject-access";
import type { UserStatus } from "@iam/contracts";
import type { CapturedSession } from "@iam/session-kernel";
import type { AdminSessionListItem } from "./session-management.type";

export interface AdminSessionInventoryItem {
  principalSessionId: string;
  record?: AdminSessionListItem["record"];
  principal: {
    subjectId: string;
  };
  authTime: number;
  expiresAt: number;
  amr: readonly string[];
  origin?: {
    ip?: string;
    userAgent?: string;
  };
}

export interface AdminSessionInventoryPort {
  listPrincipalSessions: (input: {
    offset: number;
    limit: number;
    subjectIdentifier?: string;
    kind?: "userSession" | "clientSession";
    userSessionId?: string;
  }) => Promise<{
    items: AdminSessionInventoryItem[];
    total: number;
  }>;
}

export interface AdminSessionUserSummary {
  id: number;
  subjectIdentifier: string;
  username: string;
  name: string;
  status: UserStatus;
  isDelete: boolean;
}

export interface AdminSessionUserSummaryPort {
  getSessionManagementUserSummaries: (userIds: readonly number[]) => Promise<AdminSessionUserSummary[]>;
  getSessionManagementUserSummariesBySubjectIdentifiers: (
    subjectIdentifiers: readonly string[],
  ) => Promise<AdminSessionUserSummary[]>;
}

export interface AdminLoginRestrictionState {
  userId: number;
  cause: "too_many_login_failures";
  triggerMethod: "password" | "mobile" | "unknown";
  restrictedUntil: number;
  remainingSeconds: number;
}

export interface AdminLoginRestrictionPort {
  listRestrictions: (input: { offset: number; limit: number; userId?: number }) => Promise<{
    items: AdminLoginRestrictionState[];
    total: number;
  }>;
  clearLoginState: (userId: number) => Promise<{
    changed: boolean;
    failureStateCleared: true;
    restriction: AdminLoginRestrictionState | null;
  }>;
}

export type AdminSessionControlSummary = { sessions: UnifiedSessionRevocationSummary };

export interface AdminSessionControlPort {
  executeCapturedSessions?: (
    targets: readonly CapturedSession[],
    excludeUserSessionId: string,
  ) => Promise<AdminSessionControlSummary>;
  revokePrincipalSession: (
    principalSessionId: string,
    reason: "admin_revoke",
  ) => Promise<AdminSessionControlSummary>;
}

export interface AdminSessionUserControlPort {
  revokeUserSessions: (input: {
    userId: number;
    subjectIdentifier: string;
    reason: "admin_revoke";
    exceptPrincipalSessionId?: string;
    auditContext: AdminAuditContext;
  }) => Promise<AdminSessionControlSummary>;
}

export interface AdminSessionAuditPort {
  recordAuditLog: (input: AuditLogInput) => Promise<void>;
}

export interface AdminSessionManagementLoggerPort {
  error: (fields: Record<string, unknown>, message: string) => void;
}

export interface AdminSessionManagementServiceDeps {
  audit: AdminSessionAuditPort;
  control: AdminSessionControlPort;
  inventory: AdminSessionInventoryPort;
  loginRestrictions: AdminLoginRestrictionPort;
  logger: AdminSessionManagementLoggerPort;
  userControl: AdminSessionUserControlPort;
  users: AdminSessionUserSummaryPort;
}
