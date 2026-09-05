import type { PublishedProfile } from "../schema/profile.schema";
import type { SubjectFactsCacheRecord } from "../subject-facts/profile-cache";
import type { ProfilePublicationPort } from "./profile-publication.repository";
import { createSubjectFactsCacheRecord } from "../subject-facts/profile-cache";

export interface UserProfileCachePublisherPort {
  publish: (record: SubjectFactsCacheRecord) => Promise<{
    status: "published" | "retained-newer";
  }>;
}

export function createProfilePublicationService(deps: {
  profilePublication: ProfilePublicationPort;
  cachePublisher: UserProfileCachePublisherPort;
}) {
  return {
    async publish(input: {
      userId: number;
      dirtyVersion: string;
      profile: PublishedProfile | null;
      processedAt: Date;
    }) {
      const profileResult = await deps.profilePublication.publishCandidate(input);
      if (profileResult.status !== "published" || input.profile === null) {
        return {
          profileStatus: profileResult.status,
          cacheStatus: "skipped" as const,
        };
      }

      const cacheRecord = createSubjectFactsCacheRecord(
        input.profile,
        input.processedAt,
      );
      try {
        const cacheResult = await deps.cachePublisher.publish(cacheRecord);
        return {
          profileStatus: profileResult.status,
          cacheStatus: cacheResult.status,
        };
      }
      catch {
        return {
          profileStatus: profileResult.status,
          cacheStatus: "failed" as const,
        };
      }
    },
  };
}
