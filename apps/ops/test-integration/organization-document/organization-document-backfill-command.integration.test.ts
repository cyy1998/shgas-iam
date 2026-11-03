import { afterEach, beforeEach, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { createLogger, LoggerSourceApp } from "@iam/api-core/logger";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { DEFAULT_QUEUE_PREFIX } from "@iam/jobs";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
} from "@iam/organization-document/query";
import { createOrganizationDocumentWorkerModule } from "@iam/organization-document/worker";
import { createOpsPostgresTestHarness } from "../support/postgres-test-harness";
import { resetOpsRedisTestDatabase, resolveOpsRedisTestUrl } from "../support/redis-test-harness";
import { createOrganizationFixtureRuntime } from "./organization-worker-runtime";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createOpsPostgresTestHarness>>;
let stopExecutors: Array<() => Promise<void> | void>;
beforeEach(async () => {
  stopExecutors = [];
  harness = await createOpsPostgresTestHarness();
  stopExecutors.push(harness.close);
  await harness.sql`INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type, status)
    VALUES (1, 'ROOT', 'Root', -1, '/1', 1, ${OrganizationType.Department}, ${OrganizationStatus.Pause}),
      (2, 'CHILD', 'Child', 1, '/1/2', 2, ${OrganizationType.Department}, ${OrganizationStatus.Disable})`;
  await harness.sql`INSERT INTO organization_closure (ancestor_id, descendant_id, depth) VALUES (1,1,0), (1,2,1), (2,2,0)`;
});
afterEach(async () => {
  if (stopExecutors.length) await resetOpsRedisTestDatabase(stopExecutors);
});

test("organization backfill uses the normal consumer to publish complete documents without users or cache state", async () => {
  const prefix = DEFAULT_QUEUE_PREFIX;
  const url = new URL(resolveOpsRedisTestUrl(process.env));
  const redis = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
  const runtime = createOrganizationFixtureRuntime(
    {
      NODE_ENV: "test",
      IAM_OPS_DATABASE_URL: harness.commandDatabaseUrl,
      IAM_OPS_REDIS_HOST: redis.host,
      IAM_OPS_REDIS_PORT: String(redis.port),
      IAM_OPS_REDIS_DB: String(redis.db),
      IAM_OPS_REDIS_PASSWORD: redis.password,
    },
    createLogger({ nodeEnv: "test", logLevel: "silent", logFormat: "json", sourceApp: LoggerSourceApp.Ops }),
  );
  stopExecutors.push(async () => {
    try {
      await runtime.redis.quit();
    } finally {
      runtime.redis.disconnect();
    }
  });
  const module = createOrganizationDocumentWorkerModule({
    db: harness.db,
    redis: runtime.config.redis,
    logger: runtime.logger,
    clock: runtime.clock,
    config: runtime.config.organizationDocument,
  });
  stopExecutors.push(module.close);
  const search = createOrganizationDocumentQueryService({
    repository: createOrganizationDocumentQueryRepository(harness.db),
  });
  const result = await runBackfillCLI(redis, prefix);
  const { items: beforeConsumption } = await search.search({
    filter: { field: "code", op: "eq", value: "CHILD" },
    select: ["code", "name", "type", "status", "level", "isVirtual", "isEntity", "path"],
  });
  expect(result.output).toContain('"registered":2');
  expect(result.output).toContain('"enqueued":2');
  expect(result.output).toContain('"publication":"not-verified"');
  expect(beforeConsumption).toEqual([]);
  await module.startConsumers();
  const published = await waitForPublishedChild(search);
  expect(published).toEqual([
    {
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
  ]);
}, 15_000);

test(
  "the real backfill CLI retains committed changes and closes resources when Redis wakeup fails",
  async () => {
    const pending = withOwnedTemporaryDirectory({
      prefix: "iam-organization-backfill-postgres-",
      cleanupTimeoutMs: 5_000,
      async run(temporaryDirectory) {
        return await runProcessCommandSmoke({
          label: "Organization backfill committed work with unavailable Redis",
          start() {
            return spawnOwnedProcessTree({
              executable: process.execPath,
              args: ["--no-env-file", "run", "src/index.ts", "organization-document", "backfill", "--batch-size", "1"],
              cwd: opsRoot,
              env: {
                ...process.env,
                TMP: temporaryDirectory,
                TEMP: temporaryDirectory,
                NODE_ENV: "test",
                IAM_OPS_DATABASE_URL: harness.commandDatabaseUrl,
                IAM_OPS_REDIS_HOST: "127.0.0.1",
                IAM_OPS_REDIS_PORT: "1",
                IAM_OPS_REDIS_DB: "15",
                IAM_OPS_LOG_LEVEL: "info",
                IAM_OPS_LOG_FORMAT: "json",
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
    stopExecutors.push(async () => {
      await pending;
    });
    void pending.catch(() => {});
    const result = await pending;
    const changes =
      await harness.sql`SELECT organization_id, status FROM organization_document_outbox ORDER BY organization_id`;
    const search = createOrganizationDocumentQueryService({
      repository: createOrganizationDocumentQueryRepository(harness.db),
    });
    const { items: published } = await search.search({
      filter: { field: "code", op: "eq", value: "ROOT" },
      select: ["code", "name", "type", "status", "level", "isVirtual", "isEntity", "path"],
    });
    expect(result.output).toContain("Organization document command shutting down");
    expect(Array.from(changes)).toEqual([{ organization_id: 1, status: "pending" }]);
    expect(published).toEqual([]);
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);

async function waitForPublishedChild(search: ReturnType<typeof createOrganizationDocumentQueryService>) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const { items: documents } = await search.search({
      filter: { field: "code", op: "eq", value: "CHILD" },
      select: ["code", "name", "type", "status", "level", "isVirtual", "isEntity", "path"],
    });
    if (documents.length) return documents;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Organization consumer did not publish the child document");
}

async function runBackfillCLI(redis: { host: string; port: number; db: number; password?: string }, prefix: string) {
  const pending = withOwnedTemporaryDirectory({
    prefix: "iam-organization-backfill-success-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      return await runProcessCommandSmoke({
        label: "Organization document backfill production command",
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts", "organization-document", "backfill", "--batch-size", "1"],
            cwd: opsRoot,
            env: {
              ...process.env,
              TMP: temporaryDirectory,
              TEMP: temporaryDirectory,
              NODE_ENV: "test",
              IAM_OPS_DATABASE_URL: harness.commandDatabaseUrl,
              IAM_OPS_REDIS_HOST: redis.host,
              IAM_OPS_REDIS_PORT: String(redis.port),
              IAM_OPS_REDIS_DB: String(redis.db),
              IAM_OPS_REDIS_PASSWORD: redis.password,
              IAM_OPS_ORGANIZATION_DOCUMENT_QUEUE_PREFIX: prefix,
              IAM_OPS_LOG_LEVEL: "info",
              IAM_OPS_LOG_FORMAT: "json",
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
  stopExecutors.push(async () => {
    await pending;
  });
  void pending.catch(() => {});
  return await pending;
}
