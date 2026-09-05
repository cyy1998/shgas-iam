import type { db } from "@iam/db";
import { UserProfileDirtyStatus } from "@iam/contracts";
import { formatDirtyVersion } from "../invalidation/dirty-version";
import { createUserProfileDirtyRepository } from "../invalidation/dirty.repository";
import { createProfilePublicationStateRepository } from "./profile-publication-state.repository";

export type UserProfilePublicationDb = Pick<typeof db, "transaction">;

interface VersionedUserProfileProjection {
  userId: number;
  sourceDirtyVersion: string;
}

type PublicationTransaction = Parameters<
  Parameters<UserProfilePublicationDb["transaction"]>[0]
>[0];

export function createVersionedUserProfilePublicationRepository<
  TProfile extends VersionedUserProfileProjection,
>(
  db: UserProfilePublicationDb,
  candidate: {
    parse: (input: TProfile) => TProfile;
    upsert: (tx: PublicationTransaction, profile: TProfile) => Promise<unknown | null>;
  },
) {
  return {
    async publishCandidate(input: {
      userId: number;
      dirtyVersion: string;
      profile: TProfile | null;
      processedAt: Date;
    }) {
      const dirtyVersion = formatDirtyVersion(input.dirtyVersion);
      const profile = parseCandidate(input.userId, dirtyVersion, input.profile, candidate.parse);

      return await db.transaction(async (tx) => {
        const dirtyRepository = createUserProfileDirtyRepository(tx);
        const profileRepository = createProfilePublicationStateRepository(tx);
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
            const current = await profileRepository.findVersionByUserId(input.userId);
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
          const published = await candidate.upsert(tx, profile);
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

function parseCandidate<TProfile extends VersionedUserProfileProjection>(
  userId: number,
  dirtyVersion: string,
  profile: TProfile | null,
  parse: (input: TProfile) => TProfile,
) {
  if (profile === null)
    return null;

  const parsed = parse(profile);
  if (parsed.userId !== userId)
    throw new Error("User Profile candidate user does not match the publication target");
  if (parsed.sourceDirtyVersion !== dirtyVersion)
    throw new Error("User Profile candidate version does not match the publication target");
  return parsed;
}
