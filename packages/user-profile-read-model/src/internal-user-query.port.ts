export interface InternalUserProfileQueryRecord {
  readonly detail: unknown;
}

export interface InternalUserProfileQueryRepositoryPort {
  readonly getCurrentByUsername: (
    username: string,
  ) => Promise<InternalUserProfileQueryRecord | null>;
}
