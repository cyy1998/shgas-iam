import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  spawnOwnedProcessTree,
  withReadyProcess,
} from "@iam/test-support/process-smoke-harness";
import { useWorkerPostgresTestHarness } from "../support/postgres-test-harness";
import { resolveWorkerRedisTestUrl } from "../support/redis-test-harness";

const getDatabase = useWorkerPostgresTestHarness();

test("Worker starts its consumer, reports readiness and shuts down", async () => {
  const result = await withReadyProcess({
    label: "Worker entry",
    temporaryDirectoryPrefix: "iam-worker-entry-",
    start(context) {
      return spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: createProcessSmokeEnvironment({
          source: process.env,
          temporaryDirectory: context.temporaryDirectory,
          overrides: {
            NODE_ENV: "test",
            IAM_WORKER_DATABASE_URL: getDatabase().databaseUrl,
            IAM_WORKER_REDIS_URL: resolveWorkerRedisTestUrl(process.env),
            IAM_WORKER_ENABLED_MODULES: "organization-document",
            IAM_WORKER_HTTP_ENABLED: "true",
            IAM_WORKER_HTTP_HOSTNAME: context.hostname,
            IAM_WORKER_HTTP_PORT: String(context.port),
            IAM_WORKER_BULL_BOARD_ENABLED: "false",
            IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED: "false",
            IAM_WORKER_LOG_FORMAT: "json",
          },
        }),
      });
    },
    childReadinessEvidence: "worker started",
    async probe({ hostname, port }, signal) {
      const response = await fetch(`http://${hostname}:${port}/healthz`, { signal, headers: { Connection: "close" } });
      const body = await response.json();
      return response.ok ? body : undefined;
    },
  });
  expect(result).toMatchObject({
    ok: true,
    enabledModules: ["organization-document"],
    modulesStarted: true,
    dependencies: { db: "ok", redis: "ok" },
  });
}, 30_000);
