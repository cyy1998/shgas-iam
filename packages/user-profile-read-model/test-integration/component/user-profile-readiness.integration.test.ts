import type { PublishedProfile } from "../../src/profile.schema";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import {
  createUserProfilePostgresGate,
  createUserProfileRedisAccessGate,
} from "../../src/user-profile-readiness";

const observedAt = new Date("2026-08-22T04:00:00.000Z");

describe("version-independent User Profile readiness gates", () => {
  test("pins the PostgreSQL gate version in composition and rebuilds every profile", async () => {
    const stored = v3Profile(1, "3");
    const expected = { ...stored, name: "Current name" };
    const rebuildExpected = mock(async () => [expected]);
    const gate = createUserProfilePostgresGate({
      schemaVersion: 3,
      repository: {
        readVerificationSummary: mock(async () => summary(1)),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored)] : []),
        rebuildExpected,
      },
      clock: { nowDate: () => observedAt },
    });

    const report = await gate.verify({ batchSize: 100 });

    expect(rebuildExpected).toHaveBeenCalledWith([stored], observedAt);
    expect(report).toEqual({
      version: 3,
      gate: "postgres",
      verifiedAt: observedAt.toISOString(),
      status: "failed",
      counts: { users: 1, profiles: 1, verifiedUsers: 1 },
      failures: [{
        code: "profile-authoritative-mismatch",
        count: 1,
        samples: ["user:1"],
      }],
    });
  });

  test("pins the Redis gate version and compares Facts plus Subject Access for all users", async () => {
    const stored = v3Profile(1, "3");
    const expectedFacts = factsRecord(stored);
    const staleFacts = {
      ...expectedFacts,
      profile: { ...expectedFacts.profile, name: "Older name" },
    };
    const gate = createUserProfileRedisAccessGate({
      schemaVersion: 3,
      inventory: {
        readVerificationSummary: mock(async () => summary(1)),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored)] : []),
      },
      subjectFacts: {
        createRecord: factsRecord,
        inspectMany: mock(async () => [{ status: "valid" as const, record: staleFacts }]),
      },
      subjectAccess: {
        inspectMany: mock(async () => [{
          status: "valid" as const,
          record: barrierRecord(stored, "disabled"),
        }]),
      },
      clock: { nowDate: () => observedAt },
    });

    await expect(gate.verify({ batchSize: 100 })).resolves.toEqual({
      version: 3,
      gate: "redis-access",
      verifiedAt: observedAt.toISOString(),
      status: "failed",
      counts: { users: 1, profiles: 1, verifiedUsers: 1 },
      failures: [
        { code: "facts-mismatch", count: 1, samples: ["user:1"] },
        { code: "barrier-state-mismatch", count: 1, samples: ["user:1"] },
      ],
    });
  });

  test("fails the complete inventory when profile counts or orphan rows disagree", async () => {
    const stored = v3Profile(1, "3");
    const gate = createUserProfilePostgresGate({
      schemaVersion: 3,
      repository: {
        readVerificationSummary: mock(async () => ({
          userCount: 1,
          profileCount: 2,
          profileSubjectCount: 2,
          distinctProfileSubjectCount: 2,
          orphanProfileCount: 1,
        })),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored)] : []),
        rebuildExpected: mock(async () => [stored]),
      },
      clock: { nowDate: () => observedAt },
    });

    const report = await gate.verify({ batchSize: 100 });

    expect(report.failures).toEqual([
      { code: "profile-count-mismatch", count: 1, samples: [] },
      { code: "profile-subject-count-mismatch", count: 1, samples: [] },
      { code: "profile-subject-not-unique", count: 1, samples: [] },
      { code: "orphan-profile", count: 1, samples: [] },
    ]);
  });
});

function summary(count: number) {
  return {
    userCount: count,
    profileCount: count,
    profileSubjectCount: count,
    distinctProfileSubjectCount: count,
    orphanProfileCount: 0,
  };
}

function pageRow(currentProfile: ReturnType<typeof v3Profile>) {
  return {
    userId: currentProfile.userId,
    subjectIdentifier: currentProfile.subjectIdentifier,
    accountAvailable: true,
    currentProfile,
    backfillCompleted: true,
    profileIssue: null,
  };
}

function factsRecord(source: ReturnType<typeof v3Profile>) {
  return {
    schemaVersion: 3 as const,
    sourceDirtyVersion: source.sourceDirtyVersion,
    publishedAt: source.rebuiltAt.toISOString(),
    subjectIdentifier: source.subjectIdentifier,
    profile: { username: source.username, name: source.name, phone: source.mobile },
    facts: source.subjectFacts,
  };
}

function barrierRecord(
  source: ReturnType<typeof v3Profile>,
  state: "disabled" | "enabled",
) {
  return {
    version: 1 as const,
    subjectIdentifier: source.subjectIdentifier,
    state,
    transitionId: "10000000-0000-4000-8000-000000000001",
    updatedAt: observedAt.toISOString(),
  };
}

function v3Profile(userId: number, sourceDirtyVersion: string) {
  return {
    ...currentProfile(userId, sourceDirtyVersion),
    name: "Stale name",
    profileSchemaVersion: 3 as const,
    searchDoc: {
      user: {
        subjectIdentifier: `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`,
        username: `user-${userId}`,
        name: "Stale name",
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [],
    },
  };
}

function currentProfile(userId: number, sourceDirtyVersion: string): PublishedProfile {
  return {
    userId,
    subjectIdentifier: `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`,
    username: `user-${userId}`,
    name: `User ${userId}`,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: 3,
    sourceDirtyVersion,
    detail: {
      id: userId,
      username: `user-${userId}`,
      name: `User ${userId}`,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: userId,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: observedAt,
      updateTime: observedAt,
      employments: [],
      roles: [],
      privileges: [],
    },
    searchDoc: {
      user: {
        subjectIdentifier: `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`,
        username: `user-${userId}`,
        name: `User ${userId}`,
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: observedAt,
  };
}
