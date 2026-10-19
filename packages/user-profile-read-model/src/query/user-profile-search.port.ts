export const USER_PROFILE_RESULT_LIMIT = 500;

export interface UserProfileBaseQueryRow {
  readonly mobile: string | null;
  readonly name: string;
  readonly searchDocument: unknown;
  readonly subjectIdentifier: string;
  readonly username: string;
  readonly wxId: string | null;
}

export interface UserProfileSearchRepositoryPort {
  /** Validates the filter before accessing persistence. */
  searchCurrentProfileBases: (filter: unknown) => Promise<readonly UserProfileBaseQueryRow[]>;
}
