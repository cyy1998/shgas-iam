import { UserNotFoundError } from "@iam/domain/user";
import { PublishedUserDocumentSchema } from "../document";
import { projectPublishedUserDocument } from "../document-query";
import {
  InternalUserDocumentDetailIntegrityError,
  InternalUserDocumentSearchUnavailableError,
} from "./internal-user-query.error";
import type { InternalUserDocumentQueryRepositoryPort } from "./internal-user-query.port";
export interface InternalUserDocumentQueryServiceDeps {
  readonly documentRepository: InternalUserDocumentQueryRepositoryPort;
}
export function createInternalUserDocumentQueryService(deps: InternalUserDocumentQueryServiceDeps) {
  return {
    async getDetailByUsername(username: string, authenticatedClientCode: string) {
      let row: Awaited<ReturnType<InternalUserDocumentQueryRepositoryPort["getCurrentByUsername"]>>;
      try {
        row = await deps.documentRepository.getCurrentByUsername(username);
      } catch {
        throw new InternalUserDocumentSearchUnavailableError();
      }
      if (row === null) throw new UserNotFoundError("当前用户目录不可见");
      try {
        const document = projectPublishedUserDocument(PublishedUserDocumentSchema.parse(row), authenticatedClientCode);
        if (document === null) throw new UserNotFoundError("当前用户目录不可见");
        return document;
      } catch (error) {
        if (error instanceof UserNotFoundError) throw error;
        throw new InternalUserDocumentDetailIntegrityError();
      }
    },
  };
}
export type InternalUserDocumentQueryService = ReturnType<typeof createInternalUserDocumentQueryService>;
