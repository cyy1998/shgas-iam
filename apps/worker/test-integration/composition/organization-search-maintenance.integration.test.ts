import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { createJobQueue, DEFAULT_QUEUE_PREFIX } from "@iam/jobs";
import {
  createOrganizationSearchQueryRepository,
  createOrganizationSearchQueryService,
} from "@iam/organization-search-read-model/query";
import {
  createOrganizationSearchVerifier,
  createOrganizationSearchWorkerModule,
  ORGANIZATION_SEARCH_QUEUE_NAME,
} from "@iam/organization-search-read-model/worker";
import Redis from "ioredis";
import { createWorkerPostgresTestHarness } from "../postgres/postgres-test-harness";
import { resetWorkerRedisTestDatabase, resolveWorkerRedisTestUrl } from "../redis/redis-test-harness";
import { createOrganizationFixtureRuntime } from "./organization-worker-runtime";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let stopExecutors: Array<() => Promise<void> | void>;
beforeEach(() => {
  stopExecutors = [];
});
afterEach(async () => {
  if (stopExecutors.length) await resetWorkerRedisTestDatabase(stopExecutors);
});

test("first build and incompatible schema recovery require a fresh full verification while other read models remain independent", async () => {
  const harness = await createWorkerPostgresTestHarness();
  stopExecutors.push(harness.close);
  const redisUrl = resolveWorkerRedisTestUrl(process.env);
  const url = new URL(redisUrl);
  const redis = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
  const observer = new Redis(redisUrl);
  stopExecutors.push(async () => {
    try {
      await observer.quit();
    } finally {
      observer.disconnect();
    }
  });
  const prefix = DEFAULT_QUEUE_PREFIX;
  const queue = createJobQueue({ name: ORGANIZATION_SEARCH_QUEUE_NAME, redis, prefix });
  stopExecutors.push(() => queue.close());
  const sentinel = `iam:test:organization-maintenance:${randomUUID()}:unrelated`;
  const search = createOrganizationSearchQueryService({
    repository: createOrganizationSearchQueryRepository(harness.db),
  });
  const verifier = createOrganizationSearchVerifier({ db: harness.db });
  const runtime = createOrganizationFixtureRuntime(
    {
      NODE_ENV: "test",
      IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
      IAM_WORKER_REDIS_HOST: redis.host,
      IAM_WORKER_REDIS_PORT: String(redis.port),
      IAM_WORKER_REDIS_DB: String(redis.db),
      IAM_WORKER_REDIS_PASSWORD: redis.password,
      IAM_WORKER_ENABLED_MODULES: "organization-search",
      IAM_WORKER_HTTP_ENABLED: "false",
      IAM_WORKER_BULL_BOARD_ENABLED: "false",
    },
    createLogger({ nodeEnv: "test", logLevel: "silent", logFormat: "json", sourceApp: LoggerSourceApp.Worker }),
  );
  stopExecutors.push(async () => {
    try {
      await runtime.redis.quit();
    } finally {
      runtime.redis.disconnect();
    }
  });
  const createModule = () => {
    const module = createOrganizationSearchWorkerModule({
      db: harness.db,
      redis: runtime.config.redis,
      config: runtime.config.organizationSearch,
      clock: runtime.clock,
      logger: runtime.logger,
    });
    stopExecutors.push(module.close);
    return module;
  };
  let module = createModule();
  await observer.set(sentinel, "non-target-state");
  await harness.sql`INSERT INTO organization (id,org_code,org_name,parent_id,path,level,org_type,status,is_delete)
      VALUES (1,'ROOT','Root',-1,'/1',1,${OrganizationType.Department},${OrganizationStatus.Enable},false),
        (2,'CHILD','Child',1,'/1/2',2,${OrganizationType.Department},${OrganizationStatus.Disable},false),
        (3,'DELETED','Deleted',-1,'/3',1,${OrganizationType.Department},${OrganizationStatus.Disable},true)`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id,descendant_id,depth) VALUES (1,1,0),(1,2,1),(2,2,0),(3,3,0)`;
  // Organization maintenance has no authority over this independent Profile schema or pending work.
  await harness.sql`INSERT INTO user_profile (user_id,subject_identifier,username,name,status,profile_schema_version,source_dirty_version,detail,search_doc,subject_facts)
      VALUES (9001,${randomUUID()},'independent','Independent',1,99,7,'{"sentinel":true}','{}','{}')`;
  await harness.sql`INSERT INTO user_profile_dirty (user_id,dirty_version,status) VALUES (9001,7,'pending')`;
  const nonTargetBefore = await nonTarget();
  const missing = await command("verify", 1);
  expect(missing.output).toContain('"code":"missing-document"');
  const backfill = await command("backfill", 0, ["--batch-size", "1"]);
  expect(backfill.output).toContain('"publication":"not-verified"');
  const beforeConsumption = await command("verify", 1);
  expect(beforeConsumption.output).toContain('"code":"unprocessed-change"');
  await module.startConsumers();
  await converged();
  const firstPassed = await command("verify", 0);
  expect(firstPassed.output).toContain('"status":"passed"');
  expect(firstPassed.output).toContain('"tombstones":1');
  const beforeUpgradeVersions = await harness.sql<
    { organization_id: number; source_version: string }[]
  >`SELECT organization_id,source_version FROM organization_search_document ORDER BY organization_id`;

  // Stop the prior publisher before replacing incompatible documents in the maintenance window.
  await module.close();
  await harness.sql`UPDATE organization_search_document SET schema_version=2 WHERE organization_id IN (1,2)`;
  await harness.sql`UPDATE organization SET org_name='Upgraded root', is_virtual=true WHERE id=1`;
  await harness.sql`UPDATE organization SET status=${OrganizationStatus.Pause} WHERE id=2`;
  const oldSchemaResults = await search.search({
    filter: { field: "organization", op: "withinSubtreeOf", value: "ROOT" },
  });
  expect(oldSchemaResults).toEqual([]);
  const incompatible = await command("verify", 1);
  expect(incompatible.output).toContain('"code":"schema-mismatch"');
  module = createModule();
  await command("backfill", 0, ["--batch-size", "1"]);
  const stillMaintaining = await command("verify", 1);
  expect(stillMaintaining.output).toContain('"code":"unprocessed-change"');
  const repaired = await command("repair", 0, ["--limit", "10"]);
  expect(repaired.output).toContain('"publication":"not-verified"');
  await module.startConsumers();
  await converged();
  const recovered = await command("verify", 0);
  expect(recovered.output).toContain('"status":"passed"');
  const recoveredVersions = await harness.sql<
    { organization_id: number; source_version: string; version: string; status: string }[]
  >`SELECT document.organization_id,document.source_version,dirty.version,dirty.status
      FROM organization_search_document document JOIN organization_search_dirty dirty USING (organization_id) ORDER BY organization_id`;
  expect(recoveredVersions).toHaveLength(3);
  for (const row of recoveredVersions) {
    const previous = beforeUpgradeVersions.find((version) => version.organization_id === row.organization_id);
    if (!previous) throw new Error("Upgrade lost a source organization");
    expect(BigInt(row.source_version) > BigInt(previous.source_version)).toBe(true);
    expect(row.source_version).toBe(row.version);
    expect(row.status).toBe("processed");
  }
  const documents = await search.search({ filter: { field: "organization", op: "withinSubtreeOf", value: "ROOT" } });
  expect(documents.map((document) => document.organization.code)).toEqual(["ROOT", "CHILD"]);
  expect(documents[0]?.organization).toMatchObject({ name: "Upgraded root", isVirtual: true });
  expect(documents[1]?.organization).toMatchObject({
    status: OrganizationStatus.Pause,
    path: [
      { code: "ROOT", name: "Upgraded root", level: 1, distanceToTarget: 1 },
      { code: "CHILD", name: "Child", level: 2, distanceToTarget: 0 },
    ],
  });
  const repeatedRepair = await command("repair", 0, ["--limit", "10"]);
  expect(repeatedRepair.output).toContain('"enqueued":0');
  await module.close();
  const jobsBefore = await queue.getJobs();
  const finalVerification = await command("verify", 0);
  const jobsAfter = await queue.getJobs();
  expect(finalVerification.output).toContain('"status":"passed"');
  expect(jobsAfter.map((job) => job.id).sort()).toEqual(jobsBefore.map((job) => job.id).sort());
  const nonTargetAfter = await nonTarget();
  expect(nonTargetAfter).toEqual(nonTargetBefore);
  const sentinelAfter = await observer.get(sentinel);
  expect(sentinelAfter).toBe("non-target-state");
  async function nonTarget() {
    const [row] = await harness.sql`SELECT
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM user_profile t) AS profile,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM user_profile_dirty t) AS dirty`;
    return row;
  }
  async function converged() {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const report = await verifier.verify();
      if (report.status === "passed") return report;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Organization maintenance did not pass complete verification");
  }
  async function command(operation: "backfill" | "repair" | "verify", expectedExitCode: number, args: string[] = []) {
    const pending = runProcessCommandSmoke({
      label: `Organization Search maintenance ${operation}`,
      start: () =>
        spawnOwnedProcessTree({
          executable: process.execPath,
          args: [
            "--no-env-file",
            "run",
            `src/commands/organization-search/organization-search-${operation}.ts`,
            ...args,
          ],
          cwd: workerRoot,
          env: {
            ...process.env,
            NODE_ENV: "test",
            IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
            IAM_WORKER_REDIS_HOST: redis.host,
            IAM_WORKER_REDIS_PORT: String(redis.port),
            IAM_WORKER_REDIS_DB: String(redis.db),
            IAM_WORKER_REDIS_USERNAME: redis.username,
            IAM_WORKER_REDIS_PASSWORD: redis.password,
            IAM_WORKER_ORGANIZATION_SEARCH_QUEUE_PREFIX: prefix,
            IAM_WORKER_LOG_LEVEL: "info",
            IAM_WORKER_LOG_FORMAT: "json",
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
        }),
      completionTimeoutMs: 15_000,
      cleanupTimeoutMs: 5000,
      expectedExitCode,
      maxOutputBytes: 128 * 1024,
    });
    stopExecutors.push(async () => {
      await pending;
    });
    void pending.catch(() => {});
    return await pending;
  }
}, 60_000);
