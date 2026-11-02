import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnavailableStorageCommandEnvironment } from "../support/ops-command-smoke-environment";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));

test(
  "organization backfill closes resources and exits nonzero when PostgreSQL is unavailable",
  async () => {
    const result = await withOwnedTemporaryDirectory({
      prefix: "iam-organization-backfill-smoke-",
      cleanupTimeoutMs: 5_000,
      async run(temporaryDirectory) {
        return await runProcessCommandSmoke({
          label: "Organization document backfill unavailable storage",
          start() {
            return spawnOwnedProcessTree({
              executable: process.execPath,
              args: ["--no-env-file", "run", "src/index.ts", "organization-document", "backfill"],
              cwd: opsRoot,
              env: {
                ...createUnavailableStorageCommandEnvironment({
                  databaseUrl: "postgresql://iam:password@127.0.0.1:1/iam",
                  temporaryDirectory,
                }),
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
    expect(result.output).toContain("Organization document command shutting down");
    expect(result.output).toContain("Organization document backfill failed; inspect structured logs.");
    expect(result.output).not.toContain("Organization document backfill registered;");
    expect(result.output).not.toContain("user document rebuild job processed");
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);
