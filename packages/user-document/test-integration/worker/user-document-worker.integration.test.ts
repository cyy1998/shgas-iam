import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { UserDocumentJobName, UserDocumentJobPayload } from "@iam/contracts";
import { UserDocumentWorkStatus, UserStatus } from "@iam/contracts";
import type { db as database } from "@iam/db";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../../src/index";
import {
  createCurrentUserDocumentProjectionBundle,
  createUserDocumentPostgresGate,
  createUserDocumentReadinessRepository,
  createUserDocumentWorkerModule,
} from "../../src/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const OBSERVED_AT = new Date("2026-08-22T10:00:00.000Z");

describe("production User Document schema 1 Worker", () => {
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
      name: UserDocumentJobName;
      data: UserDocumentJobPayload;
    }> = [];
    let processJob: ((job: { id: string; name: string; data: unknown }) => Promise<unknown>) | undefined;
    const queue = {
      name: "user-document",
      async addBulk(
        batch: Array<{
          name: UserDocumentJobName;
          data: UserDocumentJobPayload;
          opts: { jobId: string };
        }>,
      ) {
        const added = batch.map((job) => ({
          id: job.opts.jobId,
          name: job.name,
          data: job.data,
        }));
        jobs.push(...added);
        return added;
      },
      close: mock(async () => {}),
    };
    const module = createUserDocumentWorkerModule({
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
    expect(backfill).toEqual({ registered: 1, enqueued: 1 });
    expect(jobs).toHaveLength(1);

    await processJob!(jobs[0]!);
    expect(jobs).toHaveLength(2);

    let firstFailure: unknown;
    try {
      await processJob!(jobs[1]!);
    } catch (error) {
      firstFailure = error;
    }
    expect(firstFailure).toBeInstanceOf(Error);
    expect(await readDirtyStatus(harness)).toBe(UserDocumentWorkStatus.Failed);

    await harness.sql`
      UPDATE "user"
      SET name = 'User 1'
      WHERE id = 1
    `;
    const repair = await module.maintenance.repairFailedOrStale({
      staleBefore: new Date(OBSERVED_AT.getTime() + 1),
      limit: 10,
    });
    expect(repair).toMatchObject({ enqueued: 1, failed: 0 });
    expect(jobs).toHaveLength(3);
    expect(jobs[2]!.data).toEqual(jobs[1]!.data);

    const result = await processJob!(jobs[2]!);
    expect(result).toMatchObject({
      status: "rebuilt",
    });

    const projection = createCurrentUserDocumentProjectionBundle();
    const gate = createUserDocumentPostgresGate({
      schemaVersion: projection.schemaVersion,
      repository: createUserDocumentReadinessRepository(harness.db as typeof database, {
        projection,
        buildBatchSize: 10,
      }),
      clock: { nowDate: () => OBSERVED_AT },
    });
    const report = await gate.verify({ batchSize: 10 });
    expect(report).toMatchObject({
      version: USER_DOCUMENT_SCHEMA_VERSION,
      status: "passed",
      failures: [],
    });

    await module.close();
  }, 15_000);
});

async function readDirtyStatus(harness: Awaited<ReturnType<typeof createPostgresTestHarness>>) {
  const rows = await harness.sql<{ status: UserDocumentWorkStatus }[]>`
    SELECT status
    FROM user_document_rebuild_state
    WHERE user_id = 1
  `;
  return rows[0]?.status;
}
