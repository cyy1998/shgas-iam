import type { OrganizationSearchFilter } from "./organization-search.filter";

export const ORGANIZATION_SEARCH_RESULT_LIMIT = 500;
export interface OrganizationSearchQueryRepositoryPort {
  readonly searchCurrentDocuments: (
    filter: OrganizationSearchFilter,
  ) => Promise<readonly { readonly document: unknown }[]>;
}
