import { PublishedUserLoginProfileSchema, UserNotFoundError } from "@iam/domain/user";
import type { UserDocumentQueryRepositoryPort } from "./user-document-query.port";

export interface UserDocumentQueryServiceDeps {
  documentRepository: UserDocumentQueryRepositoryPort;
}

export function createUserDocumentQueryService(deps: UserDocumentQueryServiceDeps) {
  return {
    async getLoginProfileByUserId(userId: number) {
      const profile = await deps.documentRepository.getCurrentLoginProfileByUserId(userId);
      if (profile === null) throw new UserNotFoundError("用户画像不存在");
      return PublishedUserLoginProfileSchema.parse(profile);
    },
    async getMobileByUsername(username: string) {
      const profile = await deps.documentRepository.getCurrentMobileByUsername(username);
      if (profile === null) throw new UserNotFoundError("用户画像不存在");
      return PublishedUserLoginProfileSchema.pick({ mobile: true }).parse(profile).mobile;
    },
  };
}

export type UserDocumentQueryService = ReturnType<typeof createUserDocumentQueryService>;
