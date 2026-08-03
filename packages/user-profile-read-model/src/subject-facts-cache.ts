import type { PublishedUserProfile } from "./user-profile.schema";
import { z } from "zod";
import {
  CURRENT_USER_PROFILE_SCHEMA_VERSION,
  SubjectFactsDocumentV1Schema,
} from "./user-profile.schema";

export const SubjectFactsCacheRecordV1Schema = z.object({
  schemaVersion: z.literal(CURRENT_USER_PROFILE_SCHEMA_VERSION),
  sourceDirtyVersion: z.string().regex(/^[1-9]\d*$/u),
  publishedAt: z.iso.datetime(),
  subjectIdentifier: z.uuid(),
  profile: z.object({
    username: z.string().min(1),
    name: z.string().min(1),
    phone: z.string().nullable(),
  }).strict(),
  facts: SubjectFactsDocumentV1Schema,
}).strict();

export type SubjectFactsCacheRecordV1 = z.infer<typeof SubjectFactsCacheRecordV1Schema>;

export function createSubjectFactsCacheRecord(
  profile: PublishedUserProfile,
  publishedAt: Date,
): SubjectFactsCacheRecordV1 {
  return SubjectFactsCacheRecordV1Schema.parse({
    schemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
    sourceDirtyVersion: profile.sourceDirtyVersion,
    publishedAt: publishedAt.toISOString(),
    subjectIdentifier: profile.subjectIdentifier,
    profile: {
      username: profile.username,
      name: profile.name,
      phone: profile.mobile,
    },
    facts: profile.subjectFacts,
  });
}
