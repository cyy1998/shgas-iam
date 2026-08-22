import type { InternalUserProfileFilterDsl } from "./internal-user-query.schema";

export interface InternalUserProfileQueryRecord {
  readonly detail: unknown;
}

export interface InternalUserProfileQueryRepositoryPort {
  readonly getCurrentByUsername: (
    username: string,
  ) => Promise<InternalUserProfileQueryRecord | null>;
  readonly searchCurrentVisibleProfiles: (
    filter: InternalUserProfileFilterDsl,
  ) => Promise<readonly InternalUserProfileQueryRecord[]>;
}
