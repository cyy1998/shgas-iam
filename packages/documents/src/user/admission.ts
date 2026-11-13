import type { ApplicationAdmissionInput, ApplicationAdmissionResult } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { userDocuments } from "@iam/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { PublishedUserDocumentSchema, USER_DOCUMENT_SCHEMA_VERSION } from "./document";
import { compileUserDocumentFilter } from "./document-query";
import { publishedUserDocumentColumns } from "./publication/user-document-columns";

export function createApplicationAdmissionEvaluator(db: DbClient) {
  return {
    async evaluate({
      clientCode,
      subjectIdentifier,
      filter,
    }: ApplicationAdmissionInput): Promise<ApplicationAdmissionResult> {
      try {
        const [row] = await db
          .select({
            publication: publishedUserDocumentColumns,
            matches: sql<boolean>`${compileUserDocumentFilter(filter, userDocuments.document, clientCode)}`,
          })
          .from(userDocuments)
          .where(
            and(
              eq(userDocuments.subjectIdentifier, subjectIdentifier),
              eq(userDocuments.schemaVersion, USER_DOCUMENT_SCHEMA_VERSION),
              isNotNull(userDocuments.document),
            ),
          )
          .limit(1);
        if (!row || typeof row.matches !== "boolean") return "unavailable";

        const publication = PublishedUserDocumentSchema.safeParse(row.publication);
        if (!publication.success || publication.data.document === null) return "unavailable";
        return row.matches ? "match" : "no-match";
      } catch {
        // A malformed document may also fail inside SQL. Driver errors can include rule values.
        return "unavailable";
      }
    },
  };
}
