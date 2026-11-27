import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OwnedTestResourceLifecycle } from "@iam/test-support/external-test-resources";
import {
  allocateLoopbackPort,
  createProcessSmokeEnvironment,
  spawnOwnedProcessTree,
  startProcess,
  waitForReadiness,
} from "@iam/test-support/process-smoke-harness";
import { bounded } from "./lifecycle-sync.fixture";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
export type GatewayApplyBody = { scope: string; yaml: string; dryRun?: boolean; prune?: boolean };

export async function createGatewayProcessFixture(input: {
  databaseUrl: string;
  adminUrl: string;
  adminKey: string;
  operationTimeoutMs?: number;
  requestTimeoutMs?: number;
  lifecycle: OwnedTestResourceLifecycle;
}) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "iam-gateway-process-"));
  input.lifecycle.registerCleanup(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const port = await allocateLoopbackPort("127.0.0.1");
  const origin = `http://127.0.0.1:${port}`;
  const child = spawnOwnedProcessTree({
    executable: process.execPath,
    args: ["run", "--no-env-file", "src/main.ts"],
    cwd: packageRoot,
    env: createProcessSmokeEnvironment({
      source: process.env,
      temporaryDirectory,
      overrides: {
        IAM_GATEWAY_DATABASE_URL: input.databaseUrl,
        IAM_GATEWAY_APISIX_ADMIN_URL: input.adminUrl,
        IAM_GATEWAY_APISIX_ADMIN_KEY: input.adminKey,
        IAM_GATEWAY_HOSTNAME: "127.0.0.1",
        IAM_GATEWAY_PORT: String(port),
        IAM_GATEWAY_OPERATION_TIMEOUT_MS: String(input.operationTimeoutMs ?? 15_000),
        IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS: String(input.requestTimeoutMs ?? 10_000),
        IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS: String((input.operationTimeoutMs ?? 15_000) + 5000),
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
    }),
  });
  const running = startProcess(child);
  input.lifecycle.registerCleanup(running.stop);
  let ready = false;
  let shutdownSent = false;
  let closing: Promise<void> | undefined;
  const fixture = {
    origin,
    port,
    child,
    async apply(body: GatewayApplyBody) {
      const response = await fetch(`${origin}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "lifecycle-client-key" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      return { status: response.status, body: await response.json() };
    },
    waitForEvent(event: string) {
      const evidence = `"event":"${event}"`;
      if (running.output().includes(evidence)) return Promise.resolve();
      return waitForReadiness(running, async () => true, evidence, 10_000).then(() => {});
    },
    shutdown() {
      if (!shutdownSent) {
        if (!child.kill("SIGTERM")) throw new Error(`Could not signal Gateway\n${running.output()}`);
        shutdownSent = true;
      }
    },
    waitForExit() {
      return bounded(running.completed, "Gateway normal exit", 10_000).then(({ outcome, cleanupFailure }) => {
        if (cleanupFailure) throw cleanupFailure;
        if (!outcome)
          throw new Error(`Gateway exited without status
${running.output()}`);
        return { code: outcome.exitCode, signal: outcome.signal };
      });
    },
    close() {
      closing ??= (async () => {
        try {
          if (ready && child.exitCode === null && child.signalCode === null) {
            fixture.shutdown();
            await fixture.waitForExit();
          }
        } finally {
          await running.stop();
        }
      })();
      return closing;
    },
  };
  try {
    await waitForReadiness(
      running,
      async (signal) => {
        const health = await fetch(`${origin}/health`, { signal });
        await health.arrayBuffer();
        return health.ok ? true : undefined;
      },
      '"event":"gateway_started"',
    );
    ready = true;
    return fixture;
  } catch (error) {
    try {
      await fixture.close();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Gateway initialization and cleanup failed");
    }
    throw error;
  }
}

export type GatewayProcessFixture = Awaited<ReturnType<typeof createGatewayProcessFixture>>;
