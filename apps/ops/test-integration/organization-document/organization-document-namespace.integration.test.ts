import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnavailableStorageCommandEnvironment } from "../support/ops-command-smoke-environment";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));
for (const entry of ["backfill", "repair"] as const) {
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
              args: ["--no-env-file", "run", "src/index.ts", "organization-document", entry],
              cwd: opsRoot,
              env: {
                ...createUnavailableStorageCommandEnvironment({
                  databaseUrl: "postgres://iam:namespace-secret-must-not-log@127.0.0.1:1/iam",
                  temporaryDirectory,
                }),
                IAM_OPS_ORGANIZATION_DOCUMENT_QUEUE_PREFIX: "unsupported-private-prefix",
              },
            }),
          completionTimeoutMs: 10_000,
          cleanupTimeoutMs: 5000,
          expectedExitCode: 1,
        }),
    });
    expect(result.output).not.toContain("namespace-secret-must-not-log");
    expect(result.output).not.toContain("Organization document command shutting down");
    expect(result.output).not.toContain("worker started");
    expect(result.output).toContain(`Organization document ${entry} failed;`);
  }, 15_000);
}
