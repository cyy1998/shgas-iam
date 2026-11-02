import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnavailableStorageCommandEnvironment } from "../support/ops-command-smoke-environment";

const opsRoot = fileURLToPath(new URL("../../", import.meta.url));
for (const args of [["--deadline-ms", "0"], ["--schema-version", "1"], ["--batch-size", "1"], []]) {
  test(args.length
    ? `verify refuses unsupported configuration ${args[0]} before opening resources`
    : "verify closes its PG-only resources when the database is unavailable", async () => {
    const result = await withOwnedTemporaryDirectory({
      prefix: "iam-organization-verify-process-",
      cleanupTimeoutMs: 5000,
      run: (temporaryDirectory) =>
        runProcessCommandSmoke({
          label: "Organization Search verify unavailable resources",
          start: () =>
            spawnOwnedProcessTree({
              executable: process.execPath,
              args: ["--no-env-file", "run", "src/index.ts", "organization-document", "verify", ...args],
              cwd: opsRoot,
              env: createUnavailableStorageCommandEnvironment({
                databaseUrl: "postgres://iam:verify-secret-must-not-log@127.0.0.1:1/iam",
                temporaryDirectory,
              }),
            }),
          completionTimeoutMs: 15_000,
          cleanupTimeoutMs: 5000,
          expectedExitCode: 1,
        }),
    });
    expect(result.output).toContain("Organization document verification failed;");
    expect(result.output).not.toContain("verify-secret-must-not-log");
    expect(result.output).not.toContain("Organization document full verification completed");
    if (args.length) expect(result.output).not.toContain("Organization document verification command shutting down");
    else expect(result.output).toContain("Organization document verification command shutting down");
  }, 20_000);
}
