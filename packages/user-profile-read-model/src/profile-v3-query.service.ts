import type { V3UserProfileQueryRepositoryPort } from "./profile-v3-query.port";
import { V3UserProfileSearchRequestSchema } from "./profile-v3-filter";
import {
  V3UserProfileDocumentIntegrityError,
  V3UserProfileFilterValidationError,
  V3UserProfileSearchResultTooLargeError,
  V3UserProfileSearchUnavailableError,
} from "./profile-v3-query.error";
import { V3_USER_PROFILE_RESULT_LIMIT } from "./profile-v3-query.port";
import { V3UserProfileSearchDocumentSchema } from "./profile-v3-search.schema";
import { parseUserProfileDetailDocument } from "./profile.schema";

export interface V3UserProfileQueryServiceDeps {
  readonly profileRepository: V3UserProfileQueryRepositoryPort;
}

export function createV3UserProfileQueryService(
  deps: V3UserProfileQueryServiceDeps,
) {
  return {
    async search(input: unknown) {
      let request;
      try {
        request = V3UserProfileSearchRequestSchema.parse(input);
      }
      catch {
        throw new V3UserProfileFilterValidationError();
      }

      let rows;
      try {
        rows = await deps.profileRepository.searchCurrentProfiles(request.filter);
      }
      catch {
        throw new V3UserProfileSearchUnavailableError();
      }
      if (rows.length > V3_USER_PROFILE_RESULT_LIMIT)
        throw new V3UserProfileSearchResultTooLargeError();
      try {
        return rows.map((row) => {
          V3UserProfileSearchDocumentSchema.parse(row.searchDocument);
          return parseUserProfileDetailDocument(row.detail);
        });
      }
      catch {
        throw new V3UserProfileDocumentIntegrityError();
      }
    },
  };
}

export type V3UserProfileQueryService = ReturnType<
  typeof createV3UserProfileQueryService
>;
