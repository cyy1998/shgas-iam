import type { UserProfileSearchPort } from "./user-profile-search.port";

export interface UserProfileSearchServiceDeps {
  readonly dslSearch: Pick<UserProfileSearchPort, "searchDsl">;
  readonly legacySearch: Pick<UserProfileSearchPort, "searchLegacyUsers">;
}

export function createUserProfileSearchService(
  deps: UserProfileSearchServiceDeps,
) {
  return {
    searchDsl: async (input: Parameters<UserProfileSearchPort["searchDsl"]>[0]) =>
      await deps.dslSearch.searchDsl(input),
    searchLegacyUsers: async (query: Parameters<UserProfileSearchPort["searchLegacyUsers"]>[0]) =>
      await deps.legacySearch.searchLegacyUsers(query),
  } satisfies UserProfileSearchPort;
}

export type UserProfileSearchService = ReturnType<
  typeof createUserProfileSearchService
>;
