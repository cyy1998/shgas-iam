import type { UserQueryDto } from "@api/services/user/user.type";
import type { z } from "@hono/zod-openapi";
import type { UserDto } from "@iam/domain/user";
import type { UserProfileDetailDocumentSchema } from "@iam/user-profile-read-model";

export type UserProfileSearchDetail = z.infer<
  typeof UserProfileDetailDocumentSchema
>;

export interface UserProfileSearchPort {
  readonly searchDsl: (input: unknown) => Promise<UserProfileSearchDetail[]>;
  readonly searchLegacyUsers: (query: UserQueryDto) => Promise<UserDto[]>;
}
