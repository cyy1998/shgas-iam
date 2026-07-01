import type { UserDetailDto, UserDto, UserQueryDto } from "@api/services/user/user.type";
import type { UserProfileRepository } from "./user-profile.repository";
import type { UserProfileFilterDsl } from "./user-profile.schema";
import { UserDetailDtoSchema, UserDtoSchema } from "@api/services/user/user.schema";
import { UserNotFoundError } from "@iam/domain/user";
import {
  compileLegacyUserQueryToProfileFilter,
  toUserDtoFromProfile,
} from "./user-profile.repository";
import { UserProfileFilterDslSchema } from "./user-profile.schema";

export interface UserProfileQueryServiceDeps {
  profileRepository: UserProfileRepository;
}

export function createUserProfileQueryService(deps: UserProfileQueryServiceDeps) {
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

  async function searchDsl(input: UserProfileFilterDsl): Promise<UserDetailDto[]> {
    const filter = UserProfileFilterDslSchema.parse(input);
    const profiles = await deps.profileRepository.searchCurrentVisibleProfiles({ filter });
    return profiles.map(profile => UserDetailDtoSchema.parse(profile.detail));
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

function parseProfileDetail(profile: Awaited<ReturnType<UserProfileRepository["getCurrentByUserId"]>>): UserDetailDto {
  if (profile === null) {
    throw new UserNotFoundError("用户画像不存在");
  }
  return UserDetailDtoSchema.parse(profile.detail);
}
