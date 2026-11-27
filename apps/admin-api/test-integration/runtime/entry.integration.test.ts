import { expect, test } from "bun:test";
import { once } from "node:events";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { ProcessContext } from "@iam/test-support/process-smoke-harness";
import {
  createProcessSmokeEnvironment,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
  withReadyProcess,
} from "@iam/test-support/process-smoke-harness";

const adminApiRoot = fileURLToPath(new URL("../../", import.meta.url));
const entryOptions = {
  label: "Admin API entry",
  temporaryDirectoryPrefix: "iam-admin-api-entry-smoke-",
  hostname: "localhost",
};

function entryOrigin(context: ProcessContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(context: ProcessContext, nodeEnv: "development" | "production") {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: nodeEnv,
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: String(context.port),
      IAM_ADMIN_API_REDIS_URL: "redis://127.0.0.1:1/15",
      IAM_ADMIN_API_LOG_LEVEL: "silent",
      IAM_ADMIN_API_LOG_FORMAT: "json",
      IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: `sess:admin-api-entry-smoke:${context.port}:`,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

test(
  "Admin API binds its Bun listener and exits on SIGTERM",
  async () => {
    const result = await withReadyProcess({
      ...entryOptions,
      start: (context) =>
        spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "src/index.ts"],
          cwd: adminApiRoot,
          env: createEntryEnvironment(context, "production"),
        }),
      childReadinessEvidence: (context) => `server: ${entryOrigin(context)}`,
      async probe(context, signal) {
        const response = await fetch(`${entryOrigin(context)}/admin/doc`, { signal });
        await response.body?.cancel();
        return response.status;
      },
      async stop(child) {
        const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) });
        child.kill("SIGTERM");
        const [code, signal] = await exited;
        expect(code === 0 || code === 143 || signal === "SIGTERM").toBe(true);
      },
    });
    expect(result).toBe(403);
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);
