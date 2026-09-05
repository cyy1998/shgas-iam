import type { PublishedUserProfile } from "../schema/user-profile.schema";
import type {
  UserProfileBuildRepository,
} from "./user-profile-build.repository";
import {
  LEGACY_USER_PROFILE_SCHEMA_VERSION,
  PublishedUserProfileSchema,
} from "../schema/user-profile.schema";
import {
  buildProfileDocumentsFromDataset,
} from "./profile-document-builder.core";
import {
  chunkItems,
  normalizeVersionedBuildTargets,
} from "./user-profile-build.helpers";

export {
  UserProfileEmploymentIntegrityError,
} from "./profile-document-builder.core";
export type {
  UserProfileEmploymentIntegrityFailureReason,
} from "./profile-document-builder.core";

export interface UserProfileBuilderDeps {
  buildRepository: UserProfileBuildRepository;
  clock: {
    nowDate: () => Date;
  };
  config: {
    batchSize: number;
  };
}

export type BuiltUserProfile = PublishedUserProfile;

export interface UserProfileBuildTarget {
  userId: number;
  sourceDirtyVersion: string;
}

export function createUserProfileBuilder(deps: UserProfileBuilderDeps) {
  async function buildOne(target: UserProfileBuildTarget) {
    return (await buildMany([target]))[0] ?? null;
  }

  async function buildMany(targets: UserProfileBuildTarget[]) {
    const targetsByUserId = normalizeVersionedBuildTargets(targets);
    const profiles: BuiltUserProfile[] = [];
    for (const chunk of chunkItems([...targetsByUserId.keys()], deps.config.batchSize)) {
      const dataset = await deps.buildRepository.loadByUserIds(chunk);
      const builds = buildProfileDocumentsFromDataset(
        dataset,
        deps.clock.nowDate(),
        targetsByUserId,
      );
      profiles.push(...builds.map(build => PublishedUserProfileSchema.parse({
        ...build.profile,
        profileSchemaVersion: LEGACY_USER_PROFILE_SCHEMA_VERSION,
      })));
    }
    return profiles;
  }

  return {
    buildOne,
    buildMany,
  };
}

export type UserProfileBuilder = ReturnType<typeof createUserProfileBuilder>;
