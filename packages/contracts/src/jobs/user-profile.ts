import { z } from "zod";

export const USER_PROFILE_QUEUE_NAME = "user-profile";

export enum UserProfileJobName {
  RebuildUserProfile = "rebuild-user-profile",
  ExpandUserProfileScope = "expand-user-profile-scope",
}

export enum UserProfileScopeType {
  UserId = "user-id",
  OrganizationId = "organization-id",
  PositionId = "position-id",
  RoleId = "role-id",
  PrivilegeCode = "privilege-code",
}

export enum UserProfileDirtyReason {
  UserUpdated = "user-updated",
  EmploymentUpdated = "employment-updated",
  OrganizationUpdated = "organization-updated",
  PositionUpdated = "position-updated",
  RoleUpdated = "role-updated",
  PrivilegeUpdated = "privilege-updated",
  ManualRebuild = "manual-rebuild",
  Backfill = "backfill",
}

const UserProfileJobMetaSchema = z.object({
  reason: z.enum(UserProfileDirtyReason),
  requestedAt: z.string().datetime().optional(),
  requestId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(128).optional(),
});

export const UserProfileJobNameSchema = z.enum(UserProfileJobName);
export const UserProfileScopeTypeSchema = z.enum(UserProfileScopeType);
export const UserProfileDirtyReasonSchema = z.enum(UserProfileDirtyReason);

export const RebuildUserProfileJobPayloadSchema = UserProfileJobMetaSchema.extend({
  userId: z.number().int().positive(),
}).strict();

export const ExpandUserProfileScopeJobPayloadSchema = UserProfileJobMetaSchema.extend({
  scopeType: UserProfileScopeTypeSchema,
  scopeId: z.union([z.number().int().positive(), z.string().min(1).max(128)]),
  bucket: z.string().min(1).max(64),
}).strict();

export const UserProfileJobPayloadSchemas = {
  [UserProfileJobName.RebuildUserProfile]: RebuildUserProfileJobPayloadSchema,
  [UserProfileJobName.ExpandUserProfileScope]: ExpandUserProfileScopeJobPayloadSchema,
} as const;

export const UserProfileJobPayloadSchema = z.union([
  RebuildUserProfileJobPayloadSchema,
  ExpandUserProfileScopeJobPayloadSchema,
]);

export type RebuildUserProfileJobPayload = z.infer<typeof RebuildUserProfileJobPayloadSchema>;
export type ExpandUserProfileScopeJobPayload = z.infer<typeof ExpandUserProfileScopeJobPayloadSchema>;
export type UserProfileJobPayload = z.infer<typeof UserProfileJobPayloadSchema>;

export interface UserProfileJobPayloadByName {
  [UserProfileJobName.RebuildUserProfile]: RebuildUserProfileJobPayload;
  [UserProfileJobName.ExpandUserProfileScope]: ExpandUserProfileScopeJobPayload;
}
