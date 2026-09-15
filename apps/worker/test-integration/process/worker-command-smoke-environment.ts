import process from "node:process";
import {
  createProcessSmokeEnvironment,
} from "@iam/api-core/testing/process-smoke-harness";

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
