import { z } from "zod";

export const SESSION_KERNEL_OBJECT_VERSION = 1;
export const MAX_SESSION_ORIGIN_IP_LENGTH = 64;
export const MAX_SESSION_ORIGIN_USER_AGENT_LENGTH = 512;

export const LifecycleObjectKindSchema = z.enum([
  "principal_session",
  "client_binding",
  "credential",
  "artifact",
]);
export type LifecycleObjectKind = z.infer<typeof LifecycleObjectKindSchema>;

export const RenewalPolicySchema = z.enum([
  "extend_with_principal",
  "fixed_at_issue",
  "never_extend",
]);

export const RevocationReasonSchema = z.enum([
  "logout",
  "admin_revoke",
  "user_disabled",
  "user_deleted",
  "session_generation_stale",
  "client_disabled",
  "client_deleted",
  "client_protocol_disabled",
  "client_config_changed",
  "binding_invalid",
  "credential_corrupted",
  "consumed",
  "replaced",
  "unknown",
]);

const MetadataSchema = z.record(z.string(), z.unknown());

export const PrincipalRefSchema = z.object({
  principalType: z.string().min(1),
  subjectId: z.uuid(),
}).strict();
export type PrincipalRef = z.infer<typeof PrincipalRefSchema>;

export const SessionOriginSchema = z.object({
  ip: z.string().min(1).max(MAX_SESSION_ORIGIN_IP_LENGTH).optional(),
  userAgent: z.string().min(1).max(MAX_SESSION_ORIGIN_USER_AGENT_LENGTH).optional(),
});
export type SessionOrigin = z.infer<typeof SessionOriginSchema>;

export function normalizeSessionOrigin(input: {
  ip?: string | null;
  userAgent?: string | null;
} | null | undefined): SessionOrigin | undefined {
  const ip = normalizeBoundedOriginValue(input?.ip, MAX_SESSION_ORIGIN_IP_LENGTH, true);
  const userAgent = normalizeBoundedOriginValue(
    input?.userAgent,
    MAX_SESSION_ORIGIN_USER_AGENT_LENGTH,
    false,
  );
  return ip || userAgent ? { ip, userAgent } : undefined;
}

export const CleanupRefSchema = z.object({
  protocol: z.string().min(1),
  kind: z.string().min(1),
  ref: z.string().min(1),
  metadata: MetadataSchema.optional(),
});

const BaseLifecycleSchema = z.object({
  version: z.literal(SESSION_KERNEL_OBJECT_VERSION),
  subjectContext: z.string().optional(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
  cleanupRefs: z.array(CleanupRefSchema).default([]),
});

export const PrincipalSessionSchema = z.object({
  version: z.literal(SESSION_KERNEL_OBJECT_VERSION),
  subjectContext: z.string().optional(),
  sessionKind: z.string().min(1).default("browser_user"),
  principalSessionId: z.string().min(1),
  externalTokenLookupHash: z.string().min(1),
  principal: PrincipalRefSchema,
  authTime: z.number().int().nonnegative(),
  lastActiveAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  absoluteExpiresAt: z.number().int().nonnegative(),
  amr: z.array(z.string()).default([]),
  acr: z.string().optional(),
  origin: SessionOriginSchema.optional(),
  tenantId: z.string().optional(),
  issuerId: z.string().optional(),
  metadata: MetadataSchema.optional(),
  cleanupRefs: z.array(CleanupRefSchema).default([]),
}).strict();

export const ClientBindingSchema = BaseLifecycleSchema.extend({
  bindingId: z.string().min(1),
  protocol: z.string().min(1),
  clientCode: z.string().min(1),
  principalSessionId: z.string().min(1),
  principal: PrincipalRefSchema,
  authTime: z.number().int().nonnegative(),
  renewalPolicy: RenewalPolicySchema,
});

export const IssuedCredentialSchema = BaseLifecycleSchema.extend({
  credentialId: z.string().min(1),
  protocol: z.string().min(1),
  credentialType: z.string().min(1),
  lookupHash: z.string().min(1),
  principalSessionId: z.string().min(1),
  bindingId: z.string().min(1).optional(),
  clientCode: z.string().min(1),
  principal: PrincipalRefSchema,
  renewalPolicy: RenewalPolicySchema,
});

export const ProtocolArtifactSchema = BaseLifecycleSchema.extend({
  artifactId: z.string().min(1),
  protocol: z.string().min(1),
  artifactType: z.string().min(1),
  lookupHash: z.string().min(1),
  principalSessionId: z.string().min(1).optional(),
  bindingId: z.string().min(1).optional(),
  clientCode: z.string().min(1).optional(),
  principal: PrincipalRefSchema.optional(),
}).superRefine((artifact, context) => {
  if (
    (artifact.principal !== undefined || artifact.principalSessionId !== undefined)
    && artifact.subjectContext === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["subjectContext"],
      message: "principal-linked protocol artifact requires a subject context",
    });
  }
});

export const RevokedTombstoneSchema = z.object({
  version: z.literal(SESSION_KERNEL_OBJECT_VERSION),
  objectKind: LifecycleObjectKindSchema,
  objectId: z.string().min(1),
  lookupHash: z.string().min(1).optional(),
  reason: RevocationReasonSchema,
  revokedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  principalSessionId: z.string().min(1).optional(),
  bindingId: z.string().min(1).optional(),
  clientCode: z.string().min(1).optional(),
  protocol: z.string().min(1).optional(),
  cleanupRefs: z.array(CleanupRefSchema).default([]),
  metadata: MetadataSchema.optional(),
});

function normalizeBoundedOriginValue(
  value: string | null | undefined,
  maxLength: number,
  trim: boolean,
) {
  if (typeof value !== "string")
    return undefined;
  const normalized = trim ? value.trim() : value;
  if (normalized.trim().length === 0)
    return undefined;
  return normalized.slice(0, maxLength);
}
