import type { BuiltUserProfile } from "../../src/user-profile-builder.service";
import {
  UserProfileDirtyReason,
  UserProfileDirtyStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createUserProfileBuilder } from "../../src/user-profile-builder.service";
import { createUserProfilePublicationRepository } from "../../src/user-profile-publication.repository";
import { createPostgresTestHarness } from "./postgres-test-harness";

const NOW = new Date("2026-07-25T10:00:00.000Z");
const SUBJECT_IDENTIFIER = "c188a58a-5f25-43ad-82c7-82b54ff972c5";

interface PublishedState {
  dirtyVersion: string | undefined;
  dirtyStatus: UserProfileDirtyStatus | undefined;
  profile: {
    sourceDirtyVersion: string;
    subjectIdentifier: string;
    subjectFacts: unknown;
    username: string;
  } | null;
}

describe("User Profile PostgreSQL publication", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("commits the profile, source version, and processed Dirty state together", async () => {
    await seedProcessingDirty(harness, 1, "4");
    const publication = createUserProfilePublicationRepository(harness.db);
    const profile = await buildProfile(1, "4");

    expect(await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile,
      processedAt: NOW,
    })).toEqual({ status: "published" });

    expect(await readPublishedState(harness, 1)).toEqual({
      dirtyVersion: "4",
      dirtyStatus: UserProfileDirtyStatus.Processed,
      profile: {
        sourceDirtyVersion: "4",
        subjectIdentifier: SUBJECT_IDENTIFIER,
        subjectFacts: { employments: [] },
        username: "user1",
      },
    });
  });

  test("atomically deletes the current profile and processes the same Dirty version", async () => {
    const publication = createUserProfilePublicationRepository(harness.db);
    await seedProcessingDirty(harness, 1, "4");
    await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: await buildProfile(1, "4"),
      processedAt: NOW,
    });
    await resetProcessingDirty(harness, 1, "4");

    expect(await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: null,
      processedAt: NOW,
    })).toEqual({ status: "missing" });

    expect(await readPublishedState(harness, 1)).toEqual({
      dirtyVersion: "4",
      dirtyStatus: UserProfileDirtyStatus.Processed,
      profile: null,
    });
  });

  test("discards a candidate when the locked Dirty version changes but remains processing", async () => {
    await seedProcessingDirty(harness, 1, "4");
    const heldLock = await harness.holdDirtyRowLock(1);
    const publication = createUserProfilePublicationRepository(harness.db);
    const pendingPublication = publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: await buildProfile(1, "4"),
      processedAt: NOW,
    });

    let released = false;
    try {
      await harness.waitForPublicationToBlock();
      await heldLock.commit({
        dirtyVersion: "5",
        status: UserProfileDirtyStatus.Processing,
      });
      released = true;

      expect(await pendingPublication).toEqual({ status: "stale" });
      expect(await readPublishedState(harness, 1)).toEqual({
        dirtyVersion: "5",
        dirtyStatus: UserProfileDirtyStatus.Processing,
        profile: null,
      });
    }
    finally {
      if (!released)
        await heldLock.commit();
      await pendingPublication.catch(() => undefined);
    }
  });

  test("discards a candidate when the locked Dirty status changes at the same version", async () => {
    await seedProcessingDirty(harness, 1, "4");
    const heldLock = await harness.holdDirtyRowLock(1);
    const publication = createUserProfilePublicationRepository(harness.db);
    const pendingPublication = publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: await buildProfile(1, "4"),
      processedAt: NOW,
    });

    let released = false;
    try {
      await harness.waitForPublicationToBlock();
      await heldLock.commit({
        dirtyVersion: "4",
        status: UserProfileDirtyStatus.Pending,
      });
      released = true;

      expect(await pendingPublication).toEqual({ status: "stale" });
      expect(await readPublishedState(harness, 1)).toEqual({
        dirtyVersion: "4",
        dirtyStatus: UserProfileDirtyStatus.Pending,
        profile: null,
      });
    }
    finally {
      if (!released)
        await heldLock.commit();
      await pendingPublication.catch(() => undefined);
    }
  });

  test("discards a candidate when the processing Dirty row belongs to another user", async () => {
    await seedProcessingDirty(harness, 2, "4");
    const publication = createUserProfilePublicationRepository(harness.db);

    expect(await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: await buildProfile(1, "4"),
      processedAt: NOW,
    })).toEqual({ status: "stale" });

    expect(await readPublishedState(harness, 1)).toEqual({
      dirtyVersion: undefined,
      dirtyStatus: undefined,
      profile: null,
    });
    expect(await readPublishedState(harness, 2)).toEqual({
      dirtyVersion: "4",
      dirtyStatus: UserProfileDirtyStatus.Processing,
      profile: null,
    });
  });

  test("rolls back the profile when processing the Dirty row fails", async () => {
    await seedProcessingDirty(harness, 1, "4");
    await harness.sql.unsafe(`
      CREATE FUNCTION reject_processed_dirty() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'processed' THEN
          RAISE EXCEPTION 'forced dirty failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await harness.sql.unsafe(`
      CREATE TRIGGER reject_processed_dirty_trigger
      BEFORE UPDATE ON user_profile_dirty
      FOR EACH ROW EXECUTE FUNCTION reject_processed_dirty()
    `);
    const publication = createUserProfilePublicationRepository(harness.db);

    try {
      expect(errorCause(await captureRejection(publication.publishCandidate({
        userId: 1,
        dirtyVersion: "4",
        profile: await buildProfile(1, "4"),
        processedAt: NOW,
      })))).toContain("forced dirty failure");

      expect(await readPublishedState(harness, 1)).toEqual({
        dirtyVersion: "4",
        dirtyStatus: UserProfileDirtyStatus.Processing,
        profile: null,
      });
    }
    finally {
      await harness.sql.unsafe(
        "DROP TRIGGER reject_processed_dirty_trigger ON user_profile_dirty",
      );
      await harness.sql.unsafe("DROP FUNCTION reject_processed_dirty()");
    }
  });

  test("rolls back a profile deletion when processing the Dirty row fails", async () => {
    const publication = createUserProfilePublicationRepository(harness.db);
    await seedProcessingDirty(harness, 1, "4");
    await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: await buildProfile(1, "4"),
      processedAt: NOW,
    });
    await resetProcessingDirty(harness, 1, "4");
    await harness.sql.unsafe(`
      CREATE FUNCTION reject_missing_processed_dirty() RETURNS trigger AS $$
      BEGIN
        IF NEW.status = 'processed' THEN
          RAISE EXCEPTION 'forced missing dirty failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await harness.sql.unsafe(`
      CREATE TRIGGER reject_missing_processed_dirty_trigger
      BEFORE UPDATE ON user_profile_dirty
      FOR EACH ROW EXECUTE FUNCTION reject_missing_processed_dirty()
    `);

    try {
      expect(errorCause(await captureRejection(publication.publishCandidate({
        userId: 1,
        dirtyVersion: "4",
        profile: null,
        processedAt: NOW,
      })))).toContain("forced missing dirty failure");

      expect(await readPublishedState(harness, 1)).toEqual({
        dirtyVersion: "4",
        dirtyStatus: UserProfileDirtyStatus.Processing,
        profile: {
          sourceDirtyVersion: "4",
          subjectIdentifier: SUBJECT_IDENTIFIER,
          subjectFacts: { employments: [] },
          username: "user1",
        },
      });
    }
    finally {
      await harness.sql.unsafe(
        "DROP TRIGGER reject_missing_processed_dirty_trigger ON user_profile_dirty",
      );
      await harness.sql.unsafe("DROP FUNCTION reject_missing_processed_dirty()");
    }
  });

  test("rejects a lower source version without changing the current profile or Dirty row", async () => {
    const publication = createUserProfilePublicationRepository(harness.db);
    await seedProcessingDirty(harness, 1, "5");
    await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "5",
      profile: await buildProfile(1, "5"),
      processedAt: NOW,
    });
    await harness.sql`
      UPDATE user_profile_dirty
      SET dirty_version = 4,
          status = ${UserProfileDirtyStatus.Processing},
          processed_at = NULL,
          processing_started_at = ${NOW.toISOString()}
      WHERE user_id = 1
    `;

    expect(await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: {
        ...await buildProfile(1, "4"),
        username: "older-user",
      },
      processedAt: NOW,
    })).toEqual({ status: "stale" });

    expect(await readPublishedState(harness, 1)).toEqual({
      dirtyVersion: "4",
      dirtyStatus: UserProfileDirtyStatus.Processing,
      profile: {
        sourceDirtyVersion: "5",
        subjectIdentifier: SUBJECT_IDENTIFIER,
        subjectFacts: { employments: [] },
        username: "user1",
      },
    });
  });

  test("does not let an older missing candidate delete a newer profile", async () => {
    const publication = createUserProfilePublicationRepository(harness.db);
    await seedProcessingDirty(harness, 1, "5");
    await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "5",
      profile: await buildProfile(1, "5"),
      processedAt: NOW,
    });
    await resetProcessingDirty(harness, 1, "4");

    expect(await publication.publishCandidate({
      userId: 1,
      dirtyVersion: "4",
      profile: null,
      processedAt: NOW,
    })).toEqual({ status: "stale" });

    expect(await readPublishedState(harness, 1)).toEqual({
      dirtyVersion: "4",
      dirtyStatus: UserProfileDirtyStatus.Processing,
      profile: {
        sourceDirtyVersion: "5",
        subjectIdentifier: SUBJECT_IDENTIFIER,
        subjectFacts: { employments: [] },
        username: "user1",
      },
    });
  });
});

async function seedProcessingDirty(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  userId: number,
  dirtyVersion: string,
) {
  await harness.sql`
    INSERT INTO user_profile_dirty (
      user_id,
      dirty_version,
      status,
      reason_codes,
      dirty_at,
      processing_started_at
    )
    VALUES (
      ${userId},
      ${dirtyVersion},
      ${UserProfileDirtyStatus.Processing},
      ${JSON.stringify([UserProfileDirtyReason.UserUpdated])}::jsonb,
      ${NOW.toISOString()},
      ${NOW.toISOString()}
    )
  `;
}

async function resetProcessingDirty(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  userId: number,
  dirtyVersion: string,
) {
  await harness.sql`
    UPDATE user_profile_dirty
    SET dirty_version = ${dirtyVersion},
        status = ${UserProfileDirtyStatus.Processing},
        processed_at = NULL,
        processing_started_at = ${NOW.toISOString()}
    WHERE user_id = ${userId}
  `;
}

async function readPublishedState(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
  userId: number,
): Promise<PublishedState> {
  const [dirty] = await harness.sql<{
    dirtyVersion: string;
    status: UserProfileDirtyStatus;
  }[]>`
    SELECT dirty_version::text AS "dirtyVersion", status
    FROM user_profile_dirty
    WHERE user_id = ${userId}
  `;
  const [profile] = await harness.sql<{
    sourceDirtyVersion: string;
    subjectIdentifier: string;
    subjectFacts: unknown;
    username: string;
  }[]>`
    SELECT
      source_dirty_version::text AS "sourceDirtyVersion",
      subject_identifier::text AS "subjectIdentifier",
      subject_facts AS "subjectFacts",
      username
    FROM user_profile
    WHERE user_id = ${userId}
  `;

  return {
    dirtyVersion: dirty?.dirtyVersion,
    dirtyStatus: dirty?.status,
    profile: profile ?? null,
  };
}

async function buildProfile(
  userId: number,
  sourceDirtyVersion: string,
): Promise<BuiltUserProfile> {
  const builder = createUserProfileBuilder({
    buildRepository: {
      async loadByUserIds() {
        return {
          users: [{
            id: userId,
            subjectIdentifier: SUBJECT_IDENTIFIER,
            username: `user${userId}`,
            name: `User ${userId}`,
            password: null,
            mobile: null,
            wxId: null,
            userType: UserType.Formal,
            orderNum: userId,
            status: UserStatus.Enable,
            isDelete: false,
            createTime: NOW,
            updateTime: NOW,
          }],
          employments: [],
          positions: [],
          orgPathRows: [],
          roleRows: [],
          privilegeRows: [],
        };
      },
    },
    clock: { nowDate: () => NOW },
    config: { batchSize: 1 },
  });
  const profile = await builder.buildOne({ userId, sourceDirtyVersion });
  if (profile === null)
    throw new Error("expected the fixture profile to be built");
  return profile;
}

async function captureRejection(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected PostgreSQL operation to reject");
}

function errorCause(error: unknown) {
  return typeof error === "object" && error !== null && "cause" in error
    ? String(error.cause)
    : "";
}
