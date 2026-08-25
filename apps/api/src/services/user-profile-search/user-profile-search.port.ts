import type { UserQueryDto } from "@api/services/user/user.type";
import type { UserDto, UserProfileBase } from "@iam/domain/user";

export interface UserProfileSearchPort {
  readonly searchDsl: (input: unknown) => Promise<UserProfileBase[]>;
  readonly searchLegacyUsers: (query: UserQueryDto) => Promise<UserDto[]>;
}
