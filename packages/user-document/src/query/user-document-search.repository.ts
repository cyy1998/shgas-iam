import { type DocumentPage, type DocumentSort, userDocumentSorting } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { orderJsonbScalar } from "@iam/db/query-utils";
import { userDocuments } from "@iam/db/schema";
import { and, asc, eq, isNotNull, type SQLWrapper, sql } from "drizzle-orm";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../document";
import { compileUserDocumentFilter } from "../document-query";
import { publishedUserDocumentColumns } from "../publication/user-document-columns";
import { USER_DOCUMENT_RESULT_LIMIT, type UserDocumentSearchRepositoryPort } from "./user-document-search.port";
export function createUserDocumentSearchRepository(db: DbClient) {
  return {
    async searchCurrentDocuments(
      filter: unknown,
      authenticatedClientCode: string,
      sort?: DocumentSort,
      pagination?: DocumentPage,
    ) {
      const condition =
        filter === undefined
          ? undefined
          : compileUserDocumentFilter(filter, userDocuments.document, authenticatedClientCode);
      const visible = and(
        eq(userDocuments.schemaVersion, USER_DOCUMENT_SCHEMA_VERSION),
        isNotNull(userDocuments.document),
        condition,
      );
      if (pagination === undefined) {
        const rows = await db
          .select(publishedUserDocumentColumns)
          .from(userDocuments)
          .where(visible)
          .orderBy(...compileUserDocumentOrder(sort, userDocuments.document), asc(userDocuments.userId))
          .limit(USER_DOCUMENT_RESULT_LIMIT + 1);
        return { rows, total: rows.length };
      }
      // One statement gives the aggregate and page the same snapshot, including an empty page.
      const matches = db
        .$with("matching_user_documents")
        .as(db.select(publishedUserDocumentColumns).from(userDocuments).where(visible));
      const total = db
        .$with("user_document_total")
        .as(db.select({ total: sql<number>`count(*)`.mapWith(Number).as("total") }).from(matches));
      const page = db.$with("user_document_page").as(
        db
          .select()
          .from(matches)
          .orderBy(...compileUserDocumentOrder(sort, matches.document), asc(matches.userId))
          .limit(pagination.pageSize)
          .offset(pagination.offset),
      );
      const result = await db
        .with(matches, total, page)
        .select({
          total: total.total,
          row: {
            userId: page.userId,
            subjectIdentifier: page.subjectIdentifier,
            schemaVersion: page.schemaVersion,
            sourceVersion: page.sourceVersion,
            publishedAt: page.publishedAt,
            document: page.document,
          },
        })
        .from(total)
        .leftJoin(page, sql`true`)
        .orderBy(...compileUserDocumentOrder(sort, page.document), asc(page.userId));
      const count = result[0]?.total;
      if (count === undefined) throw new Error("Document count is unavailable");
      return { rows: result.flatMap(({ row }) => (row === null ? [] : [row])), total: count };
    },
  } satisfies UserDocumentSearchRepositoryPort;
}

function compileUserDocumentOrder(sort: DocumentSort | undefined, document: SQLWrapper) {
  if (sort === undefined) return [];
  return userDocumentSorting.parse(sort).map((ordering) => orderJsonbScalar(document, ordering));
}
export type UserDocumentSearchRepository = ReturnType<typeof createUserDocumentSearchRepository>;
