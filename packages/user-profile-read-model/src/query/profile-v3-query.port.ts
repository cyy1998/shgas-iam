export const V3_USER_PROFILE_RESULT_LIMIT = 500;

export interface V3UserProfileBaseQueryRow {
  readonly mobile: string | null;
  readonly name: string;
  readonly searchDocument: unknown;
  readonly subjectIdentifier: string;
  readonly username: string;
  readonly wxId: string | null;
}

export interface V3UserProfileQueryRepositoryPort {
  /** Validates the filter before accessing persistence. */
  searchCurrentProfileBases: (filter: unknown) => Promise<readonly V3UserProfileBaseQueryRow[]>;
}
