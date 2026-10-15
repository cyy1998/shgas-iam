import type { V3UserProfileQueryService } from "@iam/user-profile-read-model/v3";
import type { UserProfileSearchPort } from "./user-profile-search.port";

export function createV3UserProfileSearchAdapter(query: Pick<V3UserProfileQueryService, "searchBase">) {
  return {
    searchDsl: async (input: unknown) => await query.searchBase(input),
  } satisfies UserProfileSearchPort;
}
