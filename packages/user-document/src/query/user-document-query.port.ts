import type { PublishedUserLoginProfile } from "@iam/domain/user";

export interface UserDocumentQueryRepositoryPort {
  readonly getCurrentLoginProfileByUserId: (userId: number) => Promise<PublishedUserLoginProfile | null>;
  readonly getCurrentMobileByUsername: (username: string) => Promise<{ mobile: string | null } | null>;
}
