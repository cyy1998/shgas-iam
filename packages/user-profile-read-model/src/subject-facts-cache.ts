import type { z } from "zod";
import type { PublishedUserProfile } from "./user-profile.schema";
import {
  createSubjectFactsCacheRecordInput,
  createSubjectFactsCacheRecordSchema,
} from "./subject-facts-cache.core";
import {
  LEGACY_USER_PROFILE_SCHEMA_VERSION,
  SubjectFactsDocumentV1Schema,
} from "./user-profile.schema";

export const SubjectFactsCacheRecordV1Schema = createSubjectFactsCacheRecordSchema(
  LEGACY_USER_PROFILE_SCHEMA_VERSION,
  SubjectFactsDocumentV1Schema,
);

export type SubjectFactsCacheRecordV1 = z.infer<typeof SubjectFactsCacheRecordV1Schema>;

export function createSubjectFactsCacheRecord(
  profile: PublishedUserProfile,
  publishedAt: Date,
): SubjectFactsCacheRecordV1 {
  return SubjectFactsCacheRecordV1Schema.parse(createSubjectFactsCacheRecordInput(
    profile,
    publishedAt,
    LEGACY_USER_PROFILE_SCHEMA_VERSION,
  ));
}
