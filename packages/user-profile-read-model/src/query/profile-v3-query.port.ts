import type { V3UserProfileFilter } from "./profile-v3-filter";

export const V3_USER_PROFILE_RESULT_LIMIT = 500;

export interface V3UserProfileQueryRow {
  readonly detail: unknown;
  readonly searchDocument: unknown;
}

export interface V3UserProfileBaseQueryRow {
  readonly mobile: string | null;
  readonly name: string;
  readonly searchDocument: unknown;
  readonly subjectIdentifier: string;
  readonly username: string;
  readonly wxId: string | null;
}

export interface V3UserProfileQueryRepositoryPort {
  searchCurrentProfileBases: (
    filter: V3UserProfileFilter,
  ) => Promise<readonly V3UserProfileBaseQueryRow[]>;
  searchCurrentProfiles: (
    filter: V3UserProfileFilter,
  ) => Promise<readonly V3UserProfileQueryRow[]>;
}
