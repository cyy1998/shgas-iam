import type { db } from "@iam/db";
import type {
  UserProfilePublicationPort,
  UserProfileRebuildProjection,
} from "./user-profile-rebuild.processor";
import { UserProfileDirtyStatus } from "@iam/contracts";
import { formatDirtyVersion } from "./dirty-version";
import { createUserProfileDirtyRepository } from "./dirty.repository";
import { createUserProfileRepository } from "./user-profile.repository";
import { PublishedUserProfileSchema } from "./user-profile.schema";

export type UserProfilePublicationDb = Pick<typeof db, "transaction">;

export function createUserProfilePublicationRepository(
  db: UserProfilePublicationDb,
): UserProfilePublicationPort {
  return {
    async publishCandidate(input) {
      const dirtyVersion = formatDirtyVersion(input.dirtyVersion);
      const profile = parseCandidate(input.userId, dirtyVersion, input.profile);

      return await db.transaction(async (tx) => {
        const dirtyRepository = createUserProfileDirtyRepository(tx);
        const profileRepository = createUserProfileRepository(tx);
        const dirty = await dirtyRepository.lockByUserId(input.userId);
        if (
          dirty === null
          || dirty.dirtyVersion !== dirtyVersion
          || dirty.status !== UserProfileDirtyStatus.Processing
        ) {
          return { status: "stale" as const };
        }

        if (profile === null) {
          const deleted = await profileRepository.deleteByUserIdAtMostVersion({
            userId: input.userId,
            sourceDirtyVersion: dirtyVersion,
          });
          if (deleted === null) {
            const current = await profileRepository.getAnyByUserId(input.userId);
            if (
              current?.sourceDirtyVersion !== null
              && current?.sourceDirtyVersion !== undefined
              && BigInt(current.sourceDirtyVersion) > BigInt(dirtyVersion)
            ) {
              return { status: "stale" as const };
            }
          }
        }
        else {
          const published = await profileRepository.upsertProfile(profile);
          if (published === null)
            return { status: "stale" as const };
        }

        const processed = await dirtyRepository.markProcessed({
          userId: input.userId,
          dirtyVersion,
          processedAt: input.processedAt,
        });
        if (processed === null)
          throw new Error("User Profile Dirty row changed while locked for publication");

        return { status: profile === null ? "missing" as const : "published" as const };
      });
    },
  };
}

function parseCandidate(
  userId: number,
  dirtyVersion: string,
  profile: UserProfileRebuildProjection | null,
) {
  if (profile === null)
    return null;

  const parsed = PublishedUserProfileSchema.parse(profile);
  if (parsed.userId !== userId)
    throw new Error("User Profile candidate user does not match the publication target");
  if (parsed.sourceDirtyVersion !== dirtyVersion)
    throw new Error("User Profile candidate version does not match the publication target");
  return parsed;
}
