import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { UserDocumentJobName, UserDocumentJobPayload } from "@iam/contracts";
import { OrganizationLevel, OrganizationType, UserDocumentWorkStatus, UserStatus } from "@iam/contracts";
import type { db as database } from "@iam/db";
import { organizations, positions } from "@iam/db/schema";
import { createUnitOfWork } from "@iam/unit-of-work";
import { eq } from "drizzle-orm";
import { USER_DOCUMENT_SCHEMA_VERSION } from "../../src/index";
import { createUserDocumentInvalidation, createUserDocumentJobProducer } from "../../src/producer";
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
    await harness.sql`TRUNCATE role_assignment, role, client, organization_responsibility_assignment,
      employment, organization_closure, organization, position RESTART IDENTITY CASCADE`;
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

  test("batches organization fanout and repairs a bad target without rebuilding completed neighbors", async () => {
    await harness.sql`INSERT INTO "user" (id, subject_identifier, username, name) VALUES
      (2, '00000000-0000-4000-8000-000000000002', 'user-2', 'User 2'),
      (3, '00000000-0000-4000-8000-000000000003', 'user-3', 'User 3')`;
    await harness.db.insert(organizations).values({
      id: 10,
      orgCode: "ORG",
      orgName: "Before",
      path: "/10",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    });
    await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (10, 10, 0)`;
    await harness.db.insert(positions).values({ id: 10, posCode: "POSITION", posName: "Position" });
    await harness.sql`INSERT INTO employment (id, user_id, dept_id, pos_id, start_time)
      SELECT id, id, 10, 10, '2026-01-01'::timestamp FROM "user"`;
    const jobs: Array<{ id: string; name: UserDocumentJobName; data: UserDocumentJobPayload }> = [];
    let processJob!: (job: { id: string; name: string; data: unknown }) => Promise<unknown>;
    const queue = {
      name: "user-document",
      async addBulk(
        batch: Array<{ name: UserDocumentJobName; data: UserDocumentJobPayload; opts: { jobId: string } }>,
      ) {
        const added = batch.map(({ name, data, opts }) => ({ id: opts.jobId, name, data }));
        jobs.push(...added);
        return added;
      },
      close: mock(async () => {}),
    };
    const logger = { info() {}, warn() {}, error() {} };
    const clock = { nowDate: () => OBSERVED_AT };
    const publish = mock(async () => 1);
    const module = createUserDocumentWorkerModule({
      db: harness.db,
      redis: { host: "localhost", port: 6379, db: 0 },
      subjectFactsRedis: { eval: publish },
      subjectAccessRepair: { repairSubject: mock(async () => ({ status: "stable" as const })) },
      logger,
      clock,
      config: { concurrency: 1, rebuildBatchSize: 2, backfillBatchSize: 10 },
      factories: {
        createQueue: (() => queue) as never,
        createWorker: ((input: { processor: typeof processJob }) => {
          processJob = input.processor;
          return { close: mock(async () => {}), on: mock(() => undefined) };
        }) as never,
      },
    });
    const jobProducer = createUserDocumentJobProducer(queue, { batchSize: 2 });
    const uow = createUnitOfWork({
      db: harness.db,
      logger,
      createTxPorts: (db, lifecycle) => ({
        db,
        invalidation: createUserDocumentInvalidation({ db, lifecycle, clock, jobProducer }),
      }),
    });
    try {
      await module.startConsumers();
      await uow.transaction(async (tx) => {
        await tx.db.update(organizations).set({ orgName: "After" }).where(eq(organizations.id, 10));
        await tx.invalidation.recordChanges([{ kind: "organization", organizationId: 10 }]);
      });
      const outbox = jobs.shift()!;
      await processJob(outbox);
      expect(jobs.map(({ data }) => ("requests" in data ? data.requests.length : 0))).toEqual([2, 1]);
      let failure: unknown;
      try {
        await processJob(jobs.shift()!);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      await processJob(jobs.shift()!);
      const partial = await harness.sql`SELECT user_id, status FROM user_document_rebuild_state ORDER BY user_id`;
      expect([...partial]).toEqual([
        { user_id: 1, status: "failed" },
        { user_id: 2, status: "processed" },
        { user_id: 3, status: "processed" },
      ]);
      await harness.sql`UPDATE "user" SET name = 'User 1' WHERE id = 1`;
      const repair = await module.maintenance.repairFailedOrStale({ staleBefore: OBSERVED_AT, limit: 10 });
      expect(repair).toMatchObject({ enqueued: 1, failed: 0 });
      await processJob(jobs.shift()!);
      const documents = await harness.sql`SELECT user_id, document->'employments'->0->'organization'->>'name' AS name
        FROM user_document ORDER BY user_id`;
      expect([...documents]).toEqual([1, 2, 3].map((user_id) => ({ user_id, name: "After" })));
      expect(publish).toHaveBeenCalledTimes(3);
      await processJob(outbox);
      while (jobs.length) await processJob(jobs.shift()!);
      expect(publish).toHaveBeenCalledTimes(3);
      const versions = await harness.sql`SELECT version::text AS version FROM user_document_rebuild_state`;
      expect(versions.map(({ version }) => version)).toEqual(["1", "1", "1"]);
    } finally {
      await module.close();
    }
  }, 15_000);

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
