import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnavailableStorageCommandEnvironment } from "../support/worker-command-smoke-environment";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
for (const entry of ["backfill", "repair", "worker"] as const) {
  test(`${entry} refuses a non-default organization queue namespace before constructing resources`, async () => {
    const result = await withOwnedTemporaryDirectory({
      prefix: "iam-organization-namespace-",
      cleanupTimeoutMs: 5000,
      run: (temporaryDirectory) =>
        runProcessCommandSmoke({
          label: "Fixed Organization Search namespace",
          start: () =>
            spawnOwnedProcessTree({
              executable: process.execPath,
              args: [
                "--no-env-file",
                "run",
                entry === "worker"
                  ? "src/index.ts"
                  : `src/commands/organization-search/organization-search-${entry}.ts`,
              ],
              cwd: workerRoot,
              env: {
                ...createUnavailableStorageCommandEnvironment({
                  databaseUrl: "postgres://iam:namespace-secret-must-not-log@127.0.0.1:1/iam",
                  temporaryDirectory,
                }),
                IAM_WORKER_ORGANIZATION_SEARCH_QUEUE_PREFIX: "unsupported-private-prefix",
              },
            }),
          completionTimeoutMs: 10_000,
          cleanupTimeoutMs: 5000,
          expectedExitCode: 1,
        }),
    });
    expect(result.output).not.toContain("namespace-secret-must-not-log");
    expect(result.output).not.toContain("Organization search command shutting down");
    expect(result.output).not.toContain("worker started");
    if (entry === "worker") expect(result.output).toContain("Organization Search queue prefix is fixed to iam");
    else expect(result.output).toContain(`Organization search ${entry} failed;`);
  }, 15_000);
}
