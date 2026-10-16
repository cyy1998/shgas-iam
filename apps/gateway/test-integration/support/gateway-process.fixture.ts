import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { spawnOwnedProcessTree } from "@iam/api-core/process";
import type { OwnedTestResourceLifecycle } from "@iam/api-core/testing/external-test-resources";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeEnvironment,
  terminateProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
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
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "iam-gateway-process-"));
  input.lifecycle.registerCleanup(async () => {
    const resolved = path.resolve(temporaryDirectory);
    if (
      !resolved.startsWith(path.resolve(tmpdir()) + path.sep) ||
      !path.basename(resolved).startsWith("iam-gateway-process-")
    )
      throw new Error("Unsafe test-owned temporary directory");
    await rm(resolved, { recursive: true, force: true });
  });
  const reservation = createServer();
  input.lifecycle.registerCleanup(async () => {
    if (reservation.listening)
      await new Promise<void>((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())));
  });
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("Gateway port reservation failed");
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())));
  const origin = `http://127.0.0.1:${port}`;
  const trigger = path.join(temporaryDirectory, "shutdown");
  const child = spawnOwnedProcessTree({
    executable: process.execPath,
    args: ["run", "--no-env-file", "--preload", "./test-integration/runtime/shutdown.fixture.ts", "src/main.ts"],
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
        IAM_GATEWAY_TEST_SHUTDOWN_PATH: trigger,
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
    }),
  });
  input.lifecycle.registerCleanup(() => terminateProcessTree(child, { timeoutMs: 5000 }));
  const capture = createBoundedProcessLogCapture(child, { maxBytes: 32_768 });
  input.lifecycle.registerCleanup(() => capture.dispose());
  let ended = false;
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => {
      ended = true;
      resolve({ code, signal });
    });
    child.once("error", () => {
      ended = true;
      resolve({ code: -1, signal: null });
    });
  });
  const events = new Map<string, ReturnType<typeof Promise.withResolvers<void>>>();
  for (const event of ["gateway_started", "gateway_stopping", "gateway_stopped"])
    events.set(event, Promise.withResolvers<void>());
  let tail = "";
  const onOutput = (chunk: Buffer) => {
    tail = (tail + chunk.toString("utf8")).slice(-4096);
    for (const [event, notification] of events) if (tail.includes(`"event":"${event}"`)) notification.resolve();
  };
  child.stdout.on("data", onOutput);
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
      const notification = events.get(event);
      if (!notification) throw new Error("Unknown lifecycle event");
      return bounded(notification.promise, event);
    },
    async shutdown() {
      if (!shutdownSent) {
        shutdownSent = true;
        await writeFile(trigger, "shutdown", "utf8");
      }
    },
    waitForExit() {
      return bounded(exited, "Gateway normal exit", 10_000);
    },
    close() {
      closing ??= (async () => {
        const failures: unknown[] = [];
        try {
          if (child.exitCode === null && child.signalCode === null) {
            await fixture.shutdown();
            await fixture.waitForExit();
          }
        } catch (error) {
          failures.push(error);
        } finally {
          try {
            await terminateProcessTree(child, { timeoutMs: 5000 });
          } catch (error) {
            failures.push(error);
          }
          capture.dispose();
          child.stdout.off("data", onOutput);
        }
        if (failures.length) throw new AggregateError(failures, "Gateway process cleanup failed");
      })();
      return closing;
    },
  };
  try {
    const deadline = AbortSignal.timeout(10_000);
    while (true) {
      deadline.throwIfAborted();
      if (ended) throw new Error(`Gateway exited before readiness: ${capture.snapshot()}`);
      try {
        const health = await fetch(`${origin}/health`, { signal: deadline });
        await health.arrayBuffer();
        if (health.status === 200) break;
      } catch {
        deadline.throwIfAborted();
      }
      await delay(50, undefined, { signal: deadline });
    }
    await fixture.waitForEvent("gateway_started");
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
