import type { DbClient } from "@iam/db";
import type { PublishedProfileRowInput } from "./profile-storage.schema";
import type {
  CreateSubjectFactsRedisPublisherOptions,
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "./subject-facts-redis-publisher.core";
import {
  createMonotonicSubjectFactsRedisPublisher,
  createSubjectFactsRedisInspector,
} from "./subject-facts-redis-publisher.core";
import { createVersionedUserProfilePublicationRepository } from "./user-profile-publication.core";
import { createUserProfileRowRepository } from "./user-profile-row.repository";

export interface UserProfileProjectionBundle<
  TProfile extends PublishedProfileRowInput,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
> {
  readonly schemaVersion: number;
  readonly parseProfileRow: (input: PublishedProfileRowInput) => TProfile;
  readonly createBuilder: (input: {
    db: DbClient;
    clock: { nowDate: () => Date };
    batchSize: number;
  }) => {
    buildOne: (target: { userId: number; sourceDirtyVersion: string }) => Promise<TProfile | null>;
    buildMany: (
      targets: Array<{ userId: number; sourceDirtyVersion: string }>,
    ) => Promise<TProfile[]>;
  };
  readonly createRowRepository: typeof createUserProfileRowRepository;
  readonly createPublicationRepository: (
    db: Parameters<typeof createVersionedUserProfilePublicationRepository<TProfile>>[0],
  ) => ReturnType<typeof createVersionedUserProfilePublicationRepository<TProfile>>;
  readonly subjectFacts: {
    createRecord: (profile: TProfile, publishedAt: Date) => TFactsRecord;
    createPublisher: (
      redis: SubjectFactsRedisClient,
      options?: CreateSubjectFactsRedisPublisherOptions,
    ) => ReturnType<typeof createMonotonicSubjectFactsRedisPublisher<TFactsRecord>>;
    createInspector: (
      redis: SubjectFactsRedisInspectionClient,
      options?: CreateSubjectFactsRedisPublisherOptions,
    ) => ReturnType<typeof createSubjectFactsRedisInspector<TFactsRecord>>;
  };
}

export function createUserProfileProjectionBundle<
  TProfile extends PublishedProfileRowInput,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceDirtyVersion: string;
  },
>(input: {
  schemaVersion: number;
  parseProfileRow: (row: PublishedProfileRowInput) => TProfile;
  createBuilder: UserProfileProjectionBundle<TProfile, TFactsRecord>["createBuilder"];
  createFactsRecord: (profile: TProfile, publishedAt: Date) => TFactsRecord;
  parseFactsRecord: (input: unknown) => TFactsRecord;
}): UserProfileProjectionBundle<TProfile, TFactsRecord> {
  return {
    schemaVersion: input.schemaVersion,
    parseProfileRow: input.parseProfileRow,
    createBuilder: input.createBuilder,
    createRowRepository: createUserProfileRowRepository,
    createPublicationRepository(db) {
      return createVersionedUserProfilePublicationRepository(db, {
        parse: profile => input.parseProfileRow(profile),
        upsert: async (tx, profile) =>
          await createUserProfileRowRepository(tx).upsert(profile),
      });
    },
    subjectFacts: {
      createRecord: input.createFactsRecord,
      createPublisher(redis, options = {}) {
        return createMonotonicSubjectFactsRedisPublisher(
          redis,
          input.parseFactsRecord,
          options,
        );
      },
      createInspector(redis, options = {}) {
        return createSubjectFactsRedisInspector(
          redis,
          input.parseFactsRecord,
          options,
        );
      },
    },
  };
}
