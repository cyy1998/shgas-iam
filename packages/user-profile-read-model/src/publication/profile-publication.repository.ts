import type { PublishedProfile } from "../schema/profile.schema";
import type { UserProfilePublicationDb } from "./user-profile-publication.core";
import { PublishedProfileSchema } from "../schema/profile.schema";
import { createPublishedProfileRepository } from "./published-profile.repository";
import { createVersionedUserProfilePublicationRepository } from "./user-profile-publication.core";

export interface ProfilePublicationPort {
  publishCandidate: (input: {
    userId: number;
    dirtyVersion: string;
    profile: PublishedProfile | null;
    processedAt: Date;
  }) => Promise<
    | { status: "published" }
    | { status: "missing" }
    | { status: "stale" }
  >;
}

export function createProfilePublicationRepository(
  db: UserProfilePublicationDb,
): ProfilePublicationPort {
  return createVersionedUserProfilePublicationRepository(db, {
    parse: input => PublishedProfileSchema.parse(input),
    upsert: (tx, profile) => createPublishedProfileRepository(tx).upsert(profile),
  });
}
