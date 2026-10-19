export const ORGANIZATION_SEARCH_RESULT_LIMIT = 500;
export interface OrganizationSearchQueryRepositoryPort {
  /** Validates the filter before accessing persistence. */
  readonly searchCurrentDocuments: (filter: unknown) => Promise<readonly { readonly document: unknown }[]>;
}
