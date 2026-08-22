import type { RebuildUserProfileJobPayload, UserProfileJobName } from "@iam/contracts";
import type { db as database } from "@iam/db";
import { UserProfileDirtyStatus, UserStatus } from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  V3_USER_PROFILE_SCHEMA_VERSION,
} from "../../src/v3";
import {
  createCurrentUserProfileProjectionBundle,
  createUserProfilePostgresGate,
  createUserProfileReadinessRepository,
  createUserProfileWorkerModule,
} from "../../src/worker";
import { createPostgresTestHarness } from "./postgres-test-harness";

const OBSERVED_AT = new Date("2026-08-22T10:00:00.000Z");

describe("production User Profile v3 Worker", () => {
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
        '',
        ${UserStatus.Enable},
        false
      )
    `;
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("consumes the existing backfill job and converges through the existing repair retry", async () => {
    const jobs: Array<{
      id: string;
      name: UserProfileJobName;
      data: RebuildUserProfileJobPayload;
    }> = [];
    let processJob: ((job: {
      id: string;
      name: string;
      data: unknown;
    }) => Promise<unknown>) | undefined;
    const queue = {
      name: "user-profile",
      async addBulk(batch: Array<{
        name: UserProfileJobName;
        data: RebuildUserProfileJobPayload;
        opts: { jobId: string };
      }>) {
        const added = batch.map(job => ({
          id: job.opts.jobId,
          name: job.name,
          data: job.data,
        }));
        jobs.push(...added);
        return added;
      },
      close: mock(async () => {}),
    };
    const module = createUserProfileWorkerModule({
      db: harness.db as typeof database,
      redis: { host: "localhost", port: 6379, db: 0 },
      subjectFactsRedis: { eval: mock(async () => 1) },
      subjectAccessRepair: {
        repairSubject: mock(async () => ({ status: "stable" as const })),
      },
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
      },
      clock: { nowDate: () => OBSERVED_AT },
      config: {
        concurrency: 1,
        rebuildBatchSize: 10,
        backfillBatchSize: 10,
      },
      factories: {
        createQueue: (() => queue) as never,
        createWorker: ((input: { processor: typeof processJob }) => {
          processJob = input.processor;
          return {
            close: mock(async () => {}),
            on: mock(() => undefined),
          };
        }) as never,
      },
    });
    await module.startConsumers();

    const backfill = await module.maintenance.backfillAllUsers();
    expect(backfill).toEqual({ enqueued: 1 });
    expect(jobs).toHaveLength(1);

    let firstFailure: unknown;
    try {
      await processJob!(jobs[0]!);
    }
    catch (error) {
      firstFailure = error;
    }
    expect(firstFailure).toBeInstanceOf(Error);
    expect(await readDirtyStatus(harness)).toBe(UserProfileDirtyStatus.Failed);

    await harness.sql`
      UPDATE "user"
      SET name = 'User 1'
      WHERE id = 1
    `;
    const repair = await module.maintenance.repairFailedOrStale({
      staleBefore: new Date(OBSERVED_AT.getTime() + 1),
      limit: 10,
    });
    expect(repair).toEqual({ enqueued: 1, userIds: [1] });
    expect(jobs).toHaveLength(2);
    expect(jobs[1]!.data).toEqual(jobs[0]!.data);

    const result = await processJob!(jobs[1]!);
    expect(result).toMatchObject({
      status: "rebuilt",
      cacheStatus: "published",
    });

    const projection = createCurrentUserProfileProjectionBundle();
    const gate = createUserProfilePostgresGate({
      schemaVersion: projection.schemaVersion,
      repository: createUserProfileReadinessRepository(
        harness.db as typeof database,
        {
          projection,
          buildBatchSize: 10,
        },
      ),
      clock: { nowDate: () => OBSERVED_AT },
    });
    const report = await gate.verify({ batchSize: 10 });
    expect(report).toMatchObject({
      version: V3_USER_PROFILE_SCHEMA_VERSION,
      status: "passed",
      failures: [],
    });

    await module.close();
  }, 15_000);
});

async function readDirtyStatus(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
) {
  const rows = await harness.sql<{ status: UserProfileDirtyStatus }[]>`
    SELECT status
    FROM user_profile_dirty
    WHERE user_id = 1
  `;
  return rows[0]?.status;
}
