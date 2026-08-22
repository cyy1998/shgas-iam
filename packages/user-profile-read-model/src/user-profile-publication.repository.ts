import type { UserProfilePublicationDb } from "./user-profile-publication.core";
import type { PublishedUserProfile } from "./user-profile.schema";
import { createLegacyV1UserProfileRepository } from "./legacy-v1-user-profile.repository";
import { createVersionedUserProfilePublicationRepository } from "./user-profile-publication.core";
import { PublishedUserProfileSchema } from "./user-profile.schema";

export type { UserProfilePublicationDb } from "./user-profile-publication.core";

export function createUserProfilePublicationRepository(
  db: UserProfilePublicationDb,
) {
  return createVersionedUserProfilePublicationRepository<PublishedUserProfile>(db, {
    parse: input => PublishedUserProfileSchema.parse(input),
    upsert: (tx, profile) => createLegacyV1UserProfileRepository(tx).upsertProfile(profile),
  });
}
