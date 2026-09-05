import type { InternalUserProfileQueryRepositoryPort } from "./internal-user-query.port";
import { UserNotFoundError } from "@iam/domain/user";
import {
  parseUserProfileDetailDocument,
} from "../schema/profile.schema";
import {
  InternalUserProfileDetailIntegrityError,
  InternalUserProfileSearchUnavailableError,
} from "./internal-user-query.error";

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
