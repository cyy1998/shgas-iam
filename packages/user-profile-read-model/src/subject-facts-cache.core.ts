import type { z } from "zod";
import { z as zod } from "zod";

export function createSubjectFactsCacheRecordSchema<
  const TSchemaVersion extends number,
  TFactsSchema extends z.ZodType,
>(schemaVersion: TSchemaVersion, factsSchema: TFactsSchema) {
  return zod.object({
    schemaVersion: zod.literal(schemaVersion),
    sourceDirtyVersion: zod.string().regex(/^[1-9]\d*$/u),
    publishedAt: zod.iso.datetime(),
    subjectIdentifier: zod.uuid(),
    profile: zod.object({
      username: zod.string().min(1),
      name: zod.string().min(1),
      phone: zod.string().nullable(),
    }).strict(),
    facts: factsSchema,
  }).strict();
}

export function createSubjectFactsCacheRecordInput<TFacts>(
  profile: {
    sourceDirtyVersion: string;
    subjectIdentifier: string;
    username: string;
    name: string;
    mobile: string | null;
    subjectFacts: TFacts;
  },
  publishedAt: Date,
  schemaVersion: number,
) {
  return {
    schemaVersion,
    sourceDirtyVersion: profile.sourceDirtyVersion,
    publishedAt: publishedAt.toISOString(),
    subjectIdentifier: profile.subjectIdentifier,
    profile: {
      username: profile.username,
      name: profile.name,
      phone: profile.mobile,
    },
    facts: profile.subjectFacts,
  };
}
