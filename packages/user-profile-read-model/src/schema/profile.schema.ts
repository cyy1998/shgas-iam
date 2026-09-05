import type {
  EmploymentResponsibilitySnapshot as ClientEmploymentResponsibilitySnapshot,
} from "@iam/client-subject-projection";
import { z } from "@hono/zod-openapi";
import {
  EmploymentResponsibilitySnapshotSchema as ClientEmploymentResponsibilitySnapshotSchema,
} from "@iam/client-subject-projection";
import { EmploymentDetailDtoSchema } from "@iam/domain/employment";
import { UserDetailDtoSchema } from "@iam/domain/user";
import { PublishedProfileBaseSchema } from "./profile-storage.schema";
import {
  V3UserProfileSearchDocumentSchema,
} from "./profile-v3-search.schema";
import { SubjectFactsEmploymentSchema } from "./subject-facts-schema.core";
import { reviveUserProfileDetailDates } from "./user-profile-detail-document";

export const USER_PROFILE_SCHEMA_VERSION = 3;

export const EmploymentResponsibilitySnapshotSchema
  = ClientEmploymentResponsibilitySnapshotSchema;

export type EmploymentResponsibilitySnapshot
  = ClientEmploymentResponsibilitySnapshot;

export const ProfileEmploymentDetailSchema = EmploymentDetailDtoSchema.extend({
  responsibilities: z.array(EmploymentResponsibilitySnapshotSchema),
}).strict();

export const UserProfileDetailDocumentSchema = UserDetailDtoSchema.omit({
  employments: true,
}).extend({
  employments: z.array(ProfileEmploymentDetailSchema),
}).strict();

export const UserProfileSearchDocumentSchema
  = V3UserProfileSearchDocumentSchema;

export const ProfileSubjectFactsEmploymentSchema = SubjectFactsEmploymentSchema.extend({
  responsibilities: z.array(EmploymentResponsibilitySnapshotSchema),
}).strict();

export const ProfileSubjectFactsDocumentSchema = z.object({
  employments: z.array(ProfileSubjectFactsEmploymentSchema),
}).strict();

export const PublishedProfileSchema = PublishedProfileBaseSchema.extend({
  profileSchemaVersion: z.literal(USER_PROFILE_SCHEMA_VERSION),
  detail: UserProfileDetailDocumentSchema,
  searchDoc: UserProfileSearchDocumentSchema,
  subjectFacts: ProfileSubjectFactsDocumentSchema,
}).strict();

export type PublishedProfile = z.infer<
  typeof PublishedProfileSchema
>;

export function parseUserProfileDetailDocument(input: unknown) {
  return UserProfileDetailDocumentSchema.parse(reviveUserProfileDetailDates(input));
}
