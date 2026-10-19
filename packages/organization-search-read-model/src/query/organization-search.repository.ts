import type { DbClient } from "@iam/db";
import { organizationSearchDocuments } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { ORGANIZATION_SEARCH_SCHEMA_VERSION } from "../schema";
import { organizationSearchFilterEngine } from "./organization-search.filter";
import {
  ORGANIZATION_SEARCH_RESULT_LIMIT,
  type OrganizationSearchQueryRepositoryPort,
} from "./organization-search.port";

export function createOrganizationSearchQueryRepository(db: DbClient): OrganizationSearchQueryRepositoryPort {
  return {
    async searchCurrentDocuments(filter: unknown) {
      const condition = organizationSearchFilterEngine.compile(filter, organizationSearchDocuments.document);
      return await db
        .select({ document: organizationSearchDocuments.document })
        .from(organizationSearchDocuments)
        .where(
          and(
            eq(organizationSearchDocuments.schemaVersion, ORGANIZATION_SEARCH_SCHEMA_VERSION),
            eq(organizationSearchDocuments.searchVisible, true),
            condition,
          ),
        )
        .orderBy(asc(organizationSearchDocuments.organizationId))
        .limit(ORGANIZATION_SEARCH_RESULT_LIMIT + 1);
    },
  };
}
