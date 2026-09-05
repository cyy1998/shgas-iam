import type { PublishedUserProfile } from "../schema/user-profile.schema";
import type { UserProfilePublicationDb } from "./user-profile-publication.core";
import { PublishedUserProfileSchema } from "../schema/user-profile.schema";
import { createLegacyV1UserProfileRepository } from "./legacy-v1-user-profile.repository";
import { createVersionedUserProfilePublicationRepository } from "./user-profile-publication.core";

export type { UserProfilePublicationDb } from "./user-profile-publication.core";

export function createUserProfilePublicationRepository(
  db: UserProfilePublicationDb,
) {
  return createVersionedUserProfilePublicationRepository<PublishedUserProfile>(db, {
    parse: input => PublishedUserProfileSchema.parse(input),
    upsert: (tx, profile) => createLegacyV1UserProfileRepository(tx).upsertProfile(profile),
  });
}
