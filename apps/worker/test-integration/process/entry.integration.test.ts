import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { afterEach, describe, expect, test } from "bun:test";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
const entrySmoke = createProcessSmokeSuite({
  label: "Worker entry",
  temporaryDirectoryPrefix: "iam-worker-entry-smoke-",
  hostname: "localhost",
});

afterEach(entrySmoke.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(context: ProcessSmokeAttemptContext) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_WORKER_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_WORKER_REDIS_HOST: "127.0.0.1",
      IAM_WORKER_REDIS_PORT: "1",
      IAM_WORKER_REDIS_DB: "15",
      IAM_WORKER_ENABLED_MODULES: "none",
      IAM_WORKER_HTTP_ENABLED: "true",
      IAM_WORKER_HTTP_PORT: String(context.port),
      IAM_WORKER_BULL_BOARD_ENABLED: "true",
      IAM_WORKER_BULL_BOARD_QUEUES: "none",
      IAM_WORKER_BULL_BOARD_AUTH_ENABLED: "false",
      IAM_WORKER_LOG_LEVEL: "info",
      IAM_WORKER_LOG_FORMAT: "json",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

async function probeWorkerReadiness(origin: string, signal: AbortSignal) {
  const response = await fetch(`${origin}/healthz`, { signal });
  if (response.status !== 503) {
    throw new PortCollisionError(
      `port served an unexpected Worker readiness status: expected 503, received ${response.status}`,
    );
  }
  return await response.json() as Record<string, unknown>;
}

describe("Worker entry", () => {
  test("reports unavailable storage as not ready without starting consumers", async () => {
    const result = await entrySmoke.run({
      start(context) {
        return spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "src/index.ts"],
          cwd: workerRoot,
          env: createEntryEnvironment(context),
        });
      },
      probe: (context, signal) => probeWorkerReadiness(entryOrigin(context), signal),
      childReadinessEvidence: "worker started",
    });

    expect(result).toMatchObject({
      ok: false,
      enabledModules: [],
      modulesStarted: true,
      dependencies: {
        db: "error",
        redis: "error",
      },
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
