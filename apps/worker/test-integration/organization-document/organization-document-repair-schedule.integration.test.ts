import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createSubjectAccessBootstrap } from "@iam/api-core/subject-access";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import {
  createBoundedProcessLogCapture,
  runProcessSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnitOfWork } from "@iam/api-core/uow";
import { OrganizationLevel, OrganizationType, UserStatus } from "@iam/contracts";
import { organizationClosures, organizations, users } from "@iam/db/schema";
import { createOrganizationDocumentInvalidation } from "@iam/organization-document/producer";
import { createSubjectFactsRedisCache, DocumentFactsCacheRecordSchema } from "@iam/user-document";
import { createUserDocumentInvalidation } from "@iam/user-document/producer";
import { createWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import { createWorkerRedisTestHarness, resetWorkerRedisTestDatabase } from "../support/redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
const logger = { warn() {}, error() {} };

test("the production Worker automatically repairs a lost Organization Outbox wake", async () => {
  await withFixture(async (fixture) => {
    const result = await runProcessSmoke({
      label: "scheduled Organization Document repair production entry",
      start: () => fixture.startEntry(),
      childReadinessEvidence: "worker started",
      readinessTimeoutMs: 15_000,
      cleanupTimeoutMs: 5_000,
      probe: async () => {
        const document = await fixture.published();
        return document?.name === "Scheduled organization" && document.status === "processed" ? document : undefined;
      },
    });
    const [outbox] = await fixture.pg.sql`SELECT status FROM organization_document_outbox`;
    expect(result).toMatchObject({ code: "SCHEDULED", name: "Scheduled organization", status: "processed" });
    expect(outbox?.status).toBe("processed");
  });
}, 30_000);

for (const selection of [
  { name: "disabled", enabled: "false", modules: "organization-document", dashboard: "false" },
  { name: "user-only", enabled: "true", modules: "user-document", dashboard: "false" },
  { name: "dashboard-only", enabled: "true", modules: "none", dashboard: "true" },
]) {
  test(`the production ${selection.name} Worker leaves Organization repair disabled`, async () => {
    await withFixture(async (fixture) => {
      let logs: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
      let observingSince: number | undefined;
      try {
        const result = await runProcessSmoke({
          label: `${selection.name} Worker Organization repair gate`,
          start() {
            const child = fixture.startEntry({
              IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED: selection.enabled,
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
            const [outbox] = await fixture.pg.sql`SELECT status FROM organization_document_outbox`;
            const document = await fixture.published();
            if (outbox?.status !== "pending" || document !== undefined)
              throw new Error("A disabled Organization repair scheduler processed durable work");
            return performance.now() - observingSince > 350 ? outbox : undefined;
          },
        });
        expect(result.status).toBe("pending");
        expect(logs?.snapshot()).not.toContain('"event":"organization_document.repair.started"');
      } finally {
        logs?.dispose();
      }
    });
  }, 20_000);
}

test("an Organization repair deadline does not block User repair and a later Organization round recovers", async () => {
  await withFixture(async (fixture) => {
    const subject = await fixture.seedUser();
    let release!: () => void;
    let acquired!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lockAcquired = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const lock = fixture.pg.sql.begin(async (tx) => {
      await tx`LOCK TABLE organization_document_outbox IN ACCESS EXCLUSIVE MODE`;
      acquired();
      await releaseGate;
    });
    const lockOutcome = lock.then(
      () => undefined,
      (error: unknown) => error,
    );
    fixture.stopExecutors.push(async () => {
      release();
      const failure = await lockOutcome;
      if (failure !== undefined) throw failure;
    });
    await lockAcquired;
    let logs: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
    let sawIndependentUserPublication = false;
    try {
      const organization = await runProcessSmoke({
        label: "independent User and Organization repair schedules",
        start() {
          const child = fixture.startEntry({
            IAM_WORKER_ENABLED_MODULES: "user-document,organization-document",
            IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
            IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: "100",
            IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT: "10",
            IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "5000",
            IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS: "1000",
          });
          logs = createBoundedProcessLogCapture(child, { maxBytes: 65_536 });
          return child;
        },
        childReadinessEvidence: "worker started",
        readinessTimeoutMs: 15_000,
        cleanupTimeoutMs: 5_000,
        probe: async () => {
          if (!sawIndependentUserPublication) {
            const [user] = await fixture.pg.sql`SELECT document->>'name' AS name,post_publication_status
              FROM user_document JOIN user_document_rebuild_state USING (user_id) WHERE user_id=1`;
            if (user?.name !== "Scheduled user" || user.post_publication_status !== "processed") return;
            if (!logs?.snapshot().includes('"event":"organization_document.repair.failed"')) return;
            const facts = await createSubjectFactsRedisCache(fixture.redis.observer).read(subject);
            if (facts === null) return;
            expect(DocumentFactsCacheRecordSchema.parse(JSON.parse(facts))).toMatchObject({
              kind: "document",
              facts: { profile: { name: "Scheduled user" } },
            });
            const organizationBeforeRecovery = await fixture.published();
            expect(organizationBeforeRecovery).toBeUndefined();
            sawIndependentUserPublication = true;
            release();
            const failure = await lockOutcome;
            if (failure !== undefined) throw failure;
          }
          const document = await fixture.published();
          return document?.name === "Scheduled organization" && document.status === "processed" ? document : undefined;
        },
      });
      expect(sawIndependentUserPublication).toBe(true);
      expect(organization.name).toBe("Scheduled organization");
    } finally {
      release();
      logs?.dispose();
    }
  });
}, 30_000);

async function withFixture(work: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) {
  await withOwnedTemporaryDirectory({
    prefix: "iam-organization-document-repair-schedule-",
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
  const clock = { nowDate: () => new Date() };
  const lostWake = {
    async enqueueOutboxEntries() {
      throw new Error("lost queue wake");
    },
  };
  const uow = createUnitOfWork({
    db: pg.db,
    logger,
    createTxPorts: (db, lifecycle) => ({
      db,
      organization: createOrganizationDocumentInvalidation({ db, lifecycle, clock, jobProducer: lostWake }),
      user: createUserDocumentInvalidation({ db, lifecycle, clock, jobProducer: lostWake }),
    }),
  });
  await uow.transaction(async (tx) => {
    await tx.db.insert(organizations).values({
      id: 1,
      orgCode: "SCHEDULED",
      orgName: "Scheduled organization",
      parentId: -1,
      path: "/1",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    });
    await tx.db.insert(organizationClosures).values({ ancestorId: 1, descendantId: 1, depth: 0 });
    await tx.organization.recordChanges([{ kind: "created", organizationId: 1 }]);
  });
  return {
    pg,
    redis,
    stopExecutors,
    async seedUser() {
      const subject = randomUUID();
      await uow.transaction(async (tx) => {
        await tx.db.insert(users).values({
          id: 1,
          subjectIdentifier: subject,
          username: "scheduled",
          name: "Scheduled user",
          status: UserStatus.Enable,
        });
        await tx.user.recordChanges([{ kind: "user", userId: 1 }]);
      });
      await createSubjectAccessBootstrap({ redis: redis.writer, random: { uuid: randomUUID } }).seedMany(
        [{ subjectIdentifier: subject, state: "enabled" }],
        new Date(),
      );
      return subject;
    },
    startEntry(overrides: NodeJS.ProcessEnv = {}) {
      return spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: workerRoot,
        env: {
          ...redis.commandEnvironment(temporaryDirectory),
          IAM_WORKER_DATABASE_URL: pg.commandDatabaseUrl,
          IAM_WORKER_ENABLED_MODULES: "organization-document",
          IAM_WORKER_HTTP_ENABLED: "false",
          IAM_WORKER_BULL_BOARD_ENABLED: "false",
          IAM_WORKER_BULL_BOARD_AUTH_ENABLED: "false",
          IAM_WORKER_LOG_LEVEL: "info",
          IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "false",
          IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED: "true",
          IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS: "100",
          IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT: "10",
          IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS: "5000",
          ...overrides,
        },
      });
    },
    async published() {
      const [row] = await pg.sql<{ code: string; name: string; status: string }[]>`
        SELECT document->>'code' AS code,document->>'name' AS name,status
        FROM organization_document JOIN organization_document_rebuild_state USING (organization_id) WHERE organization_id=1`;
      return row;
    },
  };
}
