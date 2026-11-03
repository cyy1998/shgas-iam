import type { DocumentPage, DocumentSort } from "@iam/contracts";
import type { PublishedUserDocumentRow } from "../document";
export const USER_DOCUMENT_RESULT_LIMIT = 500;
export interface UserDocumentSearchRepositoryPort {
  searchCurrentDocuments: (
    filter: unknown,
    authenticatedClientCode: string,
    sort?: DocumentSort,
    pagination?: DocumentPage,
  ) => Promise<{ rows: readonly PublishedUserDocumentRow[]; total: number }>;
}
