import type { UserDetailDto } from "@iam/domain/user";
import type { UserProfileQueryRecord, UserProfileQueryRepositoryPort } from "./user-profile-query.port";
import { UserNotFoundError } from "@iam/domain/user";
import { parseUserProfileDetailDocument } from "../schema/profile.schema";

export interface UserProfileQueryServiceDeps {
  profileRepository: UserProfileQueryRepositoryPort;
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

  return {
    getDetailByUserId,
    getDetailByUsername,
    getDetailByMobile,
    getDetailByWxId,
  };
}

export type UserProfileQueryService = ReturnType<typeof createUserProfileQueryService>;

function parseProfileDetail(profile: UserProfileQueryRecord | null): UserDetailDto {
  if (profile === null) {
    throw new UserNotFoundError("用户画像不存在");
  }
  return parseUserProfileDetailDocument(profile.detail);
}
