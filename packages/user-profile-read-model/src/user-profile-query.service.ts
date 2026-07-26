import type { UserProfileQueryRecord, UserProfileQueryRepositoryPort } from "./user-profile-query.port";
import type { UserDetailDto, UserDto, UserProfileFilterDsl, UserQueryDto } from "./user-profile.schema";
import { UserNotFoundError } from "@iam/domain/user";
import {
  compileLegacyUserQueryToProfileFilter,
  toUserDtoFromProfile,
} from "./user-profile-query.helper";
import { parseUserProfileDetailDocument, UserDtoSchema, UserProfileFilterDslSchema } from "./user-profile.schema";

export interface UserProfileQueryServiceDeps {
  profileRepository: UserProfileQueryRepositoryPort;
  config?: {
    dslDefaultLimit?: number;
  };
}

const DEFAULT_DSL_SEARCH_LIMIT = 50;

export function createUserProfileQueryService(deps: UserProfileQueryServiceDeps) {
  const dslDefaultLimit = deps.config?.dslDefaultLimit ?? DEFAULT_DSL_SEARCH_LIMIT;

  async function getDetailByUserId(userId: number): Promise<UserDetailDto> {
    return parseProfileDetail(await deps.profileRepository.getCurrentByUserId(userId));
  }

  async function getDetailByUsername(username: string): Promise<UserDetailDto> {
    return parseProfileDetail(await deps.profileRepository.getCurrentByUsername(username));
  }

  async function getDetailByMobile(mobile: string): Promise<UserDetailDto> {
    return parseProfileDetail(await deps.profileRepository.getCurrentByMobile(mobile));
  }

  async function getDetailByWxId(wxId: string): Promise<UserDetailDto> {
    return parseProfileDetail(await deps.profileRepository.getCurrentByWxId(wxId));
  }

  async function searchLegacyUsers(query: UserQueryDto): Promise<UserDto[]> {
    const filter = compileLegacyUserQueryToProfileFilter(query);
    const profiles = await deps.profileRepository.searchCurrentVisibleProfiles({ filter });
    return profiles.map(profile => UserDtoSchema.parse(toUserDtoFromProfile(profile)));
  }

  async function searchDsl(input: UserProfileFilterDsl, options: { limit?: number } = {}): Promise<UserDetailDto[]> {
    const filter = UserProfileFilterDslSchema.parse(input);
    const profiles = await deps.profileRepository.searchCurrentVisibleProfiles({
      filter,
      limit: options.limit ?? dslDefaultLimit,
    });
    return profiles.map(profile => parseUserProfileDetailDocument(profile.detail));
  }

  return {
    getDetailByUserId,
    getDetailByUsername,
    getDetailByMobile,
    getDetailByWxId,
    searchLegacyUsers,
    searchDsl,
  };
}

export type UserProfileQueryService = ReturnType<typeof createUserProfileQueryService>;

function parseProfileDetail(profile: UserProfileQueryRecord | null): UserDetailDto {
  if (profile === null) {
    throw new UserNotFoundError("用户画像不存在");
  }
  return parseUserProfileDetailDocument(profile.detail);
}
