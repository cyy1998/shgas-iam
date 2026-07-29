import type {
  AdminLoginRestrictionListResult,
  AdminLoginRestrictionReleaseResult,
  AdminSessionListResult,
  AdminSessionRevokeResult,
} from "@admin-api/services/session-management/session-management.type";
import {
  AdminLoginRestrictionCause,
  AdminLoginRestrictionTriggerMethod,
  AdminSessionAccountStatus,
  AdminSessionAuthMethod,
  AdminSessionBrowser,
  AdminSessionDeviceType,
  AdminSessionOperatingSystem,
} from "@admin-api/services/session-management/session-management.type";
import { z } from "@hono/zod-openapi";
import { createPageResultSchema } from "@iam/api-core/core/pagination/schema";

export const SessionManagementListSessionsInputSchema = z.object({
  conditions: z.object({
    userId: z.int().positive().optional().openapi({ example: 42 }),
  }).strict().default({}),
  pageNum: z.int().positive().default(1),
  pageSize: z.int().positive().max(100).default(20),
}).strict().openapi("SessionManagementListSessionsInput");

export const SessionManagementListLoginRestrictionsInputSchema = z.object({
  conditions: z.object({
    userId: z.int().positive().optional().openapi({ example: 42 }),
  }).strict().default({}),
  pageNum: z.int().positive().default(1),
  pageSize: z.int().positive().max(100).default(20),
}).strict().openapi("SessionManagementListLoginRestrictionsInput");

export const SessionManagementSessionVoSchema = z.object({
  principalSessionId: z.string().min(1),
  user: z.object({
    id: z.int().positive().nullable(),
    subjectId: z.string().min(1),
    username: z.string().nullable(),
    name: z.string().nullable(),
    accountStatus: z.enum(AdminSessionAccountStatus),
  }).strict(),
  authMethods: z.array(z.enum(AdminSessionAuthMethod)).min(1),
  authTime: z.int().nonnegative(),
  expiresAt: z.int().nonnegative(),
  origin: z.object({
    ip: z.string().nullable(),
    deviceType: z.enum(AdminSessionDeviceType),
    operatingSystem: z.enum(AdminSessionOperatingSystem),
    browser: z.enum(AdminSessionBrowser),
  }).strict().nullable(),
  isCurrentSession: z.boolean(),
  isCurrentUser: z.boolean(),
}).strict().openapi("SessionManagementSessionVo");

export const SessionManagementSessionListResultVoSchema = createPageResultSchema(
  z.array(SessionManagementSessionVoSchema),
).openapi("SessionManagementSessionListResultVo");

export const SessionManagementLoginRestrictionVoSchema = z.object({
  user: z.object({
    id: z.int().positive(),
    username: z.string().nullable(),
    name: z.string().nullable(),
    accountStatus: z.enum(AdminSessionAccountStatus),
  }).strict(),
  cause: z.enum(AdminLoginRestrictionCause),
  triggerMethod: z.enum(AdminLoginRestrictionTriggerMethod),
  restrictedUntil: z.int().nonnegative(),
  remainingSeconds: z.int().nonnegative(),
}).strict().openapi("SessionManagementLoginRestrictionVo");

export const SessionManagementLoginRestrictionListResultVoSchema = createPageResultSchema(
  z.array(SessionManagementLoginRestrictionVoSchema),
).openapi("SessionManagementLoginRestrictionListResultVo");

export const SessionManagementReleaseLoginRestrictionInputSchema = z.object({
  userId: z.int().positive(),
}).strict().openapi("SessionManagementReleaseLoginRestrictionInput");

export const SessionManagementReleaseLoginRestrictionResultVoSchema = z.object({
  changed: z.boolean(),
  failureStateCleared: z.literal(true),
}).strict().openapi("SessionManagementReleaseLoginRestrictionResultVo");

export const SessionManagementRevokeSessionsInputSchema = z.object({
  target: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("session"),
      principalSessionId: z.string().min(1).max(128),
    }).strict(),
    z.object({
      type: z.literal("user"),
      userId: z.int().positive(),
    }).strict(),
  ]),
}).strict().openapi("SessionManagementRevokeSessionsInput");

export const SessionManagementRevokeSessionsResultVoSchema = z.object({
  changed: z.boolean(),
  scope: z.enum(["session", "user"]),
  revoked: z.object({
    principalSessions: z.int().nonnegative(),
    bindings: z.int().nonnegative(),
    credentials: z.int().nonnegative(),
    artifacts: z.int().nonnegative(),
  }).strict(),
  currentPrincipalSessionExcluded: z.boolean(),
  cleanup: z.object({
    attempted: z.int().nonnegative(),
    succeeded: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }).strict(),
}).strict().openapi("SessionManagementRevokeSessionsResultVo");

export function toSessionManagementSessionListResultVo(input: AdminSessionListResult) {
  const result = {
    result: input.result.map(session => ({
      principalSessionId: session.principalSessionId,
      user: {
        id: session.user.id,
        subjectId: session.user.subjectId,
        username: session.user.username,
        name: session.user.name,
        accountStatus: session.user.accountStatus,
      },
      authMethods: [...session.authMethods],
      authTime: session.authTime,
      expiresAt: session.expiresAt,
      origin: session.origin
        ? {
            ip: session.origin.ip,
            deviceType: session.origin.deviceType,
            operatingSystem: session.origin.operatingSystem,
            browser: session.origin.browser,
          }
        : null,
      isCurrentSession: session.isCurrentSession,
      isCurrentUser: session.isCurrentUser,
    })),
    total: input.total,
    pageNum: input.pageNum,
    pageSize: input.pageSize,
    pages: input.pages,
  };
  SessionManagementSessionListResultVoSchema.parse(result);
  return result;
}

export function toSessionManagementLoginRestrictionListResultVo(
  input: AdminLoginRestrictionListResult,
) {
  const result = {
    result: input.result.map(restriction => ({
      user: {
        id: restriction.user.id,
        username: restriction.user.username,
        name: restriction.user.name,
        accountStatus: restriction.user.accountStatus,
      },
      cause: restriction.cause,
      triggerMethod: restriction.triggerMethod,
      restrictedUntil: restriction.restrictedUntil,
      remainingSeconds: restriction.remainingSeconds,
    })),
    total: input.total,
    pageNum: input.pageNum,
    pageSize: input.pageSize,
    pages: input.pages,
  };
  SessionManagementLoginRestrictionListResultVoSchema.parse(result);
  return result;
}

export function toSessionManagementReleaseLoginRestrictionResultVo(
  input: AdminLoginRestrictionReleaseResult,
) {
  const result = {
    changed: input.changed,
    failureStateCleared: input.failureStateCleared,
  };
  SessionManagementReleaseLoginRestrictionResultVoSchema.parse(result);
  return result;
}

export function toSessionManagementRevokeSessionsResultVo(input: AdminSessionRevokeResult) {
  const result = {
    changed: input.changed,
    scope: input.scope,
    revoked: {
      principalSessions: input.revoked.principalSessions,
      bindings: input.revoked.bindings,
      credentials: input.revoked.credentials,
      artifacts: input.revoked.artifacts,
    },
    currentPrincipalSessionExcluded: input.currentPrincipalSessionExcluded,
    cleanup: {
      attempted: input.cleanup.attempted,
      succeeded: input.cleanup.succeeded,
      failed: input.cleanup.failed,
    },
  };
  SessionManagementRevokeSessionsResultVoSchema.parse(result);
  return result;
}
