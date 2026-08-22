import type { SubjectAccessRecordV1 } from "@iam/api-core/subject-access";
import type { SubjectFactsCacheRecord } from "./profile-cache";
import type { PublishedProfile } from "./profile.schema";
import { isDeepStrictEqual } from "node:util";
import { createSubjectFactsCacheRecord } from "./profile-cache";
import {
  assertSubjectProjectionPage,
  requireNonNegativeSafeInteger,
  requirePositiveSafeInteger,
} from "./subject-projection-cutover.guards";

type InspectionResult<T>
  = | { status: "invalid" | "missing" }
    | { status: "valid"; record: T };

export interface ProfileV2MaintenancePageRow {
  userId: number;
  subjectIdentifier: string;
  accountAvailable: boolean;
  currentProfile: PublishedProfile | null;
  backfillCompleted: boolean;
  profileIssue: string | null;
}

export interface CreateProfileV2BackfillDeps {
  repository: {
    scanPage: (input: {
      afterUserId: number;
      limit: number;
    }) => Promise<ProfileV2MaintenancePageRow[]>;
    runBackfillTransaction: (input: {
      page: ProfileV2MaintenancePageRow[];
      observedAt: Date;
    }) => Promise<{
      profiles: PublishedProfile[];
      rebuilt: number;
      reused: number;
    }>;
  };
  subjectFacts: {
    publishMany: (records: SubjectFactsCacheRecord[]) => Promise<{
      published: number;
      retainedNewer: number;
    }>;
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<SubjectFactsCacheRecord>>>;
  };
  subjectAccess: {
    seedMany: (
      records: Array<{
        subjectIdentifier: string;
        state: "enabled" | "disabled";
      }>,
      seededAt: Date,
    ) => Promise<{ seeded: number; retainedExisting: number }>;
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<SubjectAccessRecordV1>>>;
  };
  clock: { nowDate: () => Date };
}

export function createProfileV2Backfill(deps: CreateProfileV2BackfillDeps) {
  return {
    async backfillBatch(input: {
      version: 2;
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
      const observedAt = deps.clock.nowDate();
      const postgres = await deps.repository.runBackfillTransaction({ page, observedAt });
      assertProfilesMatchPage(postgres.profiles, page);
      if (postgres.rebuilt + postgres.reused !== page.length)
        throw new Error("Profile V2 backfill returned an incomplete PostgreSQL batch");

      const expectedFacts = postgres.profiles.map(profile =>
        createSubjectFactsCacheRecord(profile, profile.rebuiltAt));
      const facts = await deps.subjectFacts.publishMany(expectedFacts);
      const expectedAccess = page.map(row => ({
        subjectIdentifier: row.subjectIdentifier,
        state: row.accountAvailable ? "enabled" as const : "disabled" as const,
      }));
      const barriers = await deps.subjectAccess.seedMany(expectedAccess, observedAt);
      const subjectIdentifiers = page.map(row => row.subjectIdentifier);
      const factsInspection = await deps.subjectFacts.inspectMany(subjectIdentifiers);
      const accessInspection = await deps.subjectAccess.inspectMany(subjectIdentifiers);
      if (
        factsInspection.length !== expectedFacts.length
        || factsInspection.some((inspection, index) =>
          inspection.status !== "valid"
          || !isDeepStrictEqual(inspection.record, expectedFacts[index]))
      ) {
        throw new Error("Subject Facts inspection did not match the Profile V2 batch");
      }
      if (
        accessInspection.length !== expectedAccess.length
        || accessInspection.some((inspection, index) =>
          inspection.status !== "valid"
          || inspection.record.subjectIdentifier !== expectedAccess[index]!.subjectIdentifier
          || inspection.record.state !== expectedAccess[index]!.state)
      ) {
        throw new Error("Subject Access inspection did not match the Profile V2 batch");
      }

      return {
        version: input.version,
        afterUserId: input.afterUserId,
        nextAfterUserId: page.at(-1)!.userId,
        complete: page.length < input.batchSize,
        scanned: page.length,
        rebuilt: postgres.rebuilt,
        reused: postgres.reused,
        facts,
        barriers,
      };
    },
  };
}

export type ProfileV2Backfill = ReturnType<typeof createProfileV2Backfill>;

function assertProfilesMatchPage(
  profiles: PublishedProfile[],
  page: ProfileV2MaintenancePageRow[],
) {
  if (
    profiles.length !== page.length
    || profiles.some((profile, index) =>
      profile.userId !== page[index]!.userId
      || profile.subjectIdentifier !== page[index]!.subjectIdentifier)
  ) {
    throw new Error("Profile V2 backfill returned a mismatched PostgreSQL batch");
  }
}
