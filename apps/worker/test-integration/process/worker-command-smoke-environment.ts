import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

export function createUnavailableStorageCommandEnvironment(input: {
  databaseUrl: string;
  temporaryDirectory: string;
}) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: input.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_WORKER_DATABASE_URL: input.databaseUrl,
      IAM_WORKER_REDIS_HOST: "127.0.0.1",
      IAM_WORKER_REDIS_PORT: "1",
      IAM_WORKER_REDIS_DB: "15",
      IAM_WORKER_ENABLED_MODULES: "none",
      IAM_WORKER_HTTP_ENABLED: "false",
      IAM_WORKER_BULL_BOARD_ENABLED: "false",
      IAM_WORKER_LOG_LEVEL: "info",
      IAM_WORKER_LOG_FORMAT: "json",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

function createClientRuntimeMaintenanceCommandEnvironment(input: {
  maintenanceTimeoutMs?: number;
  redisPort?: number;
  temporaryDirectory: string;
  redisPassword?: string;
}) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: input.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_WORKER_REDIS_HOST: "127.0.0.1",
      IAM_WORKER_REDIS_PORT: String(input.redisPort ?? 1),
      IAM_WORKER_REDIS_PASSWORD: input.redisPassword,
      IAM_WORKER_REDIS_DB: "15",
      IAM_WORKER_LOG_LEVEL: "warn",
      IAM_WORKER_LOG_FORMAT: "json",
      IAM_WORKER_CLIENT_RUNTIME_MAINTENANCE_TIMEOUT_MS:
        input.maintenanceTimeoutMs === undefined
          ? undefined
          : String(input.maintenanceTimeoutMs),
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

export async function runClientRuntimeMaintenanceProcess(options: {
  args: string[];
  entrypoint: "client-runtime-repair.ts" | "client-runtime-verify.ts";
  label: string;
  maintenanceTimeoutMs?: number;
  redisPassword?: string;
  redisPort?: number;
  temporaryDirectoryPrefix: string;
}) {
  return await withOwnedTemporaryDirectory({
    prefix: options.temporaryDirectoryPrefix,
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      return await runProcessCommandSmoke({
        label: options.label,
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "run",
              `src/commands/client-runtime/${options.entrypoint}`,
              ...options.args,
            ],
            cwd: workerRoot,
            env: createClientRuntimeMaintenanceCommandEnvironment({
              temporaryDirectory,
              redisPassword: options.redisPassword,
              redisPort: options.redisPort,
              maintenanceTimeoutMs: options.maintenanceTimeoutMs,
            }),
          });
        },
        completionTimeoutMs: 30_000,
        cleanupTimeoutMs: 5_000,
        expectedExitCode: 1,
      });
    },
  });
}
