import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { createJobQueue, DEFAULT_QUEUE_PREFIX } from "@iam/jobs";
import {
  createOrganizationSearchQueryRepository,
  createOrganizationSearchQueryService,
} from "@iam/organization-search-read-model/query";
import {
  createOrganizationSearchWorkerModule,
  ORGANIZATION_SEARCH_QUEUE_NAME,
} from "@iam/organization-search-read-model/worker";
import { createWorkerPostgresTestHarness } from "../postgres/postgres-test-harness";
import { resolveWorkerRedisTestUrl } from "../redis/redis-test-harness";
import { createOrganizationQueueInventory } from "./organization-queue-inventory";
import { createOrganizationFixtureRuntime } from "./organization-worker-runtime";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
beforeAll(async () => {
  harness = await createWorkerPostgresTestHarness();
});
beforeEach(async () => {
  await harness.sql.unsafe(
    "TRUNCATE organization_search_change, organization_search_dirty, organization_search_document, organization_closure, organization RESTART IDENTITY CASCADE",
  );
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type, status)
    VALUES (1, 'ROOT', 'Root', -1, '/1', 1, ${OrganizationType.Department}, ${OrganizationStatus.Pause}),
      (2, 'CHILD', 'Child', 1, '/1/2', 2, ${OrganizationType.Department}, ${OrganizationStatus.Disable})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (1,1,0), (1,2,1), (2,2,0)`;
});
afterAll(async () => {
  if (harness) await harness.close();
});

test("organization backfill uses the normal consumer to publish complete documents without users or cache state", async () => {
  const prefix = DEFAULT_QUEUE_PREFIX;
  const url = new URL(resolveWorkerRedisTestUrl(process.env));
  const redis = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
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
  const module = createOrganizationSearchWorkerModule({
    db: harness.db,
    redis: runtime.config.redis,
    logger: runtime.logger,
    clock: runtime.clock,
    config: runtime.config.organizationSearch,
  });
  const search = createOrganizationSearchQueryService({
    repository: createOrganizationSearchQueryRepository(harness.db),
  });
  const inventoryQueue = createJobQueue({ name: ORGANIZATION_SEARCH_QUEUE_NAME, redis, prefix });
  let inventory: Awaited<ReturnType<typeof createOrganizationQueueInventory>> | undefined;
  try {
    inventory = await createOrganizationQueueInventory(inventoryQueue, harness.sql);
    const result = await runBackfillCLI(redis, prefix);
    await inventory.registerCurrentJobs();
    const beforeConsumption = await search.search({ filter: { field: "organization.code", op: "eq", value: "CHILD" } });
    expect(result.output).toContain('"registered":2');
    expect(result.output).toContain('"enqueued":2');
    expect(result.output).toContain('"publication":"not-verified"');
    expect(beforeConsumption).toEqual([]);
    await module.startConsumers();
    const published = await waitForPublishedChild(search);
    await inventory.registerCurrentJobs();
    expect(published).toEqual([
      {
        organization: {
          code: "CHILD",
          name: "Child",
          type: OrganizationType.Department,
          status: OrganizationStatus.Disable,
          level: 2,
          isVirtual: false,
          isEntity: false,
          path: [
            { code: "ROOT", name: "Root", type: OrganizationType.Department, level: 1, distanceToTarget: 1 },
            { code: "CHILD", name: "Child", type: OrganizationType.Department, level: 2, distanceToTarget: 0 },
          ],
        },
      },
    ]);
  } finally {
    await cleanup();
  }

  async function cleanup() {
    const failures: unknown[] = [];
    try {
      await module.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      if (inventory) {
        await inventory.seal();
        await inventory.removeOwnedJobs();
      }
    } catch (error) {
      failures.push(error);
    }
    const closed = await Promise.allSettled([inventoryQueue.close(), runtime.redis.quit()]);
    for (const result of closed) if (result.status === "rejected") failures.push(result.reason);
    if (failures.length) throw new AggregateError(failures, "Organization backfill fixture cleanup failed");
  }
}, 15_000);

test(
  "the real backfill CLI retains committed changes and closes resources when Redis wakeup fails",
  async () => {
    const result = await withOwnedTemporaryDirectory({
      prefix: "iam-organization-backfill-postgres-",
      cleanupTimeoutMs: 5_000,
      async run(temporaryDirectory) {
        return await runProcessCommandSmoke({
          label: "Organization backfill committed work with unavailable Redis",
          start() {
            return spawnOwnedProcessTree({
              executable: process.execPath,
              args: [
                "--no-env-file",
                "run",
                "src/commands/organization-search/organization-search-backfill.ts",
                "--batch-size",
                "1",
              ],
              cwd: workerRoot,
              env: {
                ...process.env,
                TMP: temporaryDirectory,
                TEMP: temporaryDirectory,
                NODE_ENV: "test",
                IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
                IAM_WORKER_REDIS_HOST: "127.0.0.1",
                IAM_WORKER_REDIS_PORT: "1",
                IAM_WORKER_REDIS_DB: "15",
                IAM_WORKER_LOG_LEVEL: "info",
                IAM_WORKER_LOG_FORMAT: "json",
                IAM_WORKER_USER_PROFILE_CONCURRENCY: "invalid-unused",
                IAM_WORKER_BULL_BOARD_PATH: "invalid-unused",
                FORCE_COLOR: "0",
                NO_COLOR: "1",
              },
            });
          },
          completionTimeoutMs: 15_000,
          cleanupTimeoutMs: 5_000,
          expectedExitCode: 1,
        });
      },
    });
    const changes =
      await harness.sql`SELECT organization_id, status FROM organization_search_change ORDER BY organization_id`;
    const search = createOrganizationSearchQueryService({
      repository: createOrganizationSearchQueryRepository(harness.db),
    });
    const published = await search.search({ filter: { field: "organization.code", op: "eq", value: "ROOT" } });
    expect(result.output).toContain("Organization search command shutting down");
    expect(Array.from(changes)).toEqual([{ organization_id: 1, status: "pending" }]);
    expect(published).toEqual([]);
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);

async function waitForPublishedChild(search: ReturnType<typeof createOrganizationSearchQueryService>) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const documents = await search.search({ filter: { field: "organization.code", op: "eq", value: "CHILD" } });
    if (documents.length) return documents;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Organization consumer did not publish the child document");
}

async function runBackfillCLI(redis: { host: string; port: number; db: number; password?: string }, prefix: string) {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-organization-backfill-success-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      return await runProcessCommandSmoke({
        label: "Organization search backfill production command",
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "run",
              "src/commands/organization-search/organization-search-backfill.ts",
              "--batch-size",
              "1",
            ],
            cwd: workerRoot,
            env: {
              ...process.env,
              TMP: temporaryDirectory,
              TEMP: temporaryDirectory,
              NODE_ENV: "test",
              IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
              IAM_WORKER_REDIS_HOST: redis.host,
              IAM_WORKER_REDIS_PORT: String(redis.port),
              IAM_WORKER_REDIS_DB: String(redis.db),
              IAM_WORKER_REDIS_PASSWORD: redis.password,
              IAM_WORKER_ORGANIZATION_SEARCH_QUEUE_PREFIX: prefix,
              IAM_WORKER_LOG_LEVEL: "info",
              IAM_WORKER_LOG_FORMAT: "json",
              IAM_WORKER_USER_PROFILE_CONCURRENCY: "invalid-unused",
              IAM_WORKER_BULL_BOARD_PATH: "invalid-unused",
              FORCE_COLOR: "0",
              NO_COLOR: "1",
            },
          });
        },
        completionTimeoutMs: 15_000,
        cleanupTimeoutMs: 5_000,
        expectedExitCode: 0,
      });
    },
  });
}
