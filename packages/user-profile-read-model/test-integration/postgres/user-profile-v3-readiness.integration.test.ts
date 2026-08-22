import type { db as database } from "@iam/db";
import { UserProfileDirtyReason, UserProfileDirtyStatus, UserStatus } from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  V3_USER_PROFILE_SCHEMA_VERSION,
} from "../../src/v3";
import {
  createCurrentUserProfileProjectionBundle,
  createUserProfilePostgresGate,
  createUserProfileReadinessRepository,
} from "../../src/worker";
import { createPostgresTestHarness } from "./postgres-test-harness";

const OBSERVED_AT = new Date("2026-08-22T06:00:00.000Z");

describe("User Profile v3 PostgreSQL readiness", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
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
        1,
        '00000000-0000-4000-8000-000000000001',
        'user-1',
        'User 1',
        ${UserStatus.Enable},
        false
      )
    `;
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("passes only for complete, strict, fresh and authoritative v3 inventory", async () => {
    const projection = createCurrentUserProfileProjectionBundle();
    const builder = projection.createBuilder({
      db: harness.db as typeof database,
      clock: { nowDate: () => OBSERVED_AT },
      batchSize: 10,
    });
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    expect(candidate).not.toBeNull();
    await harness.sql`
      INSERT INTO user_profile_dirty (
        user_id,
        dirty_version,
        status,
        reason_codes,
        dirty_at,
        processed_at,
        update_time
      )
      VALUES (
        1,
        1,
        ${UserProfileDirtyStatus.Processed},
        ${JSON.stringify([UserProfileDirtyReason.Backfill])}::jsonb,
        ${OBSERVED_AT.toISOString()},
        ${OBSERVED_AT.toISOString()},
        ${OBSERVED_AT.toISOString()}
      )
    `;
    await projection.createRowRepository(harness.db as typeof database).upsert(candidate!);

    const repository = createUserProfileReadinessRepository(
      harness.db as typeof database,
      {
        projection,
        buildBatchSize: 10,
      },
    );
    const gate = createUserProfilePostgresGate({
      schemaVersion: projection.schemaVersion,
      repository,
      clock: { nowDate: () => OBSERVED_AT },
    });

    const passedReport = await gate.verify({ batchSize: 10 });
    expect(passedReport).toMatchObject({
      version: V3_USER_PROFILE_SCHEMA_VERSION,
      status: "passed",
      counts: { users: 1, profiles: 1, verifiedUsers: 1 },
      failures: [],
    });

    await harness.sql`
      UPDATE user_profile
      SET profile_schema_version = 2
      WHERE user_id = 1
    `;
    const oldVersionReport = await gate.verify({ batchSize: 10 });
    expect(oldVersionReport).toMatchObject({
      status: "failed",
      failures: [{ code: "profile-version-mismatch", count: 1 }],
    });

    await harness.sql`
      UPDATE user_profile
      SET profile_schema_version = ${V3_USER_PROFILE_SCHEMA_VERSION},
          search_doc = '{}'::jsonb
      WHERE user_id = 1
    `;
    const invalidReport = await gate.verify({ batchSize: 10 });
    expect(invalidReport).toMatchObject({
      status: "failed",
      failures: [{ code: "profile-invalid", count: 1 }],
    });

    await projection.createRowRepository(harness.db as typeof database).upsert(candidate!);
    await harness.sql`
      UPDATE user_profile_dirty
      SET status = ${UserProfileDirtyStatus.Failed}
      WHERE user_id = 1
    `;
    const unconvergedReport = await gate.verify({ batchSize: 10 });
    expect(unconvergedReport).toMatchObject({
      status: "failed",
      failures: [{ code: "profile-not-current", count: 1 }],
    });

    await harness.sql`DELETE FROM user_profile WHERE user_id = 1`;
    const missingReport = await gate.verify({ batchSize: 10 });
    expect(missingReport).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining([
        expect.objectContaining({ code: "profile-count-mismatch" }),
        expect.objectContaining({ code: "profile-missing" }),
      ]),
    });
  }, 60_000);
});
