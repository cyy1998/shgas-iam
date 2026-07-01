import { z } from "zod";

export const USER_PROFILE_QUEUE_NAME = "user-profile";

export enum UserProfileJobName {
  RebuildUserProfile = "rebuild-user-profile",
  ExpandUserProfileScope = "expand-user-profile-scope",
}

export enum UserProfileScopeType {
  AllUsers = "all-users",
  UserIds = "user-ids",
  UserId = "user-id",
  OrganizationId = "organization-id",
  PositionId = "position-id",
  RoleId = "role-id",
  PrivilegeId = "privilege-id",
  PrivilegeCode = "privilege-code",
  EmploymentId = "employment-id",
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

export enum UserProfileDirtyStatus {
  Pending = "pending",
  Processing = "processing",
  Processed = "processed",
  Failed = "failed",
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
export const UserProfileDirtyStatusSchema = z.enum(UserProfileDirtyStatus);

export const RebuildUserProfileJobPayloadSchema = UserProfileJobMetaSchema.extend({
  userId: z.number().int().positive(),
}).strict();

const ExpandUserProfileScopeBucketSchema = z.string().min(1).max(64);
const PositiveIdSchema = z.number().int().positive();

export const ExpandUserProfileScopeJobPayloadSchema = z.discriminatedUnion("scopeType", [
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.AllUsers),
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.UserIds),
    userIds: z.array(PositiveIdSchema).min(1).max(1000),
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.UserId),
    scopeId: PositiveIdSchema,
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.OrganizationId),
    scopeId: PositiveIdSchema,
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.PositionId),
    scopeId: PositiveIdSchema,
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.RoleId),
    scopeId: PositiveIdSchema,
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.PrivilegeId),
    scopeId: PositiveIdSchema,
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.PrivilegeCode),
    scopeId: z.string().min(1).max(128),
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
  UserProfileJobMetaSchema.extend({
    scopeType: z.literal(UserProfileScopeType.EmploymentId),
    scopeId: PositiveIdSchema,
    bucket: ExpandUserProfileScopeBucketSchema,
  }).strict(),
]);

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
