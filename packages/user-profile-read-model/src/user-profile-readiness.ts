import type { SubjectAccessRecordV1 } from "@iam/api-core/subject-access";
import { isDeepStrictEqual } from "node:util";
import {
  assertSubjectProjectionPage,
  requirePositiveSafeInteger,
} from "./subject-projection-cutover.guards";

export interface UserProfileReadinessProjection {
  userId: number;
  subjectIdentifier: string;
  sourceDirtyVersion: string;
  rebuiltAt: Date;
}

export interface UserProfileReadinessPageRow<
  TProfile extends UserProfileReadinessProjection = UserProfileReadinessProjection,
> {
  userId: number;
  subjectIdentifier: string;
  accountAvailable: boolean;
  currentProfile: TProfile | null;
  backfillCompleted: boolean;
  profileIssue: string | null;
}

export interface UserProfileVerificationSummary {
  userCount: number;
  profileCount: number;
  profileSubjectCount: number;
  distinctProfileSubjectCount: number;
  orphanProfileCount: number;
}

export interface UserProfileReadinessInventoryPort<
  TProfile extends UserProfileReadinessProjection = UserProfileReadinessProjection,
> {
  readVerificationSummary: () => Promise<UserProfileVerificationSummary>;
  scanPage: (input: {
    afterUserId: number;
    limit: number;
  }) => Promise<Array<UserProfileReadinessPageRow<TProfile>>>;
}

export interface UserProfileGateFailure {
  code: string;
  count: number;
  samples: string[];
}

type InspectionResult<T>
  = | { status: "invalid" | "missing" }
    | { status: "valid"; record: T };

export function createUserProfilePostgresGate<
  TProfile extends UserProfileReadinessProjection,
>(deps: {
  schemaVersion: number;
  repository: UserProfileReadinessInventoryPort<TProfile> & {
    rebuildExpected: (
      profiles: TProfile[],
      observedAt: Date,
    ) => Promise<TProfile[]>;
  };
  clock: { nowDate: () => Date };
}) {
  return {
    async verify(input: { batchSize: number }) {
      const observedAt = deps.clock.nowDate();
      return await runUserProfileInventoryGate({
        version: deps.schemaVersion,
        gate: "postgres",
        observedAt,
        batchSize: input.batchSize,
        inventory: deps.repository,
        async checkPage(page, failures) {
          for (const row of page) {
            if (row.currentProfile === null)
              failures.add(row.profileIssue ?? "profile-invalid", row.userId);
            else if (!row.backfillCompleted)
              failures.add("profile-backfill-marker-missing", row.userId);
          }
          const currentProfiles = page
            .map(row => row.currentProfile)
            .filter((profile): profile is TProfile => profile !== null);
          const expectedProfiles = await deps.repository.rebuildExpected(
            currentProfiles,
            observedAt,
          );
          if (
            expectedProfiles.length !== currentProfiles.length
            || expectedProfiles.some((profile, index) =>
              profile.userId !== currentProfiles[index]!.userId)
          ) {
            throw new Error(
              "User Profile PostgreSQL gate authoritative rebuild was incomplete",
            );
          }
          currentProfiles.forEach((profile, index) => {
            if (!isDeepStrictEqual(
              withoutRebuiltAt(profile),
              withoutRebuiltAt(expectedProfiles[index]!),
            )) {
              failures.add("profile-authoritative-mismatch", profile.userId);
            }
          });
        },
      });
    },
  };
}

export function createUserProfileRedisAccessGate<
  TProfile extends UserProfileReadinessProjection,
  TFactsRecord,
>(deps: {
  schemaVersion: number;
  inventory: UserProfileReadinessInventoryPort<TProfile>;
  subjectFacts: {
    createRecord: (profile: TProfile, publishedAt: Date) => TFactsRecord;
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<TFactsRecord>>>;
  };
  subjectAccess: {
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<SubjectAccessRecordV1>>>;
  };
  clock: { nowDate: () => Date };
}) {
  return {
    async verify(input: { batchSize: number }) {
      const observedAt = deps.clock.nowDate();
      return await runUserProfileInventoryGate({
        version: deps.schemaVersion,
        gate: "redis-access",
        observedAt,
        batchSize: input.batchSize,
        inventory: deps.inventory,
        async checkPage(page, failures) {
          const subjectIdentifiers = page.map(row => row.subjectIdentifier);
          const facts = await deps.subjectFacts.inspectMany(subjectIdentifiers);
          const access = await deps.subjectAccess.inspectMany(subjectIdentifiers);
          if (facts.length !== page.length || access.length !== page.length) {
            throw new Error(
              "User Profile Redis gate inspection returned an incomplete batch",
            );
          }
          page.forEach((row, index) => {
            if (row.currentProfile !== null && !row.backfillCompleted)
              failures.add("profile-backfill-marker-missing", row.userId);
            const factsResult = facts[index]!;
            if (factsResult.status !== "valid") {
              failures.add(`facts-${factsResult.status}`, row.userId);
            }
            else if (row.currentProfile === null) {
              failures.add("facts-without-current-profile", row.userId);
            }
            else {
              const expected = deps.subjectFacts.createRecord(
                row.currentProfile,
                row.currentProfile.rebuiltAt,
              );
              if (!isDeepStrictEqual(factsResult.record, expected))
                failures.add("facts-mismatch", row.userId);
            }

            const accessResult = access[index]!;
            if (accessResult.status !== "valid") {
              failures.add(`barrier-${accessResult.status}`, row.userId);
            }
            else if (
              accessResult.record.subjectIdentifier !== row.subjectIdentifier
              || accessResult.record.state !== (row.accountAvailable ? "enabled" : "disabled")
            ) {
              failures.add("barrier-state-mismatch", row.userId);
            }
          });
        },
      });
    },
  };
}

async function runUserProfileInventoryGate<
  TProfile extends UserProfileReadinessProjection,
>(input: {
  version: number;
  gate: "postgres" | "redis-access";
  batchSize: number;
  observedAt: Date;
  inventory: UserProfileReadinessInventoryPort<TProfile>;
  checkPage: (
    page: Array<UserProfileReadinessPageRow<TProfile>>,
    failures: ReturnType<typeof createUserProfileGateFailureCollector>,
  ) => Promise<void>;
}) {
  requirePositiveSafeInteger(input.batchSize, "batchSize");
  const summary = await input.inventory.readVerificationSummary();
  const failures = createUserProfileGateFailureCollector();
  collectUserProfileSummaryFailures(summary, failures.add);
  let afterUserId = 0;
  let verifiedUsers = 0;
  while (true) {
    const page = await input.inventory.scanPage({
      afterUserId,
      limit: input.batchSize,
    });
    if (page.length === 0)
      break;
    assertSubjectProjectionPage(page, afterUserId, input.batchSize);
    verifiedUsers += page.length;
    await input.checkPage(page, failures);
    afterUserId = page.at(-1)!.userId;
    if (page.length < input.batchSize)
      break;
  }
  if (verifiedUsers !== summary.userCount) {
    failures.add(
      "verified-user-count-mismatch",
      undefined,
      Math.abs(summary.userCount - verifiedUsers),
    );
  }
  const report = failures.report();
  return {
    version: input.version,
    gate: input.gate,
    verifiedAt: input.observedAt.toISOString(),
    status: report.length === 0 ? "passed" as const : "failed" as const,
    counts: {
      users: summary.userCount,
      profiles: summary.profileCount,
      verifiedUsers,
    },
    failures: report,
  };
}

function createUserProfileGateFailureCollector() {
  const failures = new Map<string, { count: number; samples: string[] }>();
  return {
    add(code: string, userId?: number, count = 1) {
      const failure = failures.get(code) ?? { count: 0, samples: [] };
      failure.count += count;
      const sample = userId === undefined ? undefined : `user:${userId}`;
      if (
        sample !== undefined
        && failure.samples.length < 10
        && !failure.samples.includes(sample)
      ) {
        failure.samples.push(sample);
      }
      failures.set(code, failure);
    },
    report(): UserProfileGateFailure[] {
      return [...failures].map(([code, failure]) => ({ code, ...failure }));
    },
  };
}

function collectUserProfileSummaryFailures(
  summary: UserProfileVerificationSummary,
  add: (code: string, userId?: number, count?: number) => void,
) {
  if (summary.profileCount !== summary.userCount) {
    add("profile-count-mismatch", undefined, Math.abs(
      summary.userCount - summary.profileCount,
    ));
  }
  if (summary.profileSubjectCount !== summary.userCount) {
    add("profile-subject-count-mismatch", undefined, Math.abs(
      summary.userCount - summary.profileSubjectCount,
    ));
  }
  if (summary.distinctProfileSubjectCount !== summary.userCount) {
    add("profile-subject-not-unique", undefined, Math.abs(
      summary.userCount - summary.distinctProfileSubjectCount,
    ));
  }
  if (summary.orphanProfileCount > 0)
    add("orphan-profile", undefined, summary.orphanProfileCount);
}

function withoutRebuiltAt<TProfile extends UserProfileReadinessProjection>(
  profile: TProfile,
) {
  const { rebuiltAt: _rebuiltAt, ...comparable } = profile;
  return comparable;
}
