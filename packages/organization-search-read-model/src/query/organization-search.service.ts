import { FilterValidationError } from "@iam/filter-engine";
import { z } from "zod";
import { OrganizationSearchDocumentSchema } from "../schema";
import {
  OrganizationSearchFilterValidationError,
  OrganizationSearchResultTooLargeError,
  OrganizationSearchUnavailableError,
} from "./organization-search.error";
import {
  ORGANIZATION_SEARCH_RESULT_LIMIT,
  type OrganizationSearchQueryRepositoryPort,
} from "./organization-search.port";

const SearchRequestEnvelopeSchema = z.object({ filter: z.unknown().nonoptional() }).strict();

export function createOrganizationSearchQueryService(deps: {
  readonly repository: OrganizationSearchQueryRepositoryPort;
}) {
  return {
    async search(input: unknown) {
      const request = SearchRequestEnvelopeSchema.safeParse(input);
      if (!request.success) throw new OrganizationSearchFilterValidationError();
      let rows: readonly { readonly document: unknown }[];
      try {
        rows = await deps.repository.searchCurrentDocuments(request.data.filter);
      } catch (error) {
        if (error instanceof FilterValidationError) throw new OrganizationSearchFilterValidationError();
        throw new OrganizationSearchUnavailableError();
      }
      if (rows.length > ORGANIZATION_SEARCH_RESULT_LIMIT) throw new OrganizationSearchResultTooLargeError();
      try {
        return rows.map((row) => OrganizationSearchDocumentSchema.parse(row.document));
      } catch {
        throw new OrganizationSearchUnavailableError();
      }
    },
  };
}

export type OrganizationSearchQueryService = ReturnType<typeof createOrganizationSearchQueryService>;
