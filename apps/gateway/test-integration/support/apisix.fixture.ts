import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runWithOwnedTestResources } from "@iam/api-core/testing/external-test-resources";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  formatResourceFailure,
  managedServicePort,
  startManagedResources,
} from "../../../../scripts/test-resources/managed-resources.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const adminKey = "iam-gateway-integration-admin-key";

export type ApisixFixture = {
  adminUrl: string;
  adminKey: string;
  readonly signal: AbortSignal;
  close(): Promise<void>;
};

type ApisixFixtureOptions = { signal?: AbortSignal; deployment?: "dev" | "prod" };

async function waitForAdmin(adminUrl: string, adminKey: string, signal?: AbortSignal) {
  const deadline = performance.now() + 15_000;
  let failure: unknown;
  while (performance.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(`${adminUrl}/routes`, {
        headers: { "X-API-KEY": adminKey },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000),
      });
      await response.arrayBuffer();
      if (response.ok) return;
      failure = new Error(`APISIX Admin readiness returned HTTP ${response.status}`);
    } catch (error) {
      failure = error;
    }
    await delay(100, undefined, { signal });
  }
  throw new Error("APISIX Admin did not become ready", { cause: failure });
}

export async function createApisixFixture(options: ApisixFixtureOptions = {}): Promise<ApisixFixture> {
  options.signal?.throwIfAborted();
  const key = options.deployment ? "dev-local-admin-key-change-me" : adminKey;
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const onInterrupt = () => {
    process.exitCode ||= 130;
    controller.abort(new Error("APISIX fixture interrupted by SIGINT"));
  };
  const onTerminate = () => {
    process.exitCode ||= 143;
    controller.abort(new Error("APISIX fixture interrupted by SIGTERM"));
  };
  let run: Awaited<ReturnType<typeof createManagedResourceRun>> | undefined;
  let ready = false;
  let cleaning: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  const cleanup = () => {
    cleaning ??= (async () => {
      try {
        if (run) await finishManagedResourceRun(run, { cleanupTimeoutMs: 30_000 });
      } finally {
        process.off("SIGINT", onInterrupt);
        process.off("SIGTERM", onTerminate);
        signal.removeEventListener("abort", onAbort);
      }
    })();
    return cleaning;
  };
  const close = () => {
    closing ??= (async () => {
      const failures: unknown[] = [];
      try {
        await cleanup();
      } catch (failure) {
        failures.push(failure);
      }
      if (signal.aborted) failures.unshift(signal.reason);
      if (failures.length > 1) throw new AggregateError(failures, "APISIX fixture interrupted and cleanup failed");
      if (failures.length === 1) throw failures[0];
    })();
    return closing;
  };
  const onAbort = () => {
    // Startup must first stop and await its owned Compose process before destroying the project.
    if (ready) void close().catch((failure) => console.error(formatResourceFailure(failure)));
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    run = await createManagedResourceRun({
      root,
      composeFile: options.deployment
        ? `apps/gateway/test-integration/support/apisix.${options.deployment}.compose.yaml`
        : "apps/gateway/test-integration/support/apisix.compose.yaml",
      projectPrefix: "iam-gateway-apisix",
      services: ["apisix-etcd", "apisix"],
      registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
      removeLocalImages: true,
    });
    await startManagedResources(run, { signal, timeoutMs: 120_000 });
    const port = await managedServicePort(run, "apisix", 9180, { signal, timeoutMs: 10_000 });
    const adminUrl = `http://127.0.0.1:${port}/apisix/admin`;
    await waitForAdmin(adminUrl, key, signal);
    ready = true;
    signal.throwIfAborted();
    return { adminUrl, adminKey: key, signal, close };
  } catch (failure) {
    try {
      await cleanup();
    } catch (cleanupFailure) {
      throw new AggregateError([failure, cleanupFailure], "APISIX fixture initialization and cleanup failed");
    }
    throw failure;
  }
}

export async function withApisixFixture<T>(
  callback: (fixture: ApisixFixture) => Promise<T>,
  options: ApisixFixtureOptions = {},
): Promise<T> {
  return runWithOwnedTestResources(async (lifecycle) => {
    const fixture = await createApisixFixture(options);
    lifecycle.registerCleanup(() => fixture.close());
    return callback(fixture);
  });
}
