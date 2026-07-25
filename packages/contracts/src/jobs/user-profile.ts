import { z } from "zod";

export const USER_PROFILE_QUEUE_NAME = "user-profile";

export enum UserProfileJobName {
  RebuildUserProfile = "rebuild-user-profile",
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
const DirtyVersionSchema = z.string().regex(/^[1-9]\d*$/u, "dirtyVersion must be a positive decimal string");

export const UserProfileJobNameSchema = z.enum(UserProfileJobName);
export const UserProfileDirtyReasonSchema = z.enum(UserProfileDirtyReason);
export const UserProfileDirtyStatusSchema = z.enum(UserProfileDirtyStatus);

export const RebuildUserProfileJobPayloadSchema = UserProfileJobMetaSchema.extend({
  userId: z.number().int().positive(),
  dirtyVersion: DirtyVersionSchema,
}).strict();

export type RebuildUserProfileJobPayload = z.infer<typeof RebuildUserProfileJobPayloadSchema>;
