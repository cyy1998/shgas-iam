import type { UserProfileSearchPort } from "@api/services/user-profile-search/user-profile-search.port";
import type { UserDelegationReaderPort } from "@api/services/user/user.port";
import { createUserProfileSearchService } from "@api/services/user-profile-search/user-profile-search.service";
import { createUserDelegationQuery } from "@api/services/user/user-delegation-query.helper";

export interface CreateApiUserProfileSearchOptions {
  readonly dslSearch: Pick<UserProfileSearchPort, "searchDsl">;
  readonly legacySearch: Pick<UserProfileSearchPort, "searchLegacyUsers">;
  readonly privilegeDelegationRepository: UserDelegationReaderPort;
}

export function createApiUserProfileSearch(
  options: CreateApiUserProfileSearchOptions,
) {
  const userProfileSearch = createUserProfileSearchService({
    dslSearch: options.dslSearch,
    legacySearch: options.legacySearch,
  });
  const userDelegationQuery = createUserDelegationQuery({
    userProfileSearch,
    privilegeDelegationRepository: options.privilegeDelegationRepository,
  });

  return {
    userDelegationQuery,
    userProfileSearch,
  };
}
