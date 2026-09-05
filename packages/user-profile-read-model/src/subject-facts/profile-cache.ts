import type { z } from "zod";
import type { PublishedProfile } from "../schema/profile.schema";
import {
  ProfileSubjectFactsDocumentSchema,
  USER_PROFILE_SCHEMA_VERSION,
} from "../schema/profile.schema";
import {
  createSubjectFactsCacheRecordInput,
  createSubjectFactsCacheRecordSchema,
} from "./subject-facts-cache.core";

export const SubjectFactsCacheRecordSchema = createSubjectFactsCacheRecordSchema(
  USER_PROFILE_SCHEMA_VERSION,
  ProfileSubjectFactsDocumentSchema,
);

export type SubjectFactsCacheRecord = z.infer<
  typeof SubjectFactsCacheRecordSchema
>;

export function createSubjectFactsCacheRecord(
  profile: PublishedProfile,
  publishedAt: Date,
): SubjectFactsCacheRecord {
  return SubjectFactsCacheRecordSchema.parse(createSubjectFactsCacheRecordInput(
    profile,
    publishedAt,
    USER_PROFILE_SCHEMA_VERSION,
  ));
}
