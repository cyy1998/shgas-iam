import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { OrganizationLevel, OrganizationType, UserStatus } from "@iam/contracts";
import { organizationClosures, organizations, users } from "@iam/db/schema";
import { createOrganizationDocumentInvalidation } from "@iam/documents/organization/producer";
import { createSubjectFactsRedisCache, DocumentFactsCacheRecordSchema } from "@iam/documents/user";
import { createUserDocumentInvalidation } from "@iam/documents/user/producer";
import { createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { createUnitOfWork } from "@iam/unit-of-work";
import { useWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import { createWorkerRedisTestHarness, resetWorkerRedisTestDatabase } from "../support/redis-test-harness";
import { observeWorker, startWorker } from "../support/worker-composition.fixture";

const logger = { warn() {}, error() {} };

test("the production Worker automatically repairs a lost Organization Outbox wake", async () => {
  await withFixture(async (fixture) => {
    const result = await observeWorker({
      label: "scheduled Organization Document repair production entry",
      start: () => fixture.startEntry(),

      timeoutMs: 15_000,

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
      let observingSince: number | undefined;
      let scheduleOutput = "";
      const result = await observeWorker({
        label: `${selection.name} Worker Organization repair gate`,
        start() {
          return fixture.startEntry({
            IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED: selection.enabled,
            IAM_WORKER_ENABLED_MODULES: selection.modules,
            IAM_WORKER_BULL_BOARD_ENABLED: selection.dashboard,
          });
        },

        timeoutMs: 10_000,

        probe: async (output) => {
          scheduleOutput = output;
          observingSince ??= performance.now();
          const [outbox] = await fixture.pg.sql`SELECT status FROM organization_document_outbox`;
          const document = await fixture.published();
          if (outbox?.status !== "pending" || document !== undefined)
            throw new Error("A disabled Organization repair scheduler processed durable work");
          return performance.now() - observingSince > 350 ? outbox : undefined;
        },
      });
      expect(result.status).toBe("pending");
      expect(scheduleOutput).not.toContain('"event":"organization_document.repair.started"');
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

    let sawIndependentUserPublication = false;
    try {
      const organization = await observeWorker({
        label: "independent User and Organization repair schedules",
        start() {
          return fixture.startEntry({
            IAM_WORKER_ENABLED_MODULES: "user-document,organization-document",
            IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
            IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: "100",
            IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT: "10",
            IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "5000",
            IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS: "1000",
          });
        },

        timeoutMs: 15_000,

        probe: async (output) => {
          if (!sawIndependentUserPublication) {
            const [user] = await fixture.pg.sql`SELECT document->>'name' AS name,post_publication_status
              FROM user_document JOIN user_document_rebuild_state USING (user_id) WHERE user_id=1`;
            if (user?.name !== "Scheduled user" || user.post_publication_status !== "processed") return;
            if (!output.includes('"event":"organization_document.repair.failed"')) return;
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
    }
  });
}, 30_000);

test("a real repair cleanup failure stops only that schedule and leaves the other Document recovery running", async () => {
  await withFixture(async (fixture) => {
    await fixture.seedUser();
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const role = `iam_cleanup_${randomUUID().replaceAll("-", "")}`;
      const password = randomUUID();
      const databaseUrl = new URL(fixture.pg.databaseUrl);
      databaseUrl.username = role;
      databaseUrl.password = password;
      await fixture.pg.sql.unsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
      let lock: Promise<unknown> | undefined;
      let release = () => {};

      registerCleanup(async () => {
        await fixture.pg.sql.unsafe(`DROP ROLE "${role}"`);
      });
      registerCleanup(async () => {
        await fixture.pg.sql.unsafe(`DROP OWNED BY "${role}"`);
      });
      registerCleanup(async () => {
        await fixture.pg.sql`GRANT EXECUTE ON FUNCTION pg_catalog.pg_cancel_backend(integer) TO PUBLIC`;
      });
      registerCleanup(async () => {
        release();
        if (lock) {
          const failure = await lock;
          if (failure) throw failure;
        }
      });
      await fixture.pg.sql.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await fixture.pg.sql.unsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO "${role}"`);
      await fixture.pg.sql.unsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
      // A real control-connection permission failure, isolated to this disposable database.
      await fixture.pg.sql`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_cancel_backend(integer) FROM PUBLIC`;
      const acquired = Promise.withResolvers<void>();
      const releaseGate = Promise.withResolvers<void>();
      release = () => releaseGate.resolve();
      lock = fixture.pg.sql
        .begin(async (tx) => {
          await tx`LOCK TABLE organization_document_outbox IN ACCESS EXCLUSIVE MODE`;
          acquired.resolve();
          await releaseGate.promise;
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      await acquired.promise;
      let cleanupObservedAt: number | undefined;
      const result = await observeWorker({
        label: "required cleanup failure stops one production schedule",
        allowShutdownFailure: true,
        start() {
          return fixture.startEntry({
            IAM_WORKER_DATABASE_URL: databaseUrl.toString(),
            IAM_WORKER_ENABLED_MODULES: "user-document,organization-document",
            IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: "true",
            IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: "100",
            IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT: "10",
            IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: "5000",
            IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS: "1000",
          });
        },

        timeoutMs: 15000,

        probe: async (output) => {
          if (!output.includes('"event":"organization_document.repair.cleanup-failed"')) return;
          cleanupObservedAt ??= performance.now();
          release();
          const lockFailure = await lock;
          if (lockFailure) throw lockFailure;
          const [user] = await fixture.pg.sql`SELECT document->>'name' AS name,post_publication_status
            FROM user_document JOIN user_document_rebuild_state USING (user_id) WHERE user_id=1`;
          if (user?.name !== "Scheduled user" || user.post_publication_status !== "processed") return;
          // Observe several possible Organization intervals after cleanup failed, with its lock released.
          if (performance.now() - cleanupObservedAt < 500) return;
          const [outbox] = await fixture.pg.sql`SELECT status FROM organization_document_outbox`;
          const organization = await fixture.published();
          return { outbox: outbox?.status, organization, output };
        },
      });
      expect(result.outbox).toBe("pending");
      expect(result.organization).toBeUndefined();
      expect(result.output.match(/"event":"organization_document.repair.started"/gu)).toHaveLength(1);
      expect(result.output).toContain('"exitCode":70');
      const sessions = await fixture.pg.sql`SELECT pid FROM pg_stat_activity WHERE usename=${role}`;
      expect([...sessions]).toEqual([]);
    });
  });
}, 30000);

const getPostgres = useWorkerPostgresTestHarness();

async function withFixture(work: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>) {
  const stopExecutors: Array<() => Promise<void> | void> = [];
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    registerCleanup(async () => {
      if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
    });
    await work(await createFixture(stopExecutors));
  });
}

async function createFixture(stopExecutors: Array<() => Promise<void> | void>) {
  const pg = getPostgres();
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
      return startWorker({
        ...redis.commandEnvironment(),
        IAM_WORKER_DATABASE_URL: pg.databaseUrl,
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
