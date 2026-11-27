import { expect, test } from "bun:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  captureProcessOutput,
  createProcessSmokeEnvironment,
  spawnOwnedProcessTree,
  withReadyProcess,
} from "@iam/test-support/process-smoke-harness";
import { useGatewayPostgresTestHarness } from "../support/postgres-test-harness";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const entryOptions = { label: "Gateway entry", temporaryDirectoryPrefix: "iam-gateway-entry-" };

const getDatabase = useGatewayPostgresTestHarness();

test("the Gateway process serves health and shuts down on SIGTERM", async () => {
  const database = getDatabase();
  let origin = "";
  let logs: ReturnType<typeof captureProcessOutput> | undefined;
  const outcome = await withReadyProcess({
    ...entryOptions,
    start(context) {
      origin = `http://${context.hostname}:${context.port}`;
      const child = spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["run", "--no-env-file", "src/main.ts"],
        cwd: packageRoot,
        env: createProcessSmokeEnvironment({
          source: process.env,
          temporaryDirectory: context.temporaryDirectory,
          overrides: {
            IAM_GATEWAY_DATABASE_URL: database.databaseUrl,
            IAM_GATEWAY_APISIX_ADMIN_URL: "http://127.0.0.1:1/apisix/admin",
            IAM_GATEWAY_APISIX_ADMIN_KEY: "synthetic-admin-key",
            IAM_GATEWAY_HOSTNAME: context.hostname,
            IAM_GATEWAY_PORT: String(context.port),
            IAM_GATEWAY_MAX_REQUEST_BYTES: "4096",
            NO_PROXY: "127.0.0.1,localhost",
            no_proxy: "127.0.0.1,localhost",
          },
        }),
      });
      const capture = captureProcessOutput(child, 32_768);
      logs = capture;
      return child;
    },
    childReadinessEvidence: "gateway_started",
    async probe(_context, signal) {
      const health = await fetch(`${origin}/health`, { signal });
      await health.arrayBuffer();
      return health.ok ? health.status : undefined;
    },
    async stop(child) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("Gateway exited before the graceful shutdown request");
      const closed = once(child, "close", { signal: AbortSignal.timeout(5_000) });
      child.kill("SIGTERM");
      const result = await closed;
      expect(result).toEqual([0, null]);
      expect(logs?.()).toContain('"event":"gateway_stopped"');
    },
  });
  expect(outcome).toBe(200);
  let stillListening = false;
  try {
    await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) });
    stillListening = true;
  } catch {}
  expect(stillListening).toBe(false);
}, 45_000);
