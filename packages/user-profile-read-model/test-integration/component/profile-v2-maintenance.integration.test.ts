import type { PublishedProfile } from "../../src/profile.schema";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createProfileV2Backfill } from "../../src/profile-v2-backfill";
import { createProfileV2PostgresGate } from "../../src/profile-v2-postgres-gate";
import { createProfileV2RedisAccessGate } from "../../src/profile-v2-redis-access-gate";

const observedAt = new Date("2026-08-21T04:00:00.000Z");

describe("Profile V2 controlled backfill", () => {
  test("returns a safe cursor only after exact V2 Facts and Barrier inspection", async () => {
    const current = profile(1, "3", UserStatus.Enable, false);
    const rebuilt = profile(2, "7", UserStatus.Disable, true);
    const order: string[] = [];
    const runBackfillTransaction = mock(async () => {
      order.push("postgres");
      return { profiles: [current, rebuilt], rebuilt: 1, reused: 1 };
    });
    const publishMany = mock(async () => {
      order.push("facts");
      return { published: 2, retainedNewer: 0 };
    });
    const seedMany = mock(async () => {
      order.push("barrier");
      return { seeded: 1, retainedExisting: 1 };
    });
    const inspectFacts = mock(async () => {
      order.push("inspect-facts");
      return [current, rebuilt].map(item => ({
        status: "valid" as const,
        record: factsRecord(item),
      }));
    });
    const inspectAccess = mock(async () => {
      order.push("inspect-barrier");
      return [
        { status: "valid" as const, record: barrierRecord(current, "enabled") },
        { status: "valid" as const, record: barrierRecord(rebuilt, "disabled") },
      ];
    });
    const backfill = createProfileV2Backfill({
      repository: {
        scanPage: mock(async () => [
          pageRow(current, current),
          pageRow(rebuilt, null),
        ]),
        runBackfillTransaction,
      },
      subjectFacts: { publishMany, inspectMany: inspectFacts },
      subjectAccess: { seedMany, inspectMany: inspectAccess },
      clock: { nowDate: () => observedAt },
    });

    await expect(backfill.backfillBatch({
      version: 2,
      afterUserId: 0,
      batchSize: 2,
    })).resolves.toEqual({
      version: 2,
      afterUserId: 0,
      nextAfterUserId: 2,
      complete: false,
      scanned: 2,
      rebuilt: 1,
      reused: 1,
      facts: { published: 2, retainedNewer: 0 },
      barriers: { seeded: 1, retainedExisting: 1 },
    });
    expect(order).toEqual([
      "postgres",
      "facts",
      "barrier",
      "inspect-facts",
      "inspect-barrier",
    ]);
  });

  test("throws without a cursor when retained Barrier state disagrees", async () => {
    const current = profile(1, "3", UserStatus.Enable, false);
    const backfill = createProfileV2Backfill({
      repository: {
        scanPage: mock(async () => [pageRow(current, current)]),
        runBackfillTransaction: mock(async () => ({
          profiles: [current],
          rebuilt: 0,
          reused: 1,
        })),
      },
      subjectFacts: {
        publishMany: mock(async () => ({ published: 1, retainedNewer: 0 })),
        inspectMany: mock(async () => [{ status: "valid" as const, record: factsRecord(current) }]),
      },
      subjectAccess: {
        seedMany: mock(async () => ({ seeded: 0, retainedExisting: 1 })),
        inspectMany: mock(async () => [{
          status: "valid" as const,
          record: barrierRecord(current, "disabled"),
        }]),
      },
      clock: { nowDate: () => observedAt },
    });

    await expect(backfill.backfillBatch({
      version: 2,
      afterUserId: 0,
      batchSize: 1,
    })).rejects.toThrow("Subject Access inspection did not match the Profile V2 batch");
  });
});

describe("Profile V2 full gates", () => {
  test("PostgreSQL gate recomputes authoritative V2 documents at one observation time", async () => {
    const stored = profile(1, "3", UserStatus.Enable, false);
    const expected = profile(1, "3", UserStatus.Enable, false);
    expected.subjectFacts = { employments: [] };
    stored.name = "stale display name";
    const rebuildExpected = mock(async () => [expected]);
    const gate = createProfileV2PostgresGate({
      repository: {
        readVerificationSummary: mock(async () => ({
          userCount: 1,
          profileCount: 1,
          profileSubjectCount: 1,
          distinctProfileSubjectCount: 1,
          orphanProfileCount: 0,
        })),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored, stored)] : []),
        rebuildExpected,
      },
      clock: { nowDate: () => observedAt },
    });

    const report = await gate.verify({ version: 2, batchSize: 100 });

    expect(rebuildExpected).toHaveBeenCalledWith([stored], observedAt);
    expect(report).toEqual({
      version: 2,
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

  test("PostgreSQL gate rejects a strict current V2 Profile without the durable Backfill marker", async () => {
    const stored = profile(1, "3", UserStatus.Enable, false);
    const gate = createProfileV2PostgresGate({
      repository: {
        readVerificationSummary: mock(async () => ({
          userCount: 1,
          profileCount: 1,
          profileSubjectCount: 1,
          distinctProfileSubjectCount: 1,
          orphanProfileCount: 0,
        })),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0
            ? [{
                ...pageRow(stored, stored),
                backfillCompleted: false,
                profileIssue: "profile-backfill-marker-missing",
              }]
            : []),
        rebuildExpected: mock(async () => [stored]),
      },
      clock: { nowDate: () => observedAt },
    });

    const report = await gate.verify({ version: 2, batchSize: 100 });

    expect(report.failures).toEqual([{
      code: "profile-backfill-marker-missing",
      count: 1,
      samples: ["user:1"],
    }]);
  });

  test("Redis and Access gate compares the full V2 Facts and exact Barrier state", async () => {
    const stored = profile(1, "3", UserStatus.Enable, false);
    const wrongFacts = factsRecord(stored);
    wrongFacts.profile.name = "stale display name";
    const gate = createProfileV2RedisAccessGate({
      inventory: {
        readVerificationSummary: mock(async () => ({
          userCount: 1,
          profileCount: 1,
          profileSubjectCount: 1,
          distinctProfileSubjectCount: 1,
          orphanProfileCount: 0,
        })),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored, stored)] : []),
      },
      subjectFacts: {
        inspectMany: mock(async () => [{ status: "valid" as const, record: wrongFacts }]),
      },
      subjectAccess: {
        inspectMany: mock(async () => [{
          status: "valid" as const,
          record: barrierRecord(stored, "disabled"),
        }]),
      },
      clock: { nowDate: () => observedAt },
    });

    await expect(gate.verify({ version: 2, batchSize: 100 })).resolves.toEqual({
      version: 2,
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
});

function pageRow(
  source: PublishedProfile,
  currentProfile: PublishedProfile | null,
) {
  return {
    userId: source.userId,
    subjectIdentifier: source.subjectIdentifier,
    accountAvailable: source.status === UserStatus.Enable && !source.isDelete,
    currentProfile,
    backfillCompleted: currentProfile !== null,
    profileIssue: currentProfile === null ? "profile-v2-invalid" : null,
  };
}

function factsRecord(source: PublishedProfile) {
  return {
    schemaVersion: 2 as const,
    sourceDirtyVersion: source.sourceDirtyVersion,
    publishedAt: source.rebuiltAt.toISOString(),
    subjectIdentifier: source.subjectIdentifier,
    profile: { username: source.username, name: source.name, phone: source.mobile },
    facts: source.subjectFacts,
  };
}

function barrierRecord(
  source: PublishedProfile,
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

function profile(
  userId: number,
  sourceDirtyVersion: string,
  status: UserStatus,
  isDelete: boolean,
): PublishedProfile {
  return {
    userId,
    subjectIdentifier: `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`,
    username: `user-${userId}`,
    name: `User ${userId}`,
    mobile: null,
    wxId: null,
    status,
    isDelete,
    searchVisible: status === UserStatus.Enable && !isDelete,
    profileSchemaVersion: 2,
    sourceDirtyVersion,
    detail: {
      id: userId,
      username: `user-${userId}`,
      name: `User ${userId}`,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: userId,
      status,
      isDelete,
      createTime: observedAt,
      updateTime: observedAt,
      employments: [],
      roles: [],
      privileges: [],
    },
    searchDoc: {
      user: {
        id: userId,
        username: `user-${userId}`,
        name: `User ${userId}`,
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: observedAt,
  };
}
