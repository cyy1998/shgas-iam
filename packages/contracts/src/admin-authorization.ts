import { z } from "zod";

export const ADMIN_AUTHORIZATION_REASON_CODES = [
  "ACTION_NOT_GRANTED",
  "RESOURCE_OUT_OF_SCOPE",
  "USER_NOT_HR_MANAGED",
  "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
  "USER_NOT_ENABLED",
  "RESOURCE_STATE_NOT_ACTIONABLE",
  "INTEGRITY_GUARD_BLOCKED",
] as const;

export const ADMIN_MODULE_CODES = [
  "user",
  "organization",
  "organizationResponsibility",
  "position",
  "employment",
  "client",
  "role",
  "sessionManagement",
  "audit",
  "systemLog",
] as const;

export const AdminAuthorizationReasonCodeSchema = z.enum(
  ADMIN_AUTHORIZATION_REASON_CODES,
);
export const AdminModuleCodeSchema = z.enum(ADMIN_MODULE_CODES);

export const AdminAuthorizationDecisionSchema = z.discriminatedUnion(
  "allowed",
  [
    z.object({ allowed: z.literal(true), reason: z.null() }).strict(),
    z.object({
      allowed: z.literal(false),
      reason: AdminAuthorizationReasonCodeSchema,
    }).strict(),
  ],
);

export const AdminCapabilitySummarySchema = z.object({
  visibleModules: z.array(AdminModuleCodeSchema),
  collectionActions: z.object({
    user: z.object({
      create: AdminAuthorizationDecisionSchema,
    }).strict(),
    employment: z.object({
      create: AdminAuthorizationDecisionSchema,
    }).strict(),
    organization: z.object({
      createRoot: AdminAuthorizationDecisionSchema,
    }).strict(),
    position: z.object({
      create: AdminAuthorizationDecisionSchema,
      edit: AdminAuthorizationDecisionSchema,
      changeStatus: AdminAuthorizationDecisionSchema,
      delete: AdminAuthorizationDecisionSchema,
    }).strict(),
  }).strict(),
}).strict();

export const AdminUserAllowedActionsSchema = z.object({
  editProfile: AdminAuthorizationDecisionSchema,
  resetPassword: AdminAuthorizationDecisionSchema,
  changeStatus: AdminAuthorizationDecisionSchema,
  delete: AdminAuthorizationDecisionSchema,
  resign: AdminAuthorizationDecisionSchema,
}).strict();

export const AdminOrganizationAllowedActionsSchema = z.object({
  createChild: AdminAuthorizationDecisionSchema,
  edit: AdminAuthorizationDecisionSchema,
  changeStatus: AdminAuthorizationDecisionSchema,
  delete: AdminAuthorizationDecisionSchema,
}).strict();

export const AdminEmploymentAllowedActionsSchema = z.object({
  editDescription: AdminAuthorizationDecisionSchema,
  pause: AdminAuthorizationDecisionSchema,
  resume: AdminAuthorizationDecisionSchema,
  end: AdminAuthorizationDecisionSchema,
  transfer: AdminAuthorizationDecisionSchema,
  setPrimary: AdminAuthorizationDecisionSchema,
  clearPrimary: AdminAuthorizationDecisionSchema,
}).strict();

export type AdminAuthorizationReasonCode = z.infer<
  typeof AdminAuthorizationReasonCodeSchema
>;
export type AdminAuthorizationDecision = z.infer<
  typeof AdminAuthorizationDecisionSchema
>;
export type AdminModuleCode = z.infer<typeof AdminModuleCodeSchema>;
export type AdminCapabilitySummary = z.infer<
  typeof AdminCapabilitySummarySchema
>;
export type AdminUserAllowedActions = z.infer<
  typeof AdminUserAllowedActionsSchema
>;
export type AdminOrganizationAllowedActions = z.infer<
  typeof AdminOrganizationAllowedActionsSchema
>;
export type AdminEmploymentAllowedActions = z.infer<
  typeof AdminEmploymentAllowedActionsSchema
>;
