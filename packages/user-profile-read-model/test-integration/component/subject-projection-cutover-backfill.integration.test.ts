import type { PublishedUserProfile } from "../../src/user-profile.schema";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createSubjectProjectionCutoverBackfill } from "../../src/subject-projection-cutover-backfill";

const now = new Date("2026-08-01T02:00:00.000Z");

describe("Subject Projection cutover backfill", () => {
  test("rebuilds only incomplete profiles in bulk and seeds access after Facts", async () => {
    const order: string[] = [];
    const current = profile(1, "1", UserStatus.Enable, false);
    const rebuilt = profile(2, "7", UserStatus.Disable, true);
    const scanPage = mock(async () => [{
      userId: 1,
      subjectIdentifier: current.subjectIdentifier,
      accountAvailable: true,
      currentProfile: current,
    }, {
      userId: 2,
      subjectIdentifier: rebuilt.subjectIdentifier,
      accountAvailable: false,
      currentProfile: null,
    }]);
    const prepareBatch = mock(async () => [{ userId: 2, sourceDirtyVersion: "7" }]);
    const buildMany = mock(async () => [rebuilt]);
    const publishBatch = mock(async () => {
      order.push("postgres");
      return { published: 1 };
    });
    const publishMany = mock(async (_records: unknown[]) => {
      order.push("facts");
      return { published: 2, retainedNewer: 0 };
    });
    const seedMany = mock(async () => {
      order.push("barrier");
      return { seeded: 2, retainedExisting: 0 };
    });
    const backfill = createSubjectProjectionCutoverBackfill({
      repository: { scanPage, prepareBatch, publishBatch },
      builder: { buildMany },
      subjectFacts: { publishMany },
      subjectAccess: { seedMany },
      clock: { nowDate: () => now },
    });

    await expect(backfill.backfillBatch({
      version: 1,
      afterUserId: 0,
      batchSize: 2,
    })).resolves.toEqual({
      version: 1,
      afterUserId: 0,
      nextAfterUserId: 2,
      complete: false,
      scanned: 2,
      rebuilt: 1,
      reused: 1,
      facts: { published: 2, retainedNewer: 0 },
      barriers: { seeded: 2, retainedExisting: 0 },
    });

    expect(prepareBatch).toHaveBeenCalledWith([2], now);
    expect(buildMany).toHaveBeenCalledWith([{ userId: 2, sourceDirtyVersion: "7" }]);
    expect(publishBatch).toHaveBeenCalledWith([rebuilt], now);
    expect(publishMany.mock.calls[0]?.[0].map((record: any) => record.sourceDirtyVersion)).toEqual(["1", "7"]);
    expect(seedMany).toHaveBeenCalledWith([{
      subjectIdentifier: current.subjectIdentifier,
      state: "enabled",
    }, {
      subjectIdentifier: rebuilt.subjectIdentifier,
      state: "disabled",
    }], now);
    expect(order).toEqual(["postgres", "facts", "barrier"]);
  });

  test("returns a stable terminal cursor without mutating an empty tail", async () => {
    const prepareBatch = mock(async () => []);
    const publishBatch = mock(async () => ({ published: 0 }));
    const buildMany = mock(async () => []);
    const publishMany = mock(async () => ({ published: 0, retainedNewer: 0 }));
    const seedMany = mock(async () => ({ seeded: 0, retainedExisting: 0 }));
    const backfill = createSubjectProjectionCutoverBackfill({
      repository: {
        scanPage: mock(async () => []),
        prepareBatch,
        publishBatch,
      },
      builder: { buildMany },
      subjectFacts: { publishMany },
      subjectAccess: { seedMany },
      clock: { nowDate: () => now },
    });

    await expect(backfill.backfillBatch({
      version: 1,
      afterUserId: 42,
      batchSize: 100,
    })).resolves.toEqual({
      version: 1,
      afterUserId: 42,
      nextAfterUserId: 42,
      complete: true,
      scanned: 0,
      rebuilt: 0,
      reused: 0,
      facts: { published: 0, retainedNewer: 0 },
      barriers: { seeded: 0, retainedExisting: 0 },
    });
    expect(prepareBatch).not.toHaveBeenCalled();
    expect(buildMany).not.toHaveBeenCalled();
    expect(publishBatch).not.toHaveBeenCalled();
    expect(publishMany).not.toHaveBeenCalled();
    expect(seedMany).not.toHaveBeenCalled();
  });
});

function profile(
  userId: number,
  sourceDirtyVersion: string,
  status: UserStatus,
  isDelete: boolean,
): PublishedUserProfile {
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
    profileSchemaVersion: 1,
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
      createTime: now,
      updateTime: now,
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
    rebuiltAt: now,
  };
}
