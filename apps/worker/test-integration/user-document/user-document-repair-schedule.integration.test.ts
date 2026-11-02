import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import { createSubjectAccessBootstrap } from "@iam/api-core/subject-access";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import {
  createBoundedProcessLogCapture,
  runProcessSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnitOfWork } from "@iam/api-core/uow";
import { UserStatus } from "@iam/contracts";
import { users } from "@iam/db/schema";
import { createSubjectFactsRedisCache, DocumentFactsCacheRecordSchema } from "@iam/user-document";
import { createUserDocumentInvalidation } from "@iam/user-document/producer";
import { createUserDocumentWorkerModule } from "@iam/user-document/worker";
import { startDocumentRepairSchedule } from "@worker/composition/document-repair-schedule";
import { parseWorkerEnv } from "@worker/env";
import { createWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import { createWorkerRedisTestHarness, resetWorkerRedisTestDatabase } from "../support/redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
const logger = createLogger({
  sourceApp: LoggerSourceApp.Worker,
  nodeEnv: "test",
  logLevel: "silent",
  logFormat: "json",
});

test("the production Worker automatically repairs a lost Outbox wake and publishes Document and Facts", async () => {
  await withFixture(async (fixture) => {
    const result = await runProcessSmoke({
      label: "scheduled User Document repair production entry",
      start: () => fixture.startEntry(),
      childReadinessEvidence: "worker started",
      readinessTimeoutMs: 15_000,
      cleanupTimeoutMs: 5_000,
      probe: async () => {
        const document = await fixture.published();
        return document?.document_name === "Scheduled user" && document.post_publication_status === "processed"
          ? document
          : undefined;
      },
    });
    const storedFacts = await createSubjectFactsRedisCache(fixture.redis.observer).read(fixture.subject);
    const facts = storedFacts === null ? null : DocumentFactsCacheRecordSchema.parse(JSON.parse(storedFacts));
    const [outbox] = await fixture.pg.sql`SELECT status FROM user_document_outbox`;
    expect(result.document_name).toBe("Scheduled user");
    expect(outbox?.status).toBe("processed");
    expect(facts).toMatchObject({
      kind: "document",
      subjectIdentifier: fixture.subject,
      sourceVersion: result.source_version,
      facts: { profile: { name: "Scheduled user" } },
    });
  });
}, 30_000);

for (const selection of [
  { name: "disabled", enabled: "false", modules: "user-document", dashboard: "false" },
  { name: "organization-only", enabled: "true", modules: "organization-document", dashboard: "false" },
  { name: "dashboard-only", enabled: "true", modules: "none", dashboard: "true" },
]) {
  test(`the production ${selection.name} Worker leaves User repair disabled`, async () => {
    await withFixture(async (fixture) => {
      let logs: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
      let observingSince: number | undefined;
      try {
        const result = await runProcessSmoke({
          label: `${selection.name} Worker repair gate`,
          start() {
            const child = fixture.startEntry({
              IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: selection.enabled,
              IAM_WORKER_ENABLED_MODULES: selection.modules,
              IAM_WORKER_BULL_BOARD_ENABLED: selection.dashboard,
            });
            logs = createBoundedProcessLogCapture(child, { maxBytes: 32_768 });
            return child;
          },
          childReadinessEvidence: "worker started",
          readinessTimeoutMs: 10_000,
          cleanupTimeoutMs: 5_000,
          probe: async () => {
            if (!logs?.snapshot().includes("worker started")) return;
            observingSince ??= performance.now();
            const [outbox] = await fixture.pg.sql`SELECT status FROM user_document_outbox`;
            const published = await fixture.published();
            if (outbox?.status !== "pending" || published !== undefined)
              throw new Error("A disabled User repair scheduler processed durable work");
            // More than three configured intervals after the real Worker has started.
            return performance.now() - observingSince > 350 ? outbox : undefined;
          },
        });
        expect(result.status).toBe("pending");
        expect(logs?.snapshot()).not.toContain('"event":"user_document.repair.started"');
      } finally {
        logs?.dispose();
      }
    });
  }, 20_000);
}

test("stopping a blocked repair child is bounded and preserves the active consumer's shared resources", async () => {
  await withFixture(async (fixture) => {
    const env = fixture.parsedEnv({ IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "3000" });
    const consumer = createUserDocumentWorkerModule({
      db: fixture.pg.db,
      redis: env.redis,
      subjectFactsRedis: fixture.redis.writer,
      subjectAccessRepair: {
        async repairSubject() {
          return { status: "stable" as const };
        },
      },
      logger,
      clock: { nowDate: () => new Date() },
      config: env.userDocument,
    });
    fixture.stopExecutors.push(consumer.close);
    await consumer.startConsumers();
    let schedule: ReturnType<typeof startDocumentRepairSchedule> | undefined;
    fixture.stopExecutors.push(() => schedule?.close());
    await fixture.pg.sql.begin(async (tx) => {
      await tx`LOCK TABLE user_document_outbox IN ACCESS EXCLUSIVE MODE`;
      schedule = startDocumentRepairSchedule({ document: "user", env, enabledModuleKeys: ["user-document"], logger });
      let commandOwner: string | undefined;
      await waitUntil(async () => {
        const [row] = await fixture.pg.sql<{ application_name: string }[]>`
          SELECT application_name FROM pg_stat_activity WHERE application_name LIKE 'iam-user-%'
            AND wait_event_type='Lock' AND query LIKE '%user_document_outbox%'
        `;
        commandOwner = row?.application_name;
        return commandOwner !== undefined;
      });
      const started = performance.now();
      await schedule.close();
      expect(performance.now() - started).toBeLessThan(6_000);
      const owner = commandOwner;
      if (owner === undefined) throw new Error("The active repair command did not expose its PostgreSQL owner");
      await waitUntil(async () => {
        const sessions = await fixture.pg.sql`SELECT pid FROM pg_stat_activity WHERE application_name=${owner}`;
        return sessions.length === 0;
      });
    });

    const repaired = await consumer.maintenance.repairFailedOrStale({ staleBefore: new Date(), limit: 10 });
    expect(repaired.failed).toBe(0);
    await waitUntil(async () => (await fixture.published())?.post_publication_status === "processed");
    const document = await fixture.published();
    const ping = await fixture.redis.observer.ping();
    expect(document?.document_name).toBe("Scheduled user");
    expect(ping).toBe("PONG");
  });
}, 25_000);

async function withFixture(work: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) {
  await withOwnedTemporaryDirectory({
    prefix: "iam-user-document-repair-schedule-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      const stopExecutors: Array<() => Promise<void> | void> = [];
      await runWithOwnedTestResources(async ({ registerCleanup }) => {
        registerCleanup(async () => {
          if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
        });
        await work(await createFixture(temporaryDirectory, stopExecutors));
      });
    },
  });
}

async function createFixture(temporaryDirectory: string, stopExecutors: Array<() => Promise<void> | void>) {
  const pg = await createWorkerPostgresTestHarness();
  stopExecutors.push(pg.close);
  const redis = await createWorkerRedisTestHarness();
  stopExecutors.push(redis.close);
  const subject = randomUUID();
  const clock = { nowDate: () => new Date() };
  const uow = createUnitOfWork({
    db: pg.db,
    logger,
    createTxPorts: (db, lifecycle) => ({
      db,
      invalidation: createUserDocumentInvalidation({
        db,
        lifecycle,
        clock,
        jobProducer: {
          async enqueueOutboxEntries() {
            throw new Error("lost queue wake");
          },
        },
      }),
    }),
  });
  await uow.transaction(async (tx) => {
    await tx.db.insert(users).values({
      id: 1,
      subjectIdentifier: subject,
      username: "scheduled",
      name: "Scheduled user",
      status: UserStatus.Enable,
    });
    await tx.invalidation.recordChanges([{ kind: "user", userId: 1 }]);
  });
  await createSubjectAccessBootstrap({ redis: redis.writer, random: { uuid: randomUUID } }).seedMany(
    [{ subjectIdentifier: subject, state: "enabled" }],
    new Date(),
  );
  function environment(overrides: NodeJS.ProcessEnv = {}) {
    return {
      ...redis.commandEnvironment(temporaryDirectory),
      IAM_WORKER_DATABASE_URL: pg.commandDatabaseUrl,
      IAM_WORKER_ENABLED_MODULES: "user-document",
      IAM_WORKER_HTTP_ENABLED: "false",
      IAM_WORKER_BULL_BOARD_ENABLED: "false",
      IAM_WORKER_BULL_BOARD_AUTH_ENABLED: "false",
      IAM_WORKER_LOG_LEVEL: "info",
      IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
      IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: "100",
      IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT: "10",
      IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "5000",
      ...overrides,
    };
  }
  return {
    pg,
    redis,
    subject,
    stopExecutors,
    startEntry(overrides: NodeJS.ProcessEnv = {}) {
      return spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: workerRoot,
        env: environment(overrides),
      });
    },
    parsedEnv(overrides: NodeJS.ProcessEnv = {}) {
      const previous = process.env.DATABASE_URL;
      try {
        return parseWorkerEnv(environment(overrides));
      } finally {
        if (previous === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previous;
      }
    },
    async published() {
      const [row] = await pg.sql<{ document_name: string; source_version: string; post_publication_status: string }[]>`
        SELECT document->>'name' AS document_name,source_version,post_publication_status
        FROM user_document JOIN user_document_rebuild_state USING (user_id) WHERE user_id=1`;
      return row;
    },
  };
}

async function waitUntil(predicate: () => Promise<boolean>) {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Scheduled repair integration did not converge");
}
