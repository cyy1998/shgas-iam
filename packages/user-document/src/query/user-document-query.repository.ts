import type { DbClient } from "@iam/db";
import { userDocuments } from "@iam/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../document";
import { deriveDocumentLoginProfile, deriveDocumentMobile } from "../document-query";

const metadata = {
  userId: userDocuments.userId,
  subjectIdentifier: userDocuments.subjectIdentifier,
  schemaVersion: userDocuments.schemaVersion,
  sourceVersion: userDocuments.sourceVersion,
  publishedAt: userDocuments.publishedAt,
};
const readable = and(eq(userDocuments.schemaVersion, USER_DOCUMENT_SCHEMA_VERSION), isNotNull(userDocuments.document));
const mobileExists = sql<boolean>`${userDocuments.document} ? 'mobile'`;
const mobileDocument = sql<unknown>`jsonb_build_object('subjectIdentifier', ${userDocuments.document}->'subjectIdentifier', 'mobile', ${userDocuments.document}->'mobile')`;

export function createUserDocumentQueryRepository(db: DbClient) {
  return {
    async getCurrentLoginProfileByUserId(userId: number) {
      const [row] = await db
        .select({
          ...metadata,
          mobileExists,
          document: sql<unknown>`jsonb_build_object('subjectIdentifier', ${userDocuments.document}->'subjectIdentifier', 'username', ${userDocuments.document}->'username', 'name', ${userDocuments.document}->'name', 'mobile', ${userDocuments.document}->'mobile')`,
        })
        .from(userDocuments)
        .where(and(readable, eq(userDocuments.userId, userId)))
        .limit(1);
      if (!row) return null;
      if (!row.mobileExists) throw new Error("Published login mobile fact is absent");
      const { mobileExists: _exists, ...publication } = row;
      return deriveDocumentLoginProfile(publication);
    },
    async getCurrentMobileByUsername(username: string) {
      const rows = await db
        .select({ ...metadata, mobileExists, document: mobileDocument })
        .from(userDocuments)
        .where(and(readable, sql`${userDocuments.document}->>'username' = ${username}`))
        .limit(2);
      if (rows.length > 1) throw new Error("Published directory contains duplicate usernames");
      const row = rows[0];
      if (!row) return null;
      if (!row.mobileExists) throw new Error("Published mobile fact is absent");
      const { mobileExists: _exists, ...publication } = row;
      return deriveDocumentMobile(publication);
    },
  };
}
export type UserDocumentQueryRepository = ReturnType<typeof createUserDocumentQueryRepository>;
