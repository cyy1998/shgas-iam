import process from "node:process";
import { createProcessSmokeEnvironment } from "@iam/api-core/testing/process-smoke-harness";

export function createUnavailableStorageCommandEnvironment(input: { databaseUrl: string; temporaryDirectory: string }) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: input.temporaryDirectory,
    overrides: {
      NODE_ENV: "test",
      IAM_OPS_DATABASE_URL: input.databaseUrl,
      IAM_OPS_REDIS_HOST: "127.0.0.1",
      IAM_OPS_REDIS_PORT: "1",
      IAM_OPS_REDIS_DB: "15",
      IAM_OPS_LOG_LEVEL: "info",
      IAM_OPS_LOG_FORMAT: "json",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}
