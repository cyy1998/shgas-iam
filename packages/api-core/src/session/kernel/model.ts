import { z } from "zod";

export const SESSION_KERNEL_OBJECT_VERSION = 1;

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
export type RenewalPolicy = z.infer<typeof RenewalPolicySchema>;

export const RevocationReasonSchema = z.enum([
  "logout",
  "admin_revoke",
  "user_disabled",
  "user_deleted",
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
export type RevocationReason = z.infer<typeof RevocationReasonSchema>;

const MetadataSchema = z.record(z.string(), z.unknown());

export const PrincipalRefSchema = z.object({
  principalType: z.string().min(1),
  subjectId: z.string().min(1),
  displayName: z.string().optional(),
});
export type PrincipalRef = z.infer<typeof PrincipalRefSchema>;

export const PrincipalSnapshotSchema = z.object({
  subjectId: z.string().min(1),
  username: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  metadata: MetadataSchema.optional(),
});
export type PrincipalSnapshot = z.infer<typeof PrincipalSnapshotSchema>;

export const CleanupRefSchema = z.object({
  protocol: z.string().min(1),
  kind: z.string().min(1),
  ref: z.string().min(1),
  metadata: MetadataSchema.optional(),
});
export type CleanupRef = z.infer<typeof CleanupRefSchema>;

const BaseLifecycleSchema = z.object({
  version: z.literal(SESSION_KERNEL_OBJECT_VERSION),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
  cleanupRefs: z.array(CleanupRefSchema).default([]),
});

export const PrincipalSessionSchema = z.object({
  version: z.literal(SESSION_KERNEL_OBJECT_VERSION),
  sessionKind: z.string().min(1).default("browser_user"),
  principalSessionId: z.string().min(1),
  externalTokenLookupHash: z.string().min(1),
  lookupKeyId: z.string().min(1),
  principal: PrincipalRefSchema,
  authTime: z.number().int().nonnegative(),
  lastActiveAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  absoluteExpiresAt: z.number().int().nonnegative(),
  amr: z.array(z.string()).default([]),
  acr: z.string().optional(),
  snapshot: PrincipalSnapshotSchema,
  tenantId: z.string().optional(),
  issuerId: z.string().optional(),
  metadata: MetadataSchema.optional(),
  cleanupRefs: z.array(CleanupRefSchema).default([]),
});
export type PrincipalSession = z.infer<typeof PrincipalSessionSchema>;

export const ClientBindingSchema = BaseLifecycleSchema.extend({
  bindingId: z.string().min(1),
  protocol: z.string().min(1),
  clientCode: z.string().min(1),
  principalSessionId: z.string().min(1),
  principal: PrincipalRefSchema,
  authTime: z.number().int().nonnegative(),
  renewalPolicy: RenewalPolicySchema,
});
export type ClientBinding = z.infer<typeof ClientBindingSchema>;

export const IssuedCredentialSchema = BaseLifecycleSchema.extend({
  credentialId: z.string().min(1),
  protocol: z.string().min(1),
  credentialType: z.string().min(1),
  lookupHash: z.string().min(1),
  lookupKeyId: z.string().min(1),
  principalSessionId: z.string().min(1),
  bindingId: z.string().min(1).optional(),
  clientCode: z.string().min(1),
  principal: PrincipalRefSchema,
  renewalPolicy: RenewalPolicySchema,
});
export type IssuedCredential = z.infer<typeof IssuedCredentialSchema>;

export const ProtocolArtifactSchema = BaseLifecycleSchema.extend({
  artifactId: z.string().min(1),
  protocol: z.string().min(1),
  artifactType: z.string().min(1),
  lookupHash: z.string().min(1),
  lookupKeyId: z.string().min(1),
  principalSessionId: z.string().min(1).optional(),
  bindingId: z.string().min(1).optional(),
  clientCode: z.string().min(1).optional(),
  principal: PrincipalRefSchema.optional(),
});
export type ProtocolArtifact = z.infer<typeof ProtocolArtifactSchema>;

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
export type RevokedTombstone = z.infer<typeof RevokedTombstoneSchema>;

export const FreshnessRequirementSchema = z.object({
  forceReauthentication: z.boolean().optional(),
  maxAgeSeconds: z.number().int().positive().optional(),
  requiredAmr: z.array(z.string()).optional(),
  minimumAcr: z.string().optional(),
  acrRank: z.record(z.string(), z.number()).optional(),
});
export type FreshnessRequirement = z.infer<typeof FreshnessRequirementSchema>;

export const ValidationFailureReasonSchema = z.enum([
  "user_disabled",
  "user_deleted",
  "client_disabled",
  "client_deleted",
  "client_protocol_disabled",
  "client_config_changed",
  "binding_invalid",
  "credential_corrupted",
]);
export type ValidationFailureReason = z.infer<typeof ValidationFailureReasonSchema>;

export type ValidationResult
  = | { ok: true }
    | {
      ok: false;
      reason: ValidationFailureReason;
      message?: string;
    };

export type RevokeObjectCounter = {
  revoked: number;
  alreadyRevoked: number;
  missing: number;
};

export type CleanupFailure = {
  protocol: string;
  kind: string;
  ref: string;
  error: string;
};

export type RevokeSummary = {
  principalSessions: RevokeObjectCounter;
  bindings: RevokeObjectCounter;
  credentials: RevokeObjectCounter;
  artifacts: RevokeObjectCounter;
  cleanup: {
    attempted: number;
    succeeded: number;
    failed: number;
    failures: CleanupFailure[];
  };
};

export type LifecycleObjectByKind = {
  principal_session: PrincipalSession;
  client_binding: ClientBinding;
  credential: IssuedCredential;
  artifact: ProtocolArtifact;
};

export type LifecycleObject = LifecycleObjectByKind[LifecycleObjectKind];

export const lifecycleObjectSchemas = {
  principal_session: PrincipalSessionSchema,
  client_binding: ClientBindingSchema,
  credential: IssuedCredentialSchema,
  artifact: ProtocolArtifactSchema,
} satisfies Record<LifecycleObjectKind, z.ZodType>;

export type ParseLifecycleObjectResult<K extends LifecycleObjectKind>
  = | { success: true; data: LifecycleObjectByKind[K] }
    | { success: false; issues: z.core.$ZodIssue[]; cause?: unknown };

export function parseLifecycleObject<K extends LifecycleObjectKind>(
  kind: K,
  serialized: string,
): ParseLifecycleObjectResult<K> {
  try {
    const parsed = JSON.parse(serialized) as unknown;
    const result = lifecycleObjectSchemas[kind].safeParse(parsed);
    if (result.success)
      return { success: true, data: result.data as LifecycleObjectByKind[K] };
    return { success: false, issues: result.error.issues };
  }
  catch (cause) {
    return {
      success: false,
      cause,
      issues: [{ code: "custom", message: "invalid JSON", path: [] }],
    };
  }
}

export function parseRevokedTombstone(serialized: string) {
  try {
    return RevokedTombstoneSchema.safeParse(JSON.parse(serialized) as unknown);
  }
  catch (cause) {
    return {
      success: false as const,
      error: { issues: [{ code: "custom", message: "invalid JSON", path: [], cause }] },
    };
  }
}

export function stringifyLifecycleObject(object: LifecycleObject) {
  return JSON.stringify(object);
}

export function stringifyRevokedTombstone(tombstone: RevokedTombstone) {
  return JSON.stringify(tombstone);
}
