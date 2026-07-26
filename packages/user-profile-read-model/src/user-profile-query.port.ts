import type { UserProfileFilterDsl } from "./user-profile.schema";

export interface UserProfileQueryRecord {
  detail: unknown;
}

export interface UserProfileSearchInput {
  filter?: UserProfileFilterDsl;
  limit?: number;
}

export interface UserProfileQueryRepositoryPort {
  getCurrentByUserId: (userId: number) => Promise<UserProfileQueryRecord | null>;
  getCurrentByUsername: (username: string) => Promise<UserProfileQueryRecord | null>;
  getCurrentByMobile: (mobile: string) => Promise<UserProfileQueryRecord | null>;
  getCurrentByWxId: (wxId: string) => Promise<UserProfileQueryRecord | null>;
  searchCurrentVisibleProfiles: (input?: UserProfileSearchInput) => Promise<UserProfileQueryRecord[]>;
}
