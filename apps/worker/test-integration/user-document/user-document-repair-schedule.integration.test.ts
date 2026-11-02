import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { copyFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import { createSubjectAccessBootstrap } from "@iam/api-core/subject-access";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import {
  createBoundedProcessLogCapture,
  runProcessCommandSmoke,
  runProcessSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnitOfWork } from "@iam/api-core/uow";
import { UserStatus } from "@iam/contracts";
import { closeMaintenancePostgresInvocation, createMaintenancePostgresResources } from "@iam/db/maintenance";
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

for (const standalone of [false, true])
  test.skipIf(standalone && process.platform !== "win32")(
    `the production Worker automatically repairs a lost Outbox wake and publishes Document and Facts (${standalone ? "standalone" : "source"})`,
    async () => {
      await withFixture(async (fixture) => {
        if (standalone) await fixture.buildStandalone();
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
    },
    30_000,
  );

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
    const env = fixture.parsedEnv({ IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "60000" });
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
      config: { ...env.userDocument, backfillBatchSize: env.userDocument.repair.limit },
    });
    fixture.stopExecutors.push(consumer.close);
    await consumer.startConsumers();
    let schedule: ReturnType<typeof startDocumentRepairSchedule> | undefined;
    fixture.stopExecutors.push(() => schedule?.close());
    await fixture.pg.sql.begin(async (tx) => {
      await tx`LOCK TABLE user_document_outbox IN ACCESS EXCLUSIVE MODE`;
      const peer = createMaintenancePostgresResources({
        databaseUrl: fixture.pg.commandDatabaseUrl,
        deadlineMs: 60_000,
        scope: "organization",
      });
      fixture.stopExecutors.push(() => peer.close("fixture-cleanup"));
      const peerOutcome = (async () => await peer.db.execute("SELECT count(*) FROM user_document_outbox"))().then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      );
      await waitUntil(async () => {
        const rows = await fixture.pg.sql`SELECT pid FROM pg_stat_activity
          WHERE application_name=${peer.applicationName} AND state='active' AND wait_event_type='Lock'`;
        return rows.length === 1;
      });
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
      // Both the lock and the independent same-role peer are still live here.
      // SQL timeout is 60s, so it cannot stand in for the <6s shutdown budget.
      const sessions = await fixture.pg.sql`SELECT pid,state,wait_event_type,query_start,application_name
        FROM pg_stat_activity WHERE application_name=${owner} OR application_name=${`${owner}-cancel`}`;
      const peers = await fixture.pg.sql`SELECT pid,state,wait_event_type FROM pg_stat_activity
        WHERE application_name=${peer.applicationName}`;
      expect([...peers]).toMatchObject([{ state: "active", wait_event_type: "Lock" }]);
      expect([...sessions]).toEqual([]);
      await peer.close("deadline");
      const canceledPeer = await peerOutcome;
      expect(canceledPeer).toHaveProperty("error");
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

test("the production Worker's shutdown listener waits for its blocked repair database owner and preserves a peer", async () => {
  await withFixture(async (fixture) => {
    const peer = createMaintenancePostgresResources({
      databaseUrl: fixture.pg.commandDatabaseUrl,
      deadlineMs: 60_000,
      scope: "organization",
    });
    fixture.stopExecutors.push(() => peer.close("fixture-cleanup"));
    await fixture.pg.sql.begin(async (tx) => {
      await tx`LOCK TABLE user_document_outbox IN ACCESS EXCLUSIVE MODE`;
      const peerOutcome = (async () => await peer.db.execute("SELECT count(*) FROM user_document_outbox"))().then(
        () => undefined,
        (error: unknown) => error,
      );
      await waitUntil(async () => {
        const rows = await fixture.pg.sql`SELECT pid FROM pg_stat_activity
          WHERE application_name=${peer.applicationName} AND wait_event_type='Lock'`;
        return rows.length === 1;
      });
      const completion = runProcessCommandSmoke({
        label: "production Worker shutdown listener",
        completionTimeoutMs: 15000,
        cleanupTimeoutMs: 5000,
        start: () => fixture.startInterruptibleEntry({ IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "60000" }),
      });
      void completion.catch(() => {});
      let owner: string | undefined;
      try {
        await waitUntil(async () => {
          const [row] = await fixture.pg.sql<
            { application_name: string }[]
          >`SELECT application_name FROM pg_stat_activity
            WHERE application_name LIKE 'iam-user-%' AND wait_event_type='Lock'`;
          owner = row?.application_name;
          return owner !== undefined;
        });
        const started = performance.now();
        await fixture.requestInterrupt();
        const result = await completion;
        const sessions = await fixture.pg.sql`SELECT pid FROM pg_stat_activity
          WHERE application_name=${owner!} OR application_name=${`${owner!}-cancel`}`;
        const peers = await fixture.pg.sql`SELECT state,wait_event_type FROM pg_stat_activity
          WHERE application_name=${peer.applicationName}`;
        expect(performance.now() - started).toBeLessThan(6000);
        expect(result.output).toContain("worker shutting down");
        expect([...sessions]).toEqual([]);
        expect([...peers]).toMatchObject([{ state: "active", wait_event_type: "Lock" }]);
      } finally {
        await fixture.requestInterrupt();
        await completion;
      }
      await peer.close("fixture-cleanup");
      const peerFailure = await peerOutcome;
      expect(peerFailure).toHaveProperty("cause");
    });
  });
}, 25000);

test("the production Worker exits unsuccessfully when shutdown cannot cancel its stopped child's database invocation", async () => {
  await withFixture(async (fixture) => {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const role = `iam_shutdown_${randomUUID().replaceAll("-", "")}`;
      const password = randomUUID();
      const target = new URL(fixture.pg.commandDatabaseUrl);
      target.username = role;
      target.password = password;
      let owner: string | undefined;
      await fixture.pg.sql.unsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
      registerCleanup(async () => {
        await fixture.pg.sql.unsafe(`DROP ROLE "${role}"`);
      });
      registerCleanup(async () => {
        await fixture.pg.sql.unsafe(`DROP OWNED BY "${role}"`);
      });
      registerCleanup(async () => {
        await fixture.pg.sql`GRANT EXECUTE ON FUNCTION pg_catalog.pg_cancel_backend(integer) TO PUBLIC`;
        if (owner)
          await closeMaintenancePostgresInvocation({
            databaseUrl: target.toString(),
            scope: "user",
            invocationId: owner.slice("iam-user-".length),
          });
        const remaining = await fixture.pg.sql`SELECT pid FROM pg_stat_activity WHERE usename=${role}`;
        expect([...remaining]).toEqual([]);
      });
      await fixture.pg.sql.unsafe(`GRANT USAGE ON SCHEMA "${fixture.pg.schemaName}" TO "${role}"`);
      await fixture.pg.sql.unsafe(`GRANT ALL ON ALL TABLES IN SCHEMA "${fixture.pg.schemaName}" TO "${role}"`);
      await fixture.pg.sql.unsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA "${fixture.pg.schemaName}" TO "${role}"`);
      await fixture.pg.sql`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_cancel_backend(integer) FROM PUBLIC`;
      await fixture.pg.sql.begin(async (tx) => {
        await tx`LOCK TABLE user_document_outbox IN ACCESS EXCLUSIVE MODE`;
        const completion = runProcessCommandSmoke({
          label: "production Worker required shutdown failure",
          completionTimeoutMs: 15000,
          cleanupTimeoutMs: 5000,
          expectedExitCode: 1,
          start: () =>
            fixture.startInterruptibleEntry({
              IAM_WORKER_DATABASE_URL: target.toString(),
              IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "60000",
            }),
        });
        void completion.catch(() => {});
        try {
          await waitUntil(async () => {
            const [row] = await fixture.pg.sql<
              { application_name: string }[]
            >`SELECT application_name FROM pg_stat_activity
              WHERE usename=${role} AND application_name LIKE 'iam-user-%' AND wait_event_type='Lock'`;
            owner = row?.application_name;
            return owner !== undefined;
          });
          await fixture.requestInterrupt();
          const outcome = await completion;
          expect(outcome.exitCode).toBe(1);
          expect(outcome.output).toContain("worker shutting down");
          const unconfirmed = await fixture.pg.sql`SELECT state,wait_event_type FROM pg_stat_activity
            WHERE application_name=${owner!}`;
          expect([...unconfirmed]).toMatchObject([{ state: "active", wait_event_type: "Lock" }]);
        } finally {
          await fixture.requestInterrupt();
          await completion;
        }
      });
    });
  });
}, 25000);

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
  let standaloneExecutable: string | undefined;
  const interruptFile = join(temporaryDirectory, "interrupt-worker");
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
    async buildStandalone() {
      const repositoryRoot = resolve(workerRoot, "../..");
      standaloneExecutable = join(temporaryDirectory, "worker.exe");
      for (const [entry, output] of [
        [join(workerRoot, "src/index.ts"), standaloneExecutable],
        [
          join(repositoryRoot, "packages/api-core/src/process/windows-job-launcher.mjs"),
          join(temporaryDirectory, "windows-job-launcher.exe"),
        ],
      ]) {
        if (!entry || !output) throw new Error("Missing standalone build input");
        await runProcessCommandSmoke({
          label: "compile Worker repair standalone fixture",
          completionTimeoutMs: 20000,
          cleanupTimeoutMs: 5000,
          start: () =>
            spawnOwnedProcessTree({
              executable: process.execPath,
              args: [
                "build",
                entry,
                "--compile",
                "--packages=bundle",
                "--no-compile-autoload-dotenv",
                "--no-compile-autoload-bunfig",
                "--windows-hide-console",
                `--outfile=${output}`,
              ],
              cwd: workerRoot,
              env: process.env,
            }),
        });
      }
      await copyFile(
        join(repositoryRoot, "packages/api-core/src/process/windows-job-supervisor.ps1"),
        join(temporaryDirectory, "windows-job-supervisor.ps1"),
      );
    },
    startEntry(overrides: NodeJS.ProcessEnv = {}) {
      return spawnOwnedProcessTree({
        executable: standaloneExecutable ?? process.execPath,
        args: standaloneExecutable ? [] : ["--no-env-file", "run", "src/index.ts"],
        cwd: workerRoot,
        env: environment(overrides),
      });
    },
    startInterruptibleEntry(overrides: NodeJS.ProcessEnv = {}) {
      return spawnOwnedProcessTree({
        executable: process.execPath,
        args: [
          "--no-env-file",
          "--preload=./test-integration/support/interrupt-worker.fixture.ts",
          "run",
          "src/index.ts",
        ],
        cwd: workerRoot,
        env: environment({ ...overrides, IAM_WORKER_TEST_INTERRUPT_FILE: interruptFile }),
      });
    },
    requestInterrupt() {
      return writeFile(interruptFile, "stop", "utf8");
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
