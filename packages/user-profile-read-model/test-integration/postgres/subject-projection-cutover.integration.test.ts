import type { db as database } from "@iam/db";
import type { createSubjectFactsCacheRecord } from "../../src/subject-facts-cache";
import type { PublishedUserProfile } from "../../src/user-profile.schema";
import {
  UserProfileDirtyStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createSubjectProjectionCutoverBackfill,
  createSubjectProjectionCutoverRepository,
  createSubjectProjectionCutoverVerifier,
} from "../../src/worker";
import { createPostgresTestHarness } from "./postgres-test-harness";

const NOW = new Date("2026-08-01T06:00:00.000Z");
const users = [{
  userId: 1,
  subjectIdentifier: "00000000-0000-4000-8000-000000000001",
  status: UserStatus.Enable,
  isDelete: false,
}, {
  userId: 2,
  subjectIdentifier: "00000000-0000-4000-8000-000000000002",
  status: UserStatus.Disable,
  isDelete: false,
}, {
  userId: 3,
  subjectIdentifier: "00000000-0000-4000-8000-000000000003",
  status: UserStatus.Enable,
  isDelete: true,
}];

describe("Subject Projection cutover PostgreSQL rehearsal", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    for (const user of users) {
      await harness.sql`
        INSERT INTO "user" (
          id,
          subject_identifier,
          username,
          name,
          status,
          is_delete
        )
        VALUES (
          ${user.userId},
          ${user.subjectIdentifier},
          ${`user-${user.userId}`},
          ${`User ${user.userId}`},
          ${user.status},
          ${user.isDelete}
        )
      `;
    }
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("backfills enabled, disabled, and deleted users idempotently and fails verify on a real Dirty mismatch", async () => {
    const repository = createSubjectProjectionCutoverRepository(
      harness.db as typeof database,
    );
    const factRecords = new Map<string, ReturnType<typeof createSubjectFactsCacheRecord>>();
    const barriers = new Map<string, "disabled" | "enabled">();
    const backfill = createSubjectProjectionCutoverBackfill({
      repository,
      builder: {
        async buildMany(targets) {
          return targets.map(target => profile(
            users.find(user => user.userId === target.userId)!,
            target.sourceDirtyVersion,
          ));
        },
      },
      subjectFacts: {
        async publishMany(records) {
          for (const record of records) {
            const current = factRecords.get(record.subjectIdentifier);
            if (
              current === undefined
              || BigInt(current.sourceDirtyVersion) <= BigInt(record.sourceDirtyVersion)
            ) {
              factRecords.set(record.subjectIdentifier, record);
            }
          }
          return { published: records.length, retainedNewer: 0 };
        },
      },
      subjectAccess: {
        async seedMany(records) {
          let seeded = 0;
          for (const record of records) {
            if (!barriers.has(record.subjectIdentifier)) {
              barriers.set(record.subjectIdentifier, record.state);
              seeded += 1;
            }
          }
          return { seeded, retainedExisting: records.length - seeded };
        },
      },
      clock: { nowDate: () => NOW },
    });

    const firstBackfill = await backfill.backfillBatch({
      version: 1,
      afterUserId: 0,
      batchSize: 10,
    });
    expect(firstBackfill).toMatchObject({
      complete: true,
      scanned: 3,
      rebuilt: 3,
      reused: 0,
      barriers: { seeded: 3, retainedExisting: 0 },
    });
    const repeatedBackfill = await backfill.backfillBatch({
      version: 1,
      afterUserId: 0,
      batchSize: 10,
    });
    expect(repeatedBackfill).toMatchObject({
      complete: true,
      scanned: 3,
      rebuilt: 0,
      reused: 3,
      barriers: { seeded: 0, retainedExisting: 3 },
    });
    expect([...barriers.entries()]).toEqual([
      [users[0]!.subjectIdentifier, "enabled"],
      [users[1]!.subjectIdentifier, "disabled"],
      [users[2]!.subjectIdentifier, "disabled"],
    ]);
    const dirty = await harness.sql<{ dirtyVersion: string; status: string }[]>`
      SELECT dirty_version::text AS "dirtyVersion", status
      FROM user_profile_dirty
      ORDER BY user_id
    `;
    expect([...dirty]).toEqual([
      { dirtyVersion: "1", status: UserProfileDirtyStatus.Processed },
      { dirtyVersion: "1", status: UserProfileDirtyStatus.Processed },
      { dirtyVersion: "1", status: UserProfileDirtyStatus.Processed },
    ]);

    const verifier = createSubjectProjectionCutoverVerifier({
      projection: repository,
      subjectFacts: {
        async inspectMany(subjectIdentifiers) {
          return subjectIdentifiers.map((subjectIdentifier) => {
            const record = factRecords.get(subjectIdentifier);
            return record === undefined
              ? { status: "missing" as const }
              : { status: "valid" as const, record };
          });
        },
      },
      subjectAccess: {
        async inspectMany(subjectIdentifiers) {
          return subjectIdentifiers.map((subjectIdentifier) => {
            const state = barriers.get(subjectIdentifier);
            return state === undefined
              ? { status: "missing" as const }
              : {
                  status: "valid" as const,
                  record: {
                    version: 1 as const,
                    subjectIdentifier,
                    state,
                    transitionId: "10000000-0000-4000-8000-000000000001",
                    updatedAt: NOW.toISOString(),
                  },
                };
          });
        },
      },
      clients: { verifyManifest: async () => ({ failures: [] }) },
      clock: { nowDate: () => NOW },
    });
    const manifest = { cutoverId: "postgres-rehearsal-v1" };
    const passed = await verifier.verify({ version: 1, batchSize: 2, manifest });
    expect(passed).toMatchObject({ status: "passed", failures: [] });

    await harness.sql`
      UPDATE user_profile_dirty
      SET status = ${UserProfileDirtyStatus.Failed}
      WHERE user_id = 2
    `;
    const failed = await verifier.verify({ version: 1, batchSize: 2, manifest });
    expect(failed.status).toBe("failed");
    expect(failed.failures).toContainEqual({
      code: "profile-not-current",
      count: 1,
      samples: ["user:2"],
    });
  });
});

function profile(
  user: typeof users[number],
  sourceDirtyVersion: string,
): PublishedUserProfile {
  return {
    userId: user.userId,
    subjectIdentifier: user.subjectIdentifier,
    username: `user-${user.userId}`,
    name: `User ${user.userId}`,
    mobile: null,
    wxId: null,
    status: user.status,
    isDelete: user.isDelete,
    searchVisible: user.status === UserStatus.Enable && !user.isDelete,
    profileSchemaVersion: 1,
    sourceDirtyVersion,
    detail: {
      id: user.userId,
      username: `user-${user.userId}`,
      name: `User ${user.userId}`,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: user.userId,
      status: user.status,
      isDelete: user.isDelete,
      createTime: NOW,
      updateTime: NOW,
      employments: [],
      roles: [],
      privileges: [],
    },
    searchDoc: {
      user: {
        id: user.userId,
        username: `user-${user.userId}`,
        name: `User ${user.userId}`,
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: user.status,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: NOW,
  };
}
