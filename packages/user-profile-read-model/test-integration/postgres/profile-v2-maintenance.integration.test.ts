import type { db as database } from "@iam/db";
import type { SubjectFactsCacheRecord } from "../../src/profile-cache";
import { UserProfileDirtyStatus, UserStatus } from "@iam/contracts";
import { createOrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createProfileV2Backfill,
  createProfileV2MaintenanceRepository,
} from "../../src/worker";
import { createPostgresTestHarness } from "./postgres-test-harness";

const OBSERVED_AT = new Date("2026-08-21T06:00:00.000Z");
const testUsers = [{
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

describe("Profile V2 PostgreSQL maintenance", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    for (const user of testUsers) {
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
    await harness?.close();
  });

  test("replays a PostgreSQL-committed batch from the same safe cursor without advancing again", async () => {
    const repository = createProfileV2MaintenanceRepository(
      harness.db as typeof database,
      {
        buildBatchSize: 10,
        createRoleAssignmentResolver,
        createResponsibilityResolver: createOrganizationResponsibilityResolver,
      },
    );
    const facts = new Map<string, SubjectFactsCacheRecord>();
    const barriers = new Map<string, "disabled" | "enabled">();
    let exposeFacts = false;
    const backfill = createProfileV2Backfill({
      repository,
      subjectFacts: {
        async publishMany(records) {
          for (const record of records)
            facts.set(record.subjectIdentifier, record);
          return { published: records.length, retainedNewer: 0 };
        },
        async inspectMany(subjectIdentifiers) {
          return subjectIdentifiers.map((subjectIdentifier) => {
            const record = exposeFacts ? facts.get(subjectIdentifier) : undefined;
            return record === undefined
              ? { status: "missing" as const }
              : { status: "valid" as const, record };
          });
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
                    updatedAt: OBSERVED_AT.toISOString(),
                  },
                };
          });
        },
      },
      clock: { nowDate: () => OBSERVED_AT },
    });

    await expect(backfill.backfillBatch({
      version: 2,
      afterUserId: 0,
      batchSize: 10,
    })).rejects.toThrow("Subject Facts inspection did not match the Profile V2 batch");
    expect(await readDirtyRows(harness)).toEqual(testUsers.map(user => ({
      userId: user.userId,
      dirtyVersion: "1",
      status: UserProfileDirtyStatus.Processed,
    })));
    const profilesAfterFailure = await readProfileRows(harness);
    expect([...barriers.values()]).toEqual(["enabled", "disabled", "disabled"]);

    exposeFacts = true;
    const replay = await backfill.backfillBatch({
      version: 2,
      afterUserId: 0,
      batchSize: 10,
    });

    expect(replay).toMatchObject({
      nextAfterUserId: 3,
      complete: true,
      scanned: 3,
      rebuilt: 0,
      reused: 3,
      barriers: { seeded: 0, retainedExisting: 3 },
    });
    expect(await readDirtyRows(harness)).toEqual(testUsers.map(user => ({
      userId: user.userId,
      dirtyVersion: "1",
      status: UserProfileDirtyStatus.Processed,
    })));
    expect(await readProfileRows(harness)).toEqual(profilesAfterFailure);
  });

  test("rolls back the complete PostgreSQL batch when authoritative resolution fails", async () => {
    const repository = createProfileV2MaintenanceRepository(
      harness.db as typeof database,
      {
        buildBatchSize: 10,
        createRoleAssignmentResolver,
        createResponsibilityResolver: () => ({
          async resolveEffectiveResponsibilities() {
            throw new Error("injected authoritative resolution failure");
          },
        }),
      },
    );
    const backfill = createProfileV2Backfill({
      repository,
      subjectFacts: {
        async publishMany() {
          return { published: 0, retainedNewer: 0 };
        },
        async inspectMany() {
          return [];
        },
      },
      subjectAccess: {
        async seedMany() {
          return { seeded: 0, retainedExisting: 0 };
        },
        async inspectMany() {
          return [];
        },
      },
      clock: { nowDate: () => OBSERVED_AT },
    });

    await expect(backfill.backfillBatch({
      version: 2,
      afterUserId: 0,
      batchSize: 10,
    })).rejects.toThrow("injected authoritative resolution failure");
    expect(await readDirtyRows(harness)).toEqual([]);
    expect(await readProfileRows(harness)).toEqual([]);
  });
});

async function readDirtyRows(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
) {
  const rows = await harness.sql<{
    userId: number;
    dirtyVersion: string;
    status: string;
  }[]>`
    SELECT
      user_id AS "userId",
      dirty_version::text AS "dirtyVersion",
      status
    FROM user_profile_dirty
    ORDER BY user_id
  `;
  return [...rows];
}

async function readProfileRows(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
) {
  const rows = await harness.sql<{
    userId: number;
    sourceDirtyVersion: string;
    rebuiltAt: string;
  }[]>`
    SELECT
      user_id AS "userId",
      source_dirty_version::text AS "sourceDirtyVersion",
      rebuilt_at::text AS "rebuiltAt"
    FROM user_profile
    ORDER BY user_id
  `;
  return [...rows];
}
