import type { SubjectAccessRecordV1 } from "@iam/api-core/subject-access";
import type { SubjectFactsCacheRecordV1 } from "./subject-facts-cache";
import type { SubjectProjectionCutoverPageRow } from "./subject-projection-cutover-backfill";
import {
  assertSubjectProjectionPage,
  requirePositiveSafeInteger,
} from "./subject-projection-cutover.guards";

export interface SubjectProjectionVerificationSummary {
  userCount: number;
  profileCount: number;
  profileSubjectCount: number;
  distinctProfileSubjectCount: number;
  orphanProfileCount: number;
}

type InspectionResult<T>
  = | { status: "invalid" | "missing" }
    | { status: "valid"; record: T };

export interface CreateSubjectProjectionCutoverVerifierDeps<
  TManifest extends { cutoverId: string },
> {
  projection: {
    readVerificationSummary: () => Promise<SubjectProjectionVerificationSummary>;
    scanPage: (input: {
      afterUserId: number;
      limit: number;
    }) => Promise<SubjectProjectionCutoverPageRow[]>;
  };
  subjectFacts: {
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<SubjectFactsCacheRecordV1>>>;
  };
  subjectAccess: {
    inspectMany: (
      subjectIdentifiers: string[],
    ) => Promise<Array<InspectionResult<SubjectAccessRecordV1>>>;
  };
  clients: {
    verifyManifest: (manifest: TManifest) => Promise<{
      failures: Array<{ clientCode: string; reason: string }>;
    }>;
  };
  clock: {
    nowDate: () => Date;
  };
}

export interface SubjectProjectionCutoverVerificationFailure {
  code: string;
  count: number;
  samples: string[];
}

export function createSubjectProjectionCutoverVerifier<
  TManifest extends { cutoverId: string },
>(
  deps: CreateSubjectProjectionCutoverVerifierDeps<TManifest>,
) {
  async function verify(input: {
    version: 1;
    batchSize: number;
    manifest: TManifest;
  }) {
    requirePositiveSafeInteger(input.batchSize, "batchSize");
    const failures = createFailureCollector();
    const summary = await deps.projection.readVerificationSummary();
    collectSummaryFailures(summary, failures.add);
    let afterUserId = 0;
    let verifiedUsers = 0;

    while (true) {
      const page = await deps.projection.scanPage({
        afterUserId,
        limit: input.batchSize,
      });
      if (page.length === 0)
        break;
      assertSubjectProjectionPage(page, afterUserId, input.batchSize);
      verifiedUsers += page.length;
      const subjectIdentifiers = page.map(row => row.subjectIdentifier);
      const [facts, access] = await Promise.all([
        deps.subjectFacts.inspectMany(subjectIdentifiers),
        deps.subjectAccess.inspectMany(subjectIdentifiers),
      ]);
      assertInspectionCount("Subject Facts", facts, page.length);
      assertInspectionCount("Subject Access", access, page.length);

      page.forEach((row, index) => {
        const profile = row.currentProfile;
        if (profile === null)
          failures.add("profile-not-current", `user:${row.userId}`);

        const factsResult = facts[index]!;
        if (factsResult.status !== "valid") {
          failures.add(`facts-${factsResult.status}`, row.subjectIdentifier);
        }
        else if (
          factsResult.record.subjectIdentifier !== row.subjectIdentifier
          || (profile !== null
            && factsResult.record.sourceDirtyVersion !== profile.sourceDirtyVersion)
        ) {
          failures.add("facts-version-mismatch", row.subjectIdentifier);
        }

        const accessResult = access[index]!;
        if (accessResult.status !== "valid") {
          failures.add(`barrier-${accessResult.status}`, row.subjectIdentifier);
        }
        else if (
          accessResult.record.subjectIdentifier !== row.subjectIdentifier
          || accessResult.record.state !== (row.accountAvailable ? "enabled" : "disabled")
        ) {
          failures.add("barrier-state-mismatch", row.subjectIdentifier);
        }
      });

      afterUserId = page.at(-1)!.userId;
      if (page.length < input.batchSize)
        break;
    }

    if (verifiedUsers !== summary.userCount) {
      failures.addDifference(
        "verified-user-count-mismatch",
        summary.userCount,
        verifiedUsers,
      );
    }
    const clientVerification = await deps.clients.verifyManifest(input.manifest);
    for (const failure of clientVerification.failures) {
      failures.add(`client-${failure.reason}`, failure.clientCode);
    }
    const failureReport = failures.report();
    return {
      version: input.version,
      cutoverId: input.manifest.cutoverId,
      verifiedAt: deps.clock.nowDate().toISOString(),
      status: failureReport.length === 0 ? "passed" as const : "failed" as const,
      counts: {
        users: summary.userCount,
        profiles: summary.profileCount,
        verifiedUsers,
      },
      failures: failureReport,
    };
  }

  return { verify };
}

export type SubjectProjectionCutoverVerifier<
  TManifest extends { cutoverId: string },
> = ReturnType<typeof createSubjectProjectionCutoverVerifier<TManifest>>;

function collectSummaryFailures(
  summary: SubjectProjectionVerificationSummary,
  add: (code: string, sample: string, count?: number) => void,
) {
  if (summary.profileCount !== summary.userCount) {
    add(
      "profile-count-mismatch",
      `expected:${summary.userCount}`,
      Math.abs(summary.userCount - summary.profileCount),
    );
    add("profile-count-mismatch", `actual:${summary.profileCount}`, 0);
  }
  if (summary.profileSubjectCount !== summary.userCount) {
    add(
      "profile-subject-count-mismatch",
      `expected:${summary.userCount}`,
      Math.abs(summary.userCount - summary.profileSubjectCount),
    );
    add("profile-subject-count-mismatch", `actual:${summary.profileSubjectCount}`, 0);
  }
  if (summary.distinctProfileSubjectCount !== summary.userCount) {
    add(
      "profile-subject-not-unique",
      `expected:${summary.userCount}`,
      Math.abs(summary.userCount - summary.distinctProfileSubjectCount),
    );
    add(
      "profile-subject-not-unique",
      `actual:${summary.distinctProfileSubjectCount}`,
      0,
    );
  }
  if (summary.orphanProfileCount > 0)
    add("orphan-profile", `count:${summary.orphanProfileCount}`, summary.orphanProfileCount);
}

function createFailureCollector() {
  const failures = new Map<string, { count: number; samples: string[] }>();
  function add(code: string, sample: string, count = 1) {
    const current = failures.get(code) ?? { count: 0, samples: [] };
    current.count += count;
    if (current.samples.length < 10 && !current.samples.includes(sample))
      current.samples.push(sample);
    failures.set(code, current);
  }
  function addDifference(code: string, expected: number, actual: number) {
    add(code, `expected:${expected}`, Math.abs(expected - actual));
    add(code, `actual:${actual}`, 0);
  }
  function report(): SubjectProjectionCutoverVerificationFailure[] {
    return [...failures.entries()]
      .sort(([left], [right]) =>
        failureOrder(left) - failureOrder(right) || left.localeCompare(right))
      .map(([code, failure]) => ({
        code,
        count: failure.count,
        samples: failure.samples,
      }));
  }
  return { add, addDifference, report };
}

function failureOrder(code: string) {
  const exactOrder: Record<string, number> = {
    "profile-count-mismatch": 0,
    "profile-subject-count-mismatch": 1,
    "profile-subject-not-unique": 2,
    "orphan-profile": 3,
    "profile-not-current": 10,
    "facts-version-mismatch": 20,
    "facts-missing": 21,
    "facts-invalid": 22,
    "barrier-state-mismatch": 30,
    "barrier-missing": 31,
    "barrier-invalid": 32,
    "verified-user-count-mismatch": 40,
  };
  return exactOrder[code] ?? (code.startsWith("client-") ? 50 : 100);
}

function assertInspectionCount(
  name: string,
  results: unknown[],
  expected: number,
) {
  if (results.length !== expected)
    throw new Error(`${name} verification returned an incomplete batch`);
}
