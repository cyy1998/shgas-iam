import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnavailableStorageCommandEnvironment } from "./worker-command-smoke-environment";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
for (const invalid of [false, true]) {
  test(invalid
    ? "repair rejects invalid scope before constructing resources"
    : "repair fails closed and closes resources when PostgreSQL is unavailable", async () => {
    const result = await withOwnedTemporaryDirectory({
      prefix: "iam-organization-repair-process-",
      cleanupTimeoutMs: 5000,
      run: (temporaryDirectory) =>
        runProcessCommandSmoke({
          label: "Organization search repair unavailable dependencies",
          completionTimeoutMs: 15_000,
          cleanupTimeoutMs: 5000,
          expectedExitCode: 1,
          start: () =>
            spawnOwnedProcessTree({
              executable: process.execPath,
              cwd: workerRoot,
              args: [
                "--no-env-file",
                "run",
                "src/commands/organization-search/organization-search-repair.ts",
                ...(invalid ? ["--limit", "0"] : []),
              ],
              env: createUnavailableStorageCommandEnvironment({
                databaseUrl: "postgres://iam:repair-secret-must-not-log@127.0.0.1:1/iam",
                temporaryDirectory,
              }),
            }),
        }),
    });
    expect(result.output).toContain("Organization search repair failed;");
    expect(result.output).not.toContain("repair-secret-must-not-log");
    expect(result.output).not.toContain("Organization search repair wakeups finished;");
    if (invalid) expect(result.output).not.toContain("Organization search command shutting down");
    else expect(result.output).toContain("Organization search command shutting down");
  }, 25_000);
}
