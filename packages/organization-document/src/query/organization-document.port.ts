export const ORGANIZATION_DOCUMENT_RESULT_LIMIT = 500;
export interface OrganizationDocumentQueryRepositoryPort {
  /** Validates the filter before accessing persistence. */
  readonly searchCurrentDocuments: (filter: unknown) => Promise<readonly { readonly document: unknown }[]>;
  readonly getCurrentDocumentByCode: (code: string) => Promise<{ readonly document: unknown } | null>;
}
