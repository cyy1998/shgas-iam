import type { DbClient } from "@iam/db";
import { userDocuments } from "@iam/db/schema";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../document";
import { publishedUserDocumentColumns } from "../publication/user-document-columns";
export function createInternalUserDocumentQueryRepository(db: DbClient) {
  return {
    async getCurrentByUsername(username: string) {
      const rows = await db
        .select(publishedUserDocumentColumns)
        .from(userDocuments)
        .where(
          and(
            eq(userDocuments.schemaVersion, USER_DOCUMENT_SCHEMA_VERSION),
            isNotNull(userDocuments.document),
            sql`${userDocuments.document}->'user'->>'username' = ${username}`,
          ),
        )
        .orderBy(asc(userDocuments.userId))
        .limit(2);
      if (rows.length > 1) throw new Error("Published directory contains duplicate usernames");
      return rows[0] ?? null;
    },
  };
}
export type InternalUserDocumentQueryRepository = ReturnType<typeof createInternalUserDocumentQueryRepository>;
