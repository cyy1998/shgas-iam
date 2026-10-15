import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnavailableStorageCommandEnvironment } from "../support/worker-command-smoke-environment";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

test(
  "organization backfill closes resources and exits nonzero when PostgreSQL is unavailable",
  async () => {
    const result = await withOwnedTemporaryDirectory({
      prefix: "iam-organization-backfill-smoke-",
      cleanupTimeoutMs: 5_000,
      async run(temporaryDirectory) {
        return await runProcessCommandSmoke({
          label: "Organization search backfill unavailable storage",
          start() {
            return spawnOwnedProcessTree({
              executable: process.execPath,
              args: ["--no-env-file", "run", "src/commands/organization-search/organization-search-backfill.ts"],
              cwd: workerRoot,
              env: {
                ...createUnavailableStorageCommandEnvironment({
                  databaseUrl: "postgresql://iam:password@127.0.0.1:1/iam",
                  temporaryDirectory,
                }),
                IAM_WORKER_USER_PROFILE_CONCURRENCY: "invalid-unused",
                IAM_WORKER_BULL_BOARD_PATH: "invalid-unused",
              },
            });
          },
          completionTimeoutMs: 15_000,
          cleanupTimeoutMs: 5_000,
          expectedExitCode: 1,
        });
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Organization search command shutting down");
    expect(result.output).toContain("Organization search backfill failed; inspect structured logs.");
    expect(result.output).not.toContain("Organization search backfill registered;");
    expect(result.output).not.toContain("user profile rebuild job processed");
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);
