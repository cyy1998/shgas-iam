import type { DocumentPage, DocumentSort } from "@iam/contracts";

export const ORGANIZATION_DOCUMENT_RESULT_LIMIT = 500;
export interface OrganizationDocumentQueryRepositoryPort {
  /** Validates the filter before accessing persistence. */
  readonly searchCurrentDocuments: (
    filter: unknown,
    sort?: DocumentSort,
    pagination?: DocumentPage,
  ) => Promise<{ readonly rows: readonly { readonly document: unknown }[]; readonly total: number }>;
  readonly getCurrentDocumentByCode: (code: string) => Promise<{ readonly document: unknown } | null>;
}
