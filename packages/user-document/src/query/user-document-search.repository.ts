import type { DbClient } from "@iam/db";
import { userDocuments } from "@iam/db/schema";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../document";
import { compileUserDocumentFilter } from "../document-query";
import { publishedUserDocumentColumns } from "../publication/user-document-columns";
import { USER_DOCUMENT_RESULT_LIMIT } from "./user-document-search.port";
export function createUserDocumentSearchRepository(db: DbClient) {
  return {
    async searchCurrentDocuments(filter: unknown, authenticatedClientCode: string) {
      const condition = compileUserDocumentFilter(filter, userDocuments.document, authenticatedClientCode);
      return await db
        .select(publishedUserDocumentColumns)
        .from(userDocuments)
        .where(
          and(
            eq(userDocuments.schemaVersion, USER_DOCUMENT_SCHEMA_VERSION),
            isNotNull(userDocuments.document),
            condition,
          ),
        )
        .orderBy(asc(userDocuments.userId))
        .limit(USER_DOCUMENT_RESULT_LIMIT + 1);
    },
  };
}
export type UserDocumentSearchRepository = ReturnType<typeof createUserDocumentSearchRepository>;
