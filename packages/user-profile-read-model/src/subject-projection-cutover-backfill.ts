import type { PublishedUserProfile } from "./user-profile.schema";
import { createSubjectFactsCacheRecord } from "./subject-facts-cache";
import {
  assertSubjectProjectionPage,
  requireNonNegativeSafeInteger,
  requirePositiveSafeInteger,
} from "./subject-projection-cutover.guards";

export interface SubjectProjectionCutoverPageRow {
  userId: number;
  subjectIdentifier: string;
  accountAvailable: boolean;
  currentProfile: PublishedUserProfile | null;
}

export interface SubjectProjectionCutoverBuildTarget {
  userId: number;
  sourceDirtyVersion: string;
}

export interface CreateSubjectProjectionCutoverBackfillDeps {
  repository: {
    scanPage: (input: {
      afterUserId: number;
      limit: number;
    }) => Promise<SubjectProjectionCutoverPageRow[]>;
    prepareBatch: (
      userIds: number[],
      preparedAt: Date,
    ) => Promise<SubjectProjectionCutoverBuildTarget[]>;
    publishBatch: (
      profiles: PublishedUserProfile[],
      processedAt: Date,
    ) => Promise<{ published: number }>;
  };
  builder: {
    buildMany: (
      targets: SubjectProjectionCutoverBuildTarget[],
    ) => Promise<PublishedUserProfile[]>;
  };
  subjectFacts: {
    publishMany: (
      records: ReturnType<typeof createSubjectFactsCacheRecord>[],
    ) => Promise<{ published: number; retainedNewer: number }>;
  };
  subjectAccess: {
    seedMany: (
      records: Array<{
        subjectIdentifier: string;
        state: "enabled" | "disabled";
      }>,
      seededAt: Date,
    ) => Promise<{ seeded: number; retainedExisting: number }>;
  };
  clock: {
    nowDate: () => Date;
  };
}

export function createSubjectProjectionCutoverBackfill(
  deps: CreateSubjectProjectionCutoverBackfillDeps,
) {
  async function backfillBatch(input: {
    version: 1;
    afterUserId: number;
    batchSize: number;
  }) {
    requireNonNegativeSafeInteger(input.afterUserId, "afterUserId");
    requirePositiveSafeInteger(input.batchSize, "batchSize");
    const page = await deps.repository.scanPage({
      afterUserId: input.afterUserId,
      limit: input.batchSize,
    });
    if (page.length === 0) {
      return {
        version: input.version,
        afterUserId: input.afterUserId,
        nextAfterUserId: input.afterUserId,
        complete: true,
        scanned: 0,
        rebuilt: 0,
        reused: 0,
        facts: { published: 0, retainedNewer: 0 },
        barriers: { seeded: 0, retainedExisting: 0 },
      };
    }
    assertSubjectProjectionPage(page, input.afterUserId, input.batchSize);

    const incompleteUserIds = page
      .filter(row => row.currentProfile === null)
      .map(row => row.userId);
    const now = deps.clock.nowDate();
    const targets = incompleteUserIds.length === 0
      ? []
      : await deps.repository.prepareBatch(incompleteUserIds, now);
    assertTargets(targets, incompleteUserIds);
    const rebuiltProfiles = targets.length === 0
      ? []
      : await deps.builder.buildMany(targets);
    assertBuiltProfiles(rebuiltProfiles, targets);
    if (rebuiltProfiles.length > 0) {
      const publication = await deps.repository.publishBatch(rebuiltProfiles, now);
      if (publication.published !== rebuiltProfiles.length) {
        throw new Error("Subject Projection cutover batch was not published atomically");
      }
    }

    const rebuiltByUserId = new Map(
      rebuiltProfiles.map(profile => [profile.userId, profile]),
    );
    const profiles = page.map((row) => {
      const profile = row.currentProfile ?? rebuiltByUserId.get(row.userId);
      if (profile === undefined) {
        throw new Error(`Subject Projection cutover did not build user ${row.userId}`);
      }
      if (profile.subjectIdentifier !== row.subjectIdentifier) {
        throw new Error(`Subject Projection cutover changed user ${row.userId} Subject Identifier`);
      }
      return profile;
    });
    const facts = await deps.subjectFacts.publishMany(
      profiles.map(profile => createSubjectFactsCacheRecord(profile, now)),
    );
    const barriers = await deps.subjectAccess.seedMany(
      page.map(row => ({
        subjectIdentifier: row.subjectIdentifier,
        state: row.accountAvailable ? "enabled" as const : "disabled" as const,
      })),
      now,
    );
    const nextAfterUserId = page.at(-1)!.userId;
    return {
      version: input.version,
      afterUserId: input.afterUserId,
      nextAfterUserId,
      complete: page.length < input.batchSize,
      scanned: page.length,
      rebuilt: rebuiltProfiles.length,
      reused: page.length - rebuiltProfiles.length,
      facts,
      barriers,
    };
  }

  return { backfillBatch };
}

export type SubjectProjectionCutoverBackfill = ReturnType<
  typeof createSubjectProjectionCutoverBackfill
>;

function assertTargets(
  targets: SubjectProjectionCutoverBuildTarget[],
  expectedUserIds: number[],
) {
  if (
    targets.length !== expectedUserIds.length
    || targets.some((target, index) => target.userId !== expectedUserIds[index])
  ) {
    throw new Error("Subject Projection cutover could not prepare the complete batch");
  }
}

function assertBuiltProfiles(
  profiles: PublishedUserProfile[],
  targets: SubjectProjectionCutoverBuildTarget[],
) {
  const targetVersions = new Map(
    targets.map(target => [target.userId, target.sourceDirtyVersion]),
  );
  if (
    profiles.length !== targets.length
    || profiles.some(profile =>
      targetVersions.get(profile.userId) !== profile.sourceDirtyVersion)
  ) {
    throw new Error("Subject Projection cutover builder returned an incomplete batch");
  }
}
