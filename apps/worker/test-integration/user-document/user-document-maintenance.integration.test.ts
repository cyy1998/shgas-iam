import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import {
  createRedisSubjectAccessStore,
  createSubjectAccessBarrier,
  createSubjectAccessBootstrap,
  createSubjectAccessRepair,
} from "@iam/api-core/subject-access";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import {
  ClientDelegationStatus,
  ClientStatus,
  OrganizationStatus,
  OrganizationType,
  RoleStatus,
  UserStatus,
} from "@iam/contracts";
import {
  createSubjectFactsRedisCache,
  createSubjectFactsRedisPublisher,
  DocumentFactsCacheRecordSchema,
} from "@iam/user-document";
import {
  createCurrentUserDocumentReadiness,
  createSubjectAccessAuthorityRepository,
  createUserDocumentWorkerModule,
} from "@iam/user-document/worker";
import Redis from "ioredis";
import { createWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import { resetWorkerRedisTestDatabase, resolveWorkerRedisTestUrl } from "../support/redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let stopExecutors: Array<() => Promise<void> | void>;
beforeEach(() => {
  stopExecutors = [];
});
afterEach(async () => {
  if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
});

test("full Profile maintenance rebuilds every account before verification and repeats both gates after source smoke", async () => {
  const fixture = await createMaintenanceFixture();
  const { sql } = fixture.pg;
  const sourceBefore = await fixture.sourceInventory();
  await sql`INSERT INTO user_document (user_id,subject_identifier,schema_version,source_version,published_at,document)
    VALUES (1,${fixture.subjects[0]!},0,1,NOW(),'{}')`;
  await sql`INSERT INTO user_document_rebuild_state (user_id,version,status,reason_codes)
    SELECT id,1,'pending','["unrecognized-source-change"]'::jsonb FROM "user"`;

  const initialPostgres = await fixture.command("verify-postgres", 1);
  expect(initialPostgres.output).toContain('"code":"document-version-mismatch"');
  expect(initialPostgres.output).toContain('"code":"document-missing"');
  const initialRedis = await fixture.command("verify-redis", 1);
  expect(initialRedis.output).toContain('"code":"facts-missing"');

  const backfill = await fixture.command("backfill", 0);
  expect(backfill.output).toContain('"enqueued":5');
  expect(backfill.output).toContain('"publication":"not-verified"');
  const beforeConsumption = await fixture.command("verify-postgres", 1);
  expect(beforeConsumption.output).toContain('"status":"failed"');
  // The durable backfill sources can be replayed, while the old incompatible rebuild metadata still fails explicitly.
  const recovery = await fixture.command("repair", 1, [
    "--stale-before",
    new Date(Date.now() + 60_000).toISOString(),
    "--limit",
    "10",
  ]);
  expect(recovery.output).toContain('"outbox":{"selected":5,"enqueued":5,"failed":0}');
  expect(recovery.output).toContain('"rebuilds":{"selected":5,"enqueued":0,"failed":5}');
  await fixture.startConsumer();
  await fixture.converged();
  await fixture.completeGates();

  const profiles = await sql<{ user_id: number; status: number | null; is_delete: boolean }[]>`
    SELECT user_id,(document->'user'->>'status')::int AS status,document IS NULL AS is_delete FROM user_document ORDER BY user_id`;
  expect([...profiles]).toEqual([
    { user_id: 1, status: UserStatus.Enable, is_delete: false },
    { user_id: 2, status: UserStatus.Disable, is_delete: false },
    { user_id: 3, status: null, is_delete: true },
    { user_id: 4, status: UserStatus.Pause, is_delete: false },
    { user_id: 5, status: UserStatus.Enable, is_delete: false },
  ]);
  const sourceAfterRebuild = await fixture.sourceInventory();
  expect(sourceAfterRebuild).toEqual(sourceBefore);
  await fixture.assertUnrelatedRedis();

  await fixture.stopConsumer();
  const versionsBeforeSmoke = await sql<
    { user_id: number; source_version: string }[]
  >`SELECT user_id,source_version FROM user_document ORDER BY user_id`;
  // The controlled source smoke changes the last inventory batch after the first complete acceptance.
  await sql`UPDATE "user" SET name='Smoke changed last user' WHERE id=5`;
  const sourceAfterSmoke = await fixture.sourceInventory();
  const stalePostgres = await fixture.command("verify-postgres", 1);
  expect(stalePostgres.output).toContain('"code":"document-authoritative-mismatch"');
  expect(stalePostgres.output).toContain('"samples":["user:5"]');
  // A valid old cache alone cannot prove that the PostgreSQL source smoke has converged.
  await fixture.command("verify-redis", 0);

  await fixture.command("backfill", 0);
  await fixture.command("repair", 0, ["--limit", "10"]);
  await fixture.startConsumer();
  await fixture.converged();
  await fixture.assertReadOnlyCompleteGates();
  const versionsAfterSmoke = await sql<
    { user_id: number; source_version: string }[]
  >`SELECT user_id,source_version FROM user_document ORDER BY user_id`;
  expect(versionsAfterSmoke).toHaveLength(5);
  for (const row of versionsAfterSmoke) {
    const previous = versionsBeforeSmoke.find(({ user_id }) => user_id === row.user_id);
    if (!previous) throw new Error("Full backfill omitted an earlier source user");
    expect(BigInt(row.source_version) > BigInt(previous.source_version)).toBe(true);
  }
  const sourceAfterFinalGates = await fixture.sourceInventory();
  expect(sourceAfterFinalGates).toEqual(sourceAfterSmoke);
  const publishedName = await sql<
    { name: string }[]
  >`SELECT document->'user'->>'name' AS name FROM user_document WHERE user_id=5`;
  expect([...publishedName]).toEqual([{ name: "Smoke changed last user" }]);
  await fixture.assertUnrelatedRedis();
}, 120_000);

test("complete maintenance gates reject corrupt, missing and inconsistent rows beyond the first batch without repairing them", async () => {
  const fixture = await createMaintenanceFixture();
  await fixture.command("backfill", 0);
  await fixture.startConsumer();
  await fixture.converged();
  await fixture.completeGates();
  await fixture.stopConsumer();
  const sourceBefore = await fixture.sourceInventory();
  const cache = createSubjectFactsRedisCache(fixture.redis);
  const raw = await cache.read(fixture.subjects[0]!);
  if (raw === null) throw new Error("Complete maintenance omitted the first subject");
  const record = DocumentFactsCacheRecordSchema.parse(JSON.parse(raw));
  if (record.kind !== "document") throw new Error("First inventory user must be live");
  await cache.publish({
    ...record,
    facts: { ...record.facts, profile: { ...record.facts.profile, name: "Different published name" } },
  });
  await fixture.pg.sql`UPDATE user_document SET schema_version=0 WHERE user_id=2`;
  await fixture.pg.sql`UPDATE user_document SET document='{"employments":[{}]}'::jsonb WHERE user_id=3`;
  await fixture.pg.sql`DELETE FROM user_document WHERE user_id=4`;
  await fixture.pg.sql`UPDATE user_document_rebuild_state SET version=version+1 WHERE user_id=5`;
  const damagedBefore = await fixture.publicationInventory();
  const cacheBefore = await Promise.all(fixture.subjects.map((subject) => cache.read(subject)));

  const postgres = await fixture.command("verify-postgres", 1);
  for (const code of ["document-version-mismatch", "document-invalid", "document-missing", "document-not-current"]) {
    expect(postgres.output).toContain(`"code":"${code}"`);
  }
  expect(postgres.output).toContain('"verifiedUsers":5');
  const redis = await fixture.command("verify-redis", 1);
  expect(redis.output).toContain('"code":"facts-mismatch"');
  expect(redis.output).toContain('"code":"facts-without-current-document"');
  expect(redis.output).toContain('"verifiedUsers":5');
  const damagedAfter = await fixture.publicationInventory();
  expect(damagedAfter).toEqual(damagedBefore);
  const cacheAfter = await Promise.all(fixture.subjects.map((subject) => cache.read(subject)));
  expect(cacheAfter).toEqual(cacheBefore);

  await fixture.command("backfill", 0);
  await fixture.command("repair", 0, ["--limit", "10"]);
  await fixture.startConsumer();
  await fixture.converged();
  await fixture.assertReadOnlyCompleteGates();
  const sourceAfter = await fixture.sourceInventory();
  expect(sourceAfter).toEqual(sourceBefore);
  await fixture.assertUnrelatedRedis();
}, 120_000);

async function createMaintenanceFixture() {
  const pg = await createWorkerPostgresTestHarness();
  stopExecutors.push(pg.close);
  const redisUrl = resolveWorkerRedisTestUrl(process.env);
  const url = new URL(redisUrl);
  const redisConfig = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
  const redis = new Redis(redisUrl);
  stopExecutors.push(async () => {
    try {
      await redis.quit();
    } finally {
      redis.disconnect();
    }
  });
  const subjects = Array.from({ length: 5 }, () => randomUUID());
  for (const [index, subject] of subjects.entries()) {
    await pg.sql`INSERT INTO "user" (id,subject_identifier,username,name,status,is_delete,password)
      VALUES (${index + 1},${subject},${`maintenance-${index + 1}`},${`User ${index + 1}`},
        ${index === 1 || index === 2 ? UserStatus.Disable : index === 3 ? UserStatus.Pause : UserStatus.Enable},
        ${index === 2},'synthetic-password-hash')`;
  }
  await pg.sql`INSERT INTO client (id,client_code,client_name,client_secret,status,ext_attributes,sso_secret,sso_credential_id,sso_secret_updated_at)
    VALUES (1,'maintenance-client','Non-target Client','synthetic-internal-secret',${ClientStatus.Enable},'{}',
      'synthetic-sso-secret',${randomUUID()},NOW())`;
  await pg.sql`INSERT INTO organization (id,org_code,org_name,path,level,org_type,status)
    VALUES (1,'MAINTENANCE','Non-target Organization','/1',1,${OrganizationType.Department},${OrganizationStatus.Enable})`;
  await pg.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0)`;
  await pg.sql`INSERT INTO role (id,role_code,role_name,client_id,status)
    VALUES (1,'maintenance-role','Non-target Role',1,${RoleStatus.Enable})`;
  await pg.sql`INSERT INTO client_delegation (id,delegator_user_id,delegatee_user_id,client_id,organization_scope_id,start_time,end_time,status)
    VALUES (1,1,2,1,1,NOW()-INTERVAL '1 hour',NOW()+INTERVAL '1 hour',${ClientDelegationStatus.Enable})`;
  await pg.sql`INSERT INTO audit_log (action,outcome,actor_type,actor_system_key,target_type,target_id,source_app,details)
    VALUES ('maintenance.fixture','success','system','maintenance-fixture','user',1,'worker','{"preserve":true}')`;
  const sentinel = `iam:test:profile-maintenance:${randomUUID()}:unrelated`;
  await redis.set(sentinel, "non-target-state");
  const clock = { nowDate: () => new Date() };
  const logger = createLogger({
    nodeEnv: "test",
    logLevel: "silent",
    logFormat: "json",
    sourceApp: LoggerSourceApp.Worker,
  });
  const store = createRedisSubjectAccessStore({ redis });
  const barrier = createSubjectAccessBarrier({ store, clock, random: { uuid: randomUUID } });
  const bootstrap = createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } });
  await bootstrap.seedMany(
    subjects.map((subjectIdentifier, index) => ({
      subjectIdentifier,
      state: index === 0 || index === 4 ? ("enabled" as const) : ("disabled" as const),
    })),
    new Date(),
  );
  const repair = createSubjectAccessRepair({
    authority: createSubjectAccessAuthorityRepository({
      db: pg.db,
      subjectFactsPublisher: createSubjectFactsRedisPublisher(redis),
    }),
    backlog: store,
    barrier,
    logger,
  });
  const readiness = createCurrentUserDocumentReadiness({
    db: pg.db,
    subjectFactsRedis: redis,
    subjectAccessBootstrap: bootstrap,
    clock,
    config: { buildBatchSize: 1 },
  });
  let module: ReturnType<typeof createUserDocumentWorkerModule> | undefined;

  async function startConsumer() {
    const next = createUserDocumentWorkerModule({
      db: pg.db,
      redis: redisConfig,
      subjectFactsRedis: redis,
      subjectAccessRepair: repair,
      logger,
      clock,
      config: { concurrency: 1, rebuildBatchSize: 1, backfillBatchSize: 1 },
    });
    module = next;
    stopExecutors.push(next.close);
    await next.startConsumers();
  }
  async function stopConsumer() {
    await module?.close();
    module = undefined;
  }
  async function converged() {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const postgres = await readiness.postgresGate.verify({ batchSize: 1 });
      const redis = await readiness.redisAccessGate.verify({ batchSize: 1 });
      if (postgres.status === "passed" && redis.status === "passed") return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Profile maintenance did not converge through both full gates");
  }
  async function command(
    operation: "backfill" | "repair" | "verify-postgres" | "verify-redis",
    expectedExitCode: number,
    args: string[] = [],
  ) {
    const readiness = operation.startsWith("verify-");
    const databaseUrl = new URL(pg.commandDatabaseUrl);
    if (readiness)
      databaseUrl.searchParams.set(
        "options",
        `${databaseUrl.searchParams.get("options")} -cdefault_transaction_read_only=on`,
      );
    const pending = runProcessCommandSmoke({
      label: `User Document maintenance ${operation}`,
      start: () =>
        spawnOwnedProcessTree({
          executable: process.execPath,
          args: [
            "--no-env-file",
            "run",
            `src/commands/user-document/user-document-${readiness ? "readiness" : operation}.ts`,
            ...(readiness ? [operation, "--batch-size", "1"] : []),
            ...args,
          ],
          cwd: workerRoot,
          env: {
            ...process.env,
            NODE_ENV: "test",
            IAM_WORKER_DATABASE_URL: databaseUrl.toString(),
            IAM_WORKER_REDIS_HOST: redisConfig.host,
            IAM_WORKER_REDIS_PORT: String(redisConfig.port),
            IAM_WORKER_REDIS_DB: String(redisConfig.db),
            IAM_WORKER_REDIS_PASSWORD: redisConfig.password,
            IAM_WORKER_ENABLED_MODULES: "user-document",
            IAM_WORKER_HTTP_ENABLED: "false",
            IAM_WORKER_BULL_BOARD_ENABLED: "false",
            IAM_WORKER_USER_DOCUMENT_BACKFILL_BATCH_SIZE: "1",
            IAM_WORKER_LOG_LEVEL: "info",
            IAM_WORKER_LOG_FORMAT: "json",
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
        }),
      completionTimeoutMs: 15_000,
      cleanupTimeoutMs: 5_000,
      expectedExitCode,
      maxOutputBytes: 128 * 1024,
    });
    stopExecutors.push(async () => {
      await pending;
    });
    void pending.catch(() => {});
    return await pending;
  }
  async function completeGates() {
    for (const operation of ["verify-postgres", "verify-redis"] as const) {
      const result = await command(operation, 0);
      expect(result.output).toContain('"status":"passed"');
      expect(result.output).toContain('"counts":{"users":5,"documents":5,"verifiedUsers":5');
    }
  }
  async function publicationInventory() {
    const [row] = await pg.sql`SELECT
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM user_document t) AS profiles,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM user_document_rebuild_state t) AS rebuilds,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM user_document_outbox t) AS outbox`;
    return row;
  }
  async function assertReadOnlyCompleteGates() {
    if (!module) throw new Error("Complete verification requires the controlled consumer to have converged");
    const before = await publicationInventory();
    const jobsBefore = await module.queue.getJobs();
    const cache = createSubjectFactsRedisCache(redis);
    const factsBefore = await Promise.all(subjects.map((subject) => cache.read(subject)));
    const barriersBefore = await bootstrap.inspectMany(subjects);
    await completeGates();
    const after = await publicationInventory();
    expect(after).toEqual(before);
    const jobsAfter = await module.queue.getJobs();
    expect(jobsAfter.map((job) => job.id).sort()).toEqual(jobsBefore.map((job) => job.id).sort());
    const factsAfter = await Promise.all(subjects.map((subject) => cache.read(subject)));
    expect(factsAfter).toEqual(factsBefore);
    const barriersAfter = await bootstrap.inspectMany(subjects);
    expect(barriersAfter).toEqual(barriersBefore);
  }
  async function sourceInventory() {
    const [row] = await pg.sql`SELECT
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "user" t) AS users,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client t) AS clients,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM organization t) AS organizations,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM role t) AS roles,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM client_delegation t) AS delegations,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_log t) AS audit`;
    return row;
  }
  async function assertUnrelatedRedis() {
    const value = await redis.get(sentinel);
    expect(value).toBe("non-target-state");
  }
  return {
    pg,
    redis,
    subjects,
    command,
    startConsumer,
    stopConsumer,
    converged,
    completeGates,
    assertReadOnlyCompleteGates,
    publicationInventory,
    sourceInventory,
    assertUnrelatedRedis,
  };
}
