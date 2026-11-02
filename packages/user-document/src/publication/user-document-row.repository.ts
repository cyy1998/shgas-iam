import type { DbClient } from "@iam/db";
import { userDocuments } from "@iam/db/schema";
import { lte, sql } from "drizzle-orm";
import type { PublishedUserDocument } from "../document";
import { PublishedUserDocumentSchema } from "../document";
export function createUserDocumentRowRepository(db: DbClient) {
  return {
    async upsertMany(inputs: readonly PublishedUserDocument[]) {
      if (inputs.length > 1_000) throw new RangeError("User Document publication batch exceeds its target limit");
      const values = inputs
        .map((input) => PublishedUserDocumentSchema.parse(input))
        .sort((left, right) => left.userId - right.userId);
      if (!values.length) return [];
      if (new Set(values.map(({ userId }) => userId)).size !== values.length)
        throw new TypeError("User Document publication contains duplicate targets");
      const rows = await db
        .insert(userDocuments)
        .values(values)
        .onConflictDoUpdate({
          target: userDocuments.userId,
          set: {
            subjectIdentifier: sql`excluded.subject_identifier`,
            schemaVersion: sql`excluded.schema_version`,
            sourceVersion: sql`excluded.source_version`,
            publishedAt: sql`excluded.published_at`,
            document: sql`excluded.document`,
            updateTime: sql`excluded.published_at`,
          },
          setWhere: sql`${userDocuments.sourceVersion} <= excluded.source_version`,
        })
        .returning({ userId: userDocuments.userId });
      return rows.map(({ userId }) => userId);
    },
    async upsert(input: PublishedUserDocument) {
      const values = PublishedUserDocumentSchema.parse(input);
      const rows = await db
        .insert(userDocuments)
        .values(values)
        .onConflictDoUpdate({
          target: userDocuments.userId,
          set: {
            subjectIdentifier: values.subjectIdentifier,
            schemaVersion: values.schemaVersion,
            sourceVersion: values.sourceVersion,
            publishedAt: values.publishedAt,
            document: values.document,
            updateTime: values.publishedAt,
          },
          setWhere: lte(userDocuments.sourceVersion, values.sourceVersion),
        })
        .returning({ userId: userDocuments.userId });
      return rows.length > 0;
    },
  };
}
