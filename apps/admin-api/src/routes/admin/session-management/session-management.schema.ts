import type {
  AdminLoginRestrictionListResult,
  AdminLoginRestrictionReleaseResult,
  AdminSessionListResult,
  AdminSessionRevokeResult,
} from "@admin-api/services/session-management/session-management.type";
import { AdminLoginRestrictionReleaseResultSchema, AdminSessionRevokeResultSchema } from "@admin-api/services/session-management/session-management.schema";
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
import { CapturedSessionSchema } from "@iam/session-kernel";

export const SessionManagementListSessionsInputSchema = z.object({
  conditions: z.object({
    userId: z.int().positive().optional().openapi({ example: 42 }),
    kind: z.enum(["userSession", "clientSession"]).optional(),
    userSessionId: z.uuid().optional(),
  }).strict().refine(
    conditions => conditions.userSessionId === undefined || conditions.kind === "clientSession",
    { message: "userSessionId requires clientSession kind", path: ["userSessionId"] },
  ).default({}),
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
  record: z.object({
    kind: z.enum(["userSession", "clientSession"]),
    identity: CapturedSessionSchema,
    clientId: z.string().optional(),
    protocol: z.enum(["oidc", "custom_sso"]).optional(),
  }).strict().optional(),
  user: z.object({
    id: z.int().positive().nullable(),
    subjectId: z.uuid(),
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
).extend({ allowedActions: z.object({ revoke: z.boolean() }).strict().optional() }).openapi("SessionManagementSessionListResultVo");

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

export const SessionManagementReleaseLoginRestrictionResultVoSchema = AdminLoginRestrictionReleaseResultSchema
  .openapi("SessionManagementReleaseLoginRestrictionResultVo");

export const SessionManagementRevokeSessionsInputSchema = z.object({
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("captured"), targets: z.array(CapturedSessionSchema).min(1).max(10000) }).strict(),
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

export const SessionManagementRevokeSessionsResultVoSchema = AdminSessionRevokeResultSchema
  .openapi("SessionManagementRevokeSessionsResultVo");

export function toSessionManagementSessionListResultVo(input: AdminSessionListResult) {
  const result = {
    result: input.result.map(session => ({
      principalSessionId: session.principalSessionId,
      ...(session.record ? { record: session.record } : {}),
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
    result: { failureStateCleared: input.result.failureStateCleared },
  };
  SessionManagementReleaseLoginRestrictionResultVoSchema.parse(result);
  return result;
}

export function toSessionManagementRevokeSessionsResultVo(input: AdminSessionRevokeResult) {
  return SessionManagementRevokeSessionsResultVoSchema.parse({
    changed: input.changed,
    result: {
      scope: input.result.scope,
      generation: "unified",
      currentPrincipalSessionExcluded: input.result.currentPrincipalSessionExcluded,
      sessions: {
        userSessionsTerminated: input.result.sessions.userSessionsTerminated,
        clientSessionsTerminated: input.result.sessions.clientSessionsTerminated,
        excluded: input.result.sessions.excluded,
        failed: input.result.sessions.failed,
        unknown: input.result.sessions.unknown,
      },
      ...(input.result.batch ? { batch: input.result.batch } : {}),
      ...(input.result.artifactCleanup ? { artifactCleanup: input.result.artifactCleanup } : {}),
    },
  });
}
