import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { createUnavailableStorageCommandEnvironment } from "../support/worker-command-smoke-environment";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
test("Worker refuses a non-default organization namespace before starting its runtime", async () => {
  const result = await withOwnedTemporaryDirectory({
    prefix: "iam-worker-namespace-",
    cleanupTimeoutMs: 5000,
    run: (temporaryDirectory) =>
      runProcessCommandSmoke({
        label: "Fixed Worker namespace",
        expectedExitCode: 1,
        completionTimeoutMs: 10_000,
        cleanupTimeoutMs: 5000,
        start: () =>
          spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", "src/index.ts"],
            cwd: workerRoot,
            env: {
              ...createUnavailableStorageCommandEnvironment({
                databaseUrl: "postgresql://iam:private-namespace-secret@127.0.0.1:1/iam",
                temporaryDirectory,
              }),
              IAM_WORKER_ORGANIZATION_DOCUMENT_QUEUE_PREFIX: "unsupported-private-prefix",
            },
          }),
      }),
  });
  expect(result.output).toContain("Organization Search queue prefix is fixed to iam");
  expect(result.output).not.toContain("private-namespace-secret");
  expect(result.output).not.toContain("worker started");
}, 20_000);
