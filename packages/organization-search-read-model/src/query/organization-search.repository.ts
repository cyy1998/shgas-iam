import type { DbClient } from "@iam/db";
import { organizationSearchDocuments } from "@iam/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { ORGANIZATION_SEARCH_SCHEMA_VERSION } from "../schema";
import { type OrganizationSearchFilter, organizationSearchFilterEngine } from "./organization-search.filter";
import {
  ORGANIZATION_SEARCH_RESULT_LIMIT,
  type OrganizationSearchQueryRepositoryPort,
} from "./organization-search.port";

export function createOrganizationSearchQueryRepository(db: DbClient): OrganizationSearchQueryRepositoryPort {
  return {
    async searchCurrentDocuments(filter: OrganizationSearchFilter) {
      return await db
        .select({ document: organizationSearchDocuments.document })
        .from(organizationSearchDocuments)
        .where(
          and(
            eq(organizationSearchDocuments.schemaVersion, ORGANIZATION_SEARCH_SCHEMA_VERSION),
            eq(organizationSearchDocuments.searchVisible, true),
            organizationSearchFilterEngine.compile(filter, organizationSearchDocuments.document),
          ),
        )
        .orderBy(asc(organizationSearchDocuments.organizationId))
        .limit(ORGANIZATION_SEARCH_RESULT_LIMIT + 1);
    },
  };
}
