import type { ClientRuntimeSnapshotAdapter, ClientRuntimeSnapshotKind } from "@iam/api-core/client-runtime-snapshot";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClientRuntimeSnapshotModule } from "@iam/api-core/client-runtime-snapshot";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createWorkerRedisTestHarness,
  resolveWorkerRedisTestUrl,
} from "./redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerRedisTestHarness>>;

beforeEach(async () => {
  harness = await createWorkerRedisTestHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("Worker Client Runtime maintenance real Redis wiring", () => {
  test("rejects a test target that identifies the Worker runtime logical DB", () => {
    const testUrl = process.env.IAM_WORKER_TEST_REDIS_URL!;
    const parsed = new URL(testUrl);
    expect(() => resolveWorkerRedisTestUrl({
      IAM_WORKER_TEST_REDIS_URL: testUrl,
      IAM_WORKER_REDIS_HOST: parsed.hostname,
      IAM_WORKER_REDIS_PORT: parsed.port || "6379",
      IAM_WORKER_REDIS_DB: parsed.pathname.slice(1) || "0",
    })).toThrow("IAM_WORKER_TEST_REDIS_URL must not identify the Worker runtime Redis resource");
  });

  test("production command safely repeats repair and preserves non-owner data", async () => {
    const clientCode = harness.ownedClientCode("success");
    const sentinelKey = harness.ownedSentinelKey("non-owner-sentinel");
    let sourceVersion = 1;
    const loadCounts = new Map<ClientRuntimeSnapshotKind, number>();
    const runtime = createClientRuntimeSnapshotModule({
      redis: harness.writer,
      adapters: [
        createVersionedAdapter("oidc"),
        createVersionedAdapter("custom-sso"),
        createVersionedAdapter("traffic-gate"),
      ],
    });
    function createVersionedAdapter<K extends ClientRuntimeSnapshotKind>(kind: K) {
      return createAdapter(kind, async () => {
        loadCounts.set(kind, (loadCounts.get(kind) ?? 0) + 1);
        return { label: `${kind}-v${sourceVersion}` };
      });
    }
    const acquireAll = async () => await Promise.all([
      runtime.reader("oidc").acquire(clientCode),
      runtime.reader("custom-sso").acquire(clientCode),
      runtime.reader("traffic-gate").acquire(clientCode),
    ]);
    await harness.writer.set(sentinelKey, "must-remain");
    await acquireAll();

    sourceVersion = 2;
    const first = await runRepairProcess(clientCode);
    const firstReload = await acquireAll();
    sourceVersion = 3;
    const second = await runRepairProcess(clientCode);
    const secondReload = await acquireAll();
    const sentinel = await harness.observer.get(sentinelKey);

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(firstReload).toEqual([
      { kind: "present", value: { label: "oidc-v2" } },
      { kind: "present", value: { label: "custom-sso-v2" } },
      { kind: "present", value: { label: "traffic-gate-v2" } },
    ]);
    expect(secondReload).toEqual([
      { kind: "present", value: { label: "oidc-v3" } },
      { kind: "present", value: { label: "custom-sso-v3" } },
      { kind: "present", value: { label: "traffic-gate-v3" } },
    ]);
    expect(loadCounts).toEqual(new Map([
      ["oidc", 3],
      ["custom-sso", 3],
      ["traffic-gate", 3],
    ]));
    expect(sentinel).toBe("must-remain");
    for (const output of [first.output, second.output]) {
      expect(output).toContain("\"operation\":\"repair-client\"");
      expect(output).toContain("\"status\":\"completed\"");
      expect(output).toContain(`"clientCode":"${clientCode}"`);
      expect(output).not.toContain(process.env.IAM_WORKER_TEST_REDIS_URL!);
      expect(output).not.toContain("client-runtime-snapshot:v1");
      expect(output).not.toContain("epoch");
      expect(output).not.toContain("generation");
      expect(output).not.toContain("payload");
      expect(output).not.toContain("credential");
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("production full repair and a fresh verify process gate the complete owner inventory", async () => {
    expect(await harness.inventoryRestoreOwnerKeys()).toEqual([]);
    const fixtureId = randomUUID();
    const versionedKeys = Array.from({ length: 105 }, (_, index) =>
      harness.ownedRestoreFixtureKey(`client-runtime-snapshot:v1:{w69-${fixtureId}-${index}}:control`));
    const legacyKeys = [
      `oidc:client-runtime:${fixtureId}`,
      `custom-sso:client-runtime:${fixtureId}`,
      `custom-sso:client-runtime-generation:${fixtureId}`,
      `custom-sso:client-runtime-mutation:${fixtureId}`,
      `client:traffic-gate:${fixtureId}`,
      `client:traffic-gate-generation:${fixtureId}`,
      `client:traffic-gate-mutation:${fixtureId}`,
    ].map(key => harness.ownedRestoreFixtureKey(key));
    const sentinelKey = harness.ownedSentinelKey("restore-non-owner-sentinel");
    await harness.writer.mset(
      ...[...versionedKeys, ...legacyKeys, sentinelKey].flatMap(key => [key, "fixture"]),
    );

    const beforeRepair = await runVerifyProcess();
    const repair = await runFullRepairProcess();
    const afterRepair = await runVerifyProcess(0);
    const ownerValues = await harness.observer.mget(...versionedKeys, ...legacyKeys);
    const sentinel = await harness.observer.get(sentinelKey);

    expect(beforeRepair.exitCode).toBe(1);
    expect(beforeRepair.output).toContain("\"operation\":\"verify-all\"");
    expect(beforeRepair.output).toContain("\"status\":\"failed\"");
    expect(repair.exitCode).toBe(0);
    expect(repair.output).toContain("\"operation\":\"repair-all\"");
    expect(repair.output).toContain("\"status\":\"completed\"");
    expect(repair.output).toContain("\"unlinkBatches\":");
    expect(afterRepair.exitCode).toBe(0);
    expect(afterRepair.output).toContain(
      "{\"schemaVersion\":1,\"operation\":\"verify-all\",\"status\":\"completed\",\"matchingKeys\":0}",
    );
    expect(ownerValues).toEqual(
      Array.from({ length: ownerValues.length }).fill(null) as Array<string | null>,
    );
    expect(sentinel).toBe("fixture");
    for (const output of [beforeRepair.output, repair.output, afterRepair.output]) {
      expect(output).not.toContain(process.env.IAM_WORKER_TEST_REDIS_URL!);
      expect(output).not.toContain(fixtureId);
      expect(output).not.toContain("client-runtime-snapshot:v1");
      expect(output).not.toContain("payload");
      expect(output).not.toContain("credential");
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});

async function runRepairProcess(clientCode: string) {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-worker-client-runtime-repair-redis-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      return await runProcessCommandSmoke({
        label: "Worker Client Runtime targeted repair Redis command",
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "run",
              "src/commands/client-runtime-repair.ts",
              "--client-code",
              clientCode,
            ],
            cwd: workerRoot,
            env: harness.commandEnvironment(temporaryDirectory),
          });
        },
        completionTimeoutMs: 15_000,
        cleanupTimeoutMs: 5_000,
      });
    },
  });
}

async function runFullRepairProcess() {
  return await runRuntimeMaintenanceProcess(
    "src/commands/client-runtime-repair.ts",
    ["--all", "--protocol-traffic-stopped"],
    "Worker Client Runtime full restore repair Redis command",
  );
}

async function runVerifyProcess(expectedExitCode = 1) {
  return await runRuntimeMaintenanceProcess(
    "src/commands/client-runtime-verify.ts",
    ["--all", "--protocol-traffic-stopped"],
    "Worker Client Runtime full restore verify Redis command",
    expectedExitCode,
  );
}

async function runRuntimeMaintenanceProcess(
  entrypoint: string,
  args: string[],
  label: string,
  expectedExitCode?: number,
) {
  return await withOwnedTemporaryDirectory({
    prefix: "iam-worker-client-runtime-restore-redis-",
    cleanupTimeoutMs: 5_000,
    async run(temporaryDirectory) {
      return await runProcessCommandSmoke({
        label,
        start() {
          return spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", entrypoint, ...args],
            cwd: workerRoot,
            env: harness.commandEnvironment(temporaryDirectory),
          });
        },
        completionTimeoutMs: 30_000,
        cleanupTimeoutMs: 5_000,
        expectedExitCode,
      });
    },
  });
}

interface TestRuntime {
  readonly label: string;
}

function createAdapter<K extends ClientRuntimeSnapshotKind>(
  kind: K,
  load: () => Promise<TestRuntime>,
): ClientRuntimeSnapshotAdapter<K, TestRuntime> {
  return {
    kind,
    presentTtlMs: 60_000,
    absentTtlMs: 3_000,
    async load() {
      return { kind: "present", value: await load() };
    },
    codec: {
      encode: value => value,
      decode(payload) {
        if (typeof payload !== "object" || payload === null || typeof Reflect.get(payload, "label") !== "string")
          throw new Error("invalid test runtime");
        return { label: Reflect.get(payload, "label") as string };
      },
    },
  };
}
