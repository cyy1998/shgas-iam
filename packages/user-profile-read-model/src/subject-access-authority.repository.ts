import type { DbClient } from "@iam/db";
import type { SubjectFactsPublisherPort } from "./user-profile-rebuild.processor";
import {
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import {
  userProfileDirty,
  userProfiles,
  users,
} from "@iam/db/schema";
import { eq } from "drizzle-orm";
import { SubjectFactsCacheRecordV1Schema } from "./subject-facts-cache";

export interface CreateSubjectAccessAuthorityRepositoryOptions {
  readonly db: DbClient;
  readonly subjectFactsPublisher: SubjectFactsPublisherPort;
}

export function createSubjectAccessAuthorityRepository(
  options: CreateSubjectAccessAuthorityRepositoryOptions,
) {
  return {
    async resolve(subjectIdentifier: string) {
      const rows = await options.db
        .select({
          accountStatus: users.status,
          accountDeleted: users.isDelete,
          profileSubjectIdentifier: userProfiles.subjectIdentifier,
          username: userProfiles.username,
          name: userProfiles.name,
          mobile: userProfiles.mobile,
          profileSchemaVersion: userProfiles.profileSchemaVersion,
          sourceDirtyVersion: userProfiles.sourceDirtyVersion,
          subjectFacts: userProfiles.subjectFacts,
          rebuiltAt: userProfiles.rebuiltAt,
          dirtyVersion: userProfileDirty.dirtyVersion,
          dirtyStatus: userProfileDirty.status,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .leftJoin(userProfileDirty, eq(userProfileDirty.userId, users.id))
        .where(eq(users.subjectIdentifier, subjectIdentifier))
        .limit(1);
      const row = rows[0];
      if (
        row === undefined
        || row.accountStatus !== UserStatus.Enable
        || row.accountDeleted
      ) {
        return {
          accountState: "disabled" as const,
          factsState: "not_current" as const,
        };
      }

      if (
        row.dirtyStatus !== UserProfileDirtyStatus.Processed
        || row.dirtyVersion === null
        || row.sourceDirtyVersion !== row.dirtyVersion
      ) {
        return {
          accountState: "enabled" as const,
          factsState: "not_current" as const,
        };
      }

      const record = SubjectFactsCacheRecordV1Schema.safeParse({
        schemaVersion: row.profileSchemaVersion,
        sourceDirtyVersion: row.sourceDirtyVersion,
        publishedAt: row.rebuiltAt?.toISOString(),
        subjectIdentifier: row.profileSubjectIdentifier,
        profile: {
          username: row.username,
          name: row.name,
          phone: row.mobile,
        },
        facts: row.subjectFacts,
      });
      if (!record.success || record.data.subjectIdentifier !== subjectIdentifier) {
        return {
          accountState: "enabled" as const,
          factsState: "not_current" as const,
        };
      }

      await options.subjectFactsPublisher.publish(record.data);
      return {
        accountState: "enabled" as const,
        factsState: "current" as const,
      };
    },
  };
}

export type SubjectAccessAuthorityRepository = ReturnType<
  typeof createSubjectAccessAuthorityRepository
>;
