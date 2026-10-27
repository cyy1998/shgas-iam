import { FilterValidationError } from "@iam/filter-engine";
import { PublishedUserDocumentSchema } from "../document";
import { projectPublishedUserDocument, UserDocumentSearchRequestSchema } from "../document-query";
import {
  UserDocumentDocumentIntegrityError,
  UserDocumentFilterValidationError,
  UserDocumentSearchResultTooLargeError,
  UserDocumentSearchUnavailableError,
} from "./user-document-search.error";
import type { UserDocumentSearchRepositoryPort } from "./user-document-search.port";
import { USER_DOCUMENT_RESULT_LIMIT } from "./user-document-search.port";
export interface UserDocumentSearchServiceDeps {
  readonly documentRepository: UserDocumentSearchRepositoryPort;
}
export function createUserDocumentSearchService(deps: UserDocumentSearchServiceDeps) {
  return {
    async searchDocuments(input: unknown, authenticatedClientCode: string) {
      const request = UserDocumentSearchRequestSchema.safeParse(input);
      if (!request.success) throw new UserDocumentFilterValidationError();
      let rows: Awaited<ReturnType<UserDocumentSearchRepositoryPort["searchCurrentDocuments"]>>;
      try {
        rows = await deps.documentRepository.searchCurrentDocuments(request.data.filter, authenticatedClientCode);
      } catch (error) {
        if (error instanceof FilterValidationError) throw new UserDocumentFilterValidationError();
        throw new UserDocumentSearchUnavailableError();
      }
      if (rows.length > USER_DOCUMENT_RESULT_LIMIT) throw new UserDocumentSearchResultTooLargeError();
      try {
        return rows.map((row) => {
          const document = projectPublishedUserDocument(
            PublishedUserDocumentSchema.parse(row),
            authenticatedClientCode,
          );
          if (document === null) throw new Error("Directory query returned a tombstone");
          return document;
        });
      } catch {
        throw new UserDocumentDocumentIntegrityError();
      }
    },
  };
}
export type UserDocumentSearchService = ReturnType<typeof createUserDocumentSearchService>;
