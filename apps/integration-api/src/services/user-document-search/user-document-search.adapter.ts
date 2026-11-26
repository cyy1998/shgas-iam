import type { UserDocumentSearchService } from "@iam/documents/user/query";
import type { UserDocumentSearchPort } from "./user-document-search.port";

export function createUserDocumentSearchAdapter(query: Pick<UserDocumentSearchService, "searchDocuments">) {
  return {
    searchDsl: async (input: unknown, authenticatedClientCode: string) =>
      await query.searchDocuments(input, authenticatedClientCode),
  } satisfies UserDocumentSearchPort;
}
