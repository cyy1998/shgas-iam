import type { DbClient } from "@iam/db";
import type { PublishedProfile } from "../schema/profile.schema";
import { PublishedProfileSchema } from "../schema/profile.schema";
import { createUserProfileRowRepository } from "./user-profile-row.repository";

export function createPublishedProfileRepository(db: DbClient) {
  const rowRepository = createUserProfileRowRepository(db);
  return {
    async upsert(input: PublishedProfile) {
      return await rowRepository.upsert(PublishedProfileSchema.parse(input));
    },
  };
}
