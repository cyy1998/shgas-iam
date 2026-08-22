import type { InternalUserProfileQueryRepositoryPort } from "./internal-user-query.port";
import { UserNotFoundError } from "@iam/domain/user";
import {
  InternalUserProfileDetailIntegrityError,
  InternalUserProfileSearchResultTooLargeError,
  InternalUserProfileSearchUnavailableError,
} from "./internal-user-query.error";
import {
  INTERNAL_USER_PROFILE_RESULT_LIMIT,
  InternalUserProfileSearchRequestSchema,
} from "./internal-user-query.schema";
import {
  parseUserProfileDetailDocument,
} from "./profile.schema";

export interface InternalUserProfileQueryServiceDeps {
  readonly profileRepository: InternalUserProfileQueryRepositoryPort;
}

export function createInternalUserProfileQueryService(
  deps: InternalUserProfileQueryServiceDeps,
) {
  return {
    async getDetailByUsername(username: string) {
      let profile;
      try {
        profile = await deps.profileRepository.getCurrentByUsername(username);
      }
      catch {
        throw new InternalUserProfileSearchUnavailableError();
      }
      if (profile === null)
        throw new UserNotFoundError("用户画像不存在");
      return parseStrictDetail(profile.detail);
    },

    async searchDsl(input: unknown) {
      const request = InternalUserProfileSearchRequestSchema.parse(input);
      let profiles;
      try {
        profiles = await deps.profileRepository.searchCurrentVisibleProfiles(request.filter);
      }
      catch {
        throw new InternalUserProfileSearchUnavailableError();
      }
      if (profiles.length > INTERNAL_USER_PROFILE_RESULT_LIMIT)
        throw new InternalUserProfileSearchResultTooLargeError();
      return profiles.map(profile => parseStrictDetail(profile.detail));
    },
  };
}

export type InternalUserProfileQueryService = ReturnType<
  typeof createInternalUserProfileQueryService
>;

function parseStrictDetail(input: unknown) {
  try {
    return parseUserProfileDetailDocument(input);
  }
  catch {
    throw new InternalUserProfileDetailIntegrityError();
  }
}
