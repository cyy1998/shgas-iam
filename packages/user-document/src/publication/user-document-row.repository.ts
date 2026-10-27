import type { DbClient } from "@iam/db";
import { userDocuments } from "@iam/db/schema";
import { lte } from "drizzle-orm";
import type { PublishedUserDocument } from "../document";
import { PublishedUserDocumentSchema } from "../document";
export function createUserDocumentRowRepository(db: DbClient) {
  return {
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
