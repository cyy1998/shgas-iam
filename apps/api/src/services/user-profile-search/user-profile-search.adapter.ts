import type { UserProfileSearchService } from "@iam/user-profile-read-model/query";
import type { UserProfileSearchPort } from "./user-profile-search.port";

export function createUserProfileSearchAdapter(query: Pick<UserProfileSearchService, "searchBase">) {
  return {
    searchDsl: async (input: unknown) => await query.searchBase(input),
  } satisfies UserProfileSearchPort;
}
