import type { DbClient } from "@iam/db";
import { organizationDocuments } from "@iam/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
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
    async searchCurrentDocuments(filter: unknown) {
      const condition = organizationDocumentFilterEngine.compile(filter, organizationDocuments.document);
      return await db
        .select({ document: organizationDocuments.document })
        .from(organizationDocuments)
        .where(
          and(
            eq(organizationDocuments.schemaVersion, ORGANIZATION_DOCUMENT_SCHEMA_VERSION),
            eq(organizationDocuments.searchVisible, true),
            condition,
          ),
        )
        .orderBy(asc(organizationDocuments.organizationId))
        .limit(ORGANIZATION_DOCUMENT_RESULT_LIMIT + 1);
    },
  };
}
