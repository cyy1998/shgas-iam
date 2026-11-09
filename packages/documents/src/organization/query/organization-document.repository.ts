import { type DocumentSort, organizationDocumentSorting } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { orderJsonbScalar } from "@iam/db/query-utils";
import { organizationDocuments } from "@iam/db/schema";
import { and, asc, count, eq, type SQLWrapper, sql } from "drizzle-orm";
import { ORGANIZATION_DOCUMENT_SCHEMA_VERSION } from "../schema";
import { organizationDocumentFilterEngine } from "./organization-document.filter";
import {
  ORGANIZATION_DOCUMENT_RESULT_LIMIT,
  type OrganizationDocumentQueryRepositoryPort,
} from "./organization-document.port";

export function createOrganizationDocumentQueryRepository(db: DbClient): OrganizationDocumentQueryRepositoryPort {
  return {
    async getCurrentDocumentByCode(code: string) {
      const rows = await db
        .select({ document: organizationDocuments.document })
        .from(organizationDocuments)
        .where(
          and(
            eq(organizationDocuments.schemaVersion, ORGANIZATION_DOCUMENT_SCHEMA_VERSION),
            eq(organizationDocuments.searchVisible, true),
            sql`${organizationDocuments.document} ->> 'code' = ${code}`,
          ),
        )
        .orderBy(asc(organizationDocuments.organizationId))
        .limit(2);
      if (rows.length > 1) throw new Error("Published Organization code is ambiguous");
      return rows[0] ?? null;
    },
    async searchCurrentDocuments(filter, sort, pagination) {
      const condition =
        filter === undefined
          ? undefined
          : organizationDocumentFilterEngine.compile(filter, organizationDocuments.document);
      const visibility = and(
        eq(organizationDocuments.schemaVersion, ORGANIZATION_DOCUMENT_SCHEMA_VERSION),
        eq(organizationDocuments.searchVisible, true),
        condition,
      );
      if (pagination === undefined) {
        const rows = await db
          .select({ document: organizationDocuments.document })
          .from(organizationDocuments)
          .where(visibility)
          .orderBy(
            ...compileOrganizationDocumentOrder(sort, organizationDocuments.document),
            asc(organizationDocuments.organizationId),
          )
          .limit(ORGANIZATION_DOCUMENT_RESULT_LIMIT + 1);
        return { rows, total: rows.length };
      }
      const matching = db
        .$with("matching_organizations")
        .as(
          db
            .select({ organizationId: organizationDocuments.organizationId, document: organizationDocuments.document })
            .from(organizationDocuments)
            .where(visibility),
        );
      const page = db.$with("organization_page").as(
        db
          .select()
          .from(matching)
          .orderBy(...compileOrganizationDocumentOrder(sort, matching.document), asc(matching.organizationId))
          .limit(pagination.pageSize)
          .offset(pagination.offset),
      );
      const totals = db.$with("organization_total").as(db.select({ total: count().as("total") }).from(matching));
      // The aggregate always supplies one row, even when the requested page is empty.
      // One statement observes the same MVCC snapshot for both the page and its exact count.
      const rows = await db
        .with(matching, page, totals)
        .select({ organizationId: page.organizationId, document: page.document, total: totals.total })
        .from(totals)
        .leftJoin(page, sql`true`)
        .orderBy(...compileOrganizationDocumentOrder(sort, page.document), asc(page.organizationId));
      const total = rows[0]?.total;
      if (total === undefined) throw new Error("Organization page count is missing");
      return { rows: rows.filter((row) => row.organizationId !== null).map(({ document }) => ({ document })), total };
    },
  };
}

function compileOrganizationDocumentOrder(sort: DocumentSort | undefined, document: SQLWrapper) {
  if (sort === undefined) return [];
  return organizationDocumentSorting.parse(sort).map((ordering) => orderJsonbScalar(document, ordering));
}
