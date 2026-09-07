import type {
  ClientRuntimeSnapshotAdapter,
  ClientRuntimeSnapshotKind,
} from "@iam/api-core/client-runtime-snapshot";
import type { Redis as RedisType } from "ioredis";
import { randomUUID } from "node:crypto";
import {
  ClientRuntimeSnapshotUnavailableError,
  createClientRuntimeSnapshotMaintenance,
  createClientRuntimeSnapshotModule,
  createClientRuntimeSnapshotRestoreRepair,
  createClientRuntimeSnapshotVerifier,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientRuntimeRestoreInventoryReader,
  createClientRuntimeRestoreInventoryRepairer,
} from "@iam/api-core/client-runtime-snapshot/redis-maintenance";
import {
  clientRuntimeSnapshotTestingKeys,
  createClientRuntimeRestoreInventoryRepairerForTesting,
} from "@iam/api-core/client-runtime-snapshot/testing";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import Redis from "ioredis";

interface TestRuntime {
  readonly label: string;
}

const PAYLOAD_MISMATCH_CASES = [
  {
    label: "kind mismatch",
    mutate(envelope: Record<string, unknown>) {
      envelope.kind = "custom-sso";
    },
  },
  {
    label: "client mismatch",
    mutate(envelope: Record<string, unknown>) {
      envelope.clientCode = "wrong-client";
    },
  },
  {
    label: "control mismatch",
    mutate(envelope: Record<string, unknown>) {
      envelope.control = { epoch: "wrong-epoch", generation: "0" };
    },
  },
  {
    label: "codec rejection",
    mutate(envelope: Record<string, unknown>) {
      envelope.snapshot = { kind: "present", value: { label: 7 } };
    },
  },
] as const;

const TEST_REDIS_URL_ENV = "IAM_API_CORE_TEST_REDIS_URL";
let writerRedis: RedisType;
let observerRedis: RedisType;
let cleanupRedis: RedisType;
let testRedisUrl: string;
let ownedClientCodes: string[] = [];
const sharedRedisClients: RedisType[] = [];

beforeAll(async () => {
  testRedisUrl = requireDedicatedRedisTestUrl();
  writerRedis = createRedisClient(testRedisUrl);
  observerRedis = createRedisClient(testRedisUrl);
  cleanupRedis = createRedisClient(testRedisUrl);
  sharedRedisClients.push(writerRedis, observerRedis, cleanupRedis);
  await Promise.all([
    connectRedis(writerRedis),
    connectRedis(observerRedis),
    connectRedis(cleanupRedis),
  ]);
});

afterEach(async () => {
  for (const clientCode of ownedClientCodes)
    await deleteClientRuntimeKeys(cleanupRedis, clientCode);
  ownedClientCodes = [];
});

afterAll(async () => {
  await Promise.all(sharedRedisClients.map(client => client.quit()));
});

describe("Client Runtime Snapshot real Redis contract", () => {
  test("full restore repair clears current inventory, preserves legacy keys, restarts after failure, and verifies independently", async () => {
    const restoreWriter = createRedisClient(testRedisUrl);
    const restoreObserver = createRedisClient(testRedisUrl);
    const restoreCleanup = createRedisClient(testRedisUrl);
    const fixtureId = randomUUID();
    const versionedKeys = Array.from({ length: 205 }, (_, index) =>
      `client-runtime-snapshot:v1:{restore-${fixtureId}-${index}}:control`);
    const legacyKeys = [
      `oidc:client-runtime:${fixtureId}`,
      `custom-sso:client-runtime:${fixtureId}`,
      `custom-sso:client-runtime-generation:${fixtureId}`,
      `custom-sso:client-runtime-mutation:${fixtureId}`,
      `client:traffic-gate:${fixtureId}`,
      `client:traffic-gate-generation:${fixtureId}`,
      `client:traffic-gate-mutation:${fixtureId}`,
    ];
    const sentinelKey = `iam:test:client-runtime-restore:${fixtureId}:sentinel`;
    let testFailure: { readonly error: unknown } | undefined;
    try {
      await Promise.all([
        connectRedis(restoreWriter),
        connectRedis(restoreObserver),
        connectRedis(restoreCleanup),
      ]);
      const emptyBeforeSeed = await createClientRuntimeSnapshotVerifier({
        inventory: createClientRuntimeRestoreInventoryReader(restoreObserver),
      }).verifyAllAfterRedisRestore({ protocolTrafficStopped: true });
      expect(emptyBeforeSeed).toEqual({ matchingKeys: 0 });
      await restoreWriter.mset(
        Object.fromEntries(
          [...versionedKeys, ...legacyKeys, sentinelKey].map(key => [key, "fixture"]),
        ),
      );

      let unlinkCalls = 0;
      const partialMaintenance = createClientRuntimeSnapshotRestoreRepair({
        inventory: createClientRuntimeRestoreInventoryRepairerForTesting({
          scan: (...args) => restoreWriter.scan(...args),
          async unlink(...keys) {
            unlinkCalls += 1;
            if (unlinkCalls === 2)
              throw new Error("partial-unlink-secret");
            return await restoreWriter.unlink(...keys);
          },
        }, 2),
      });

      let partialFailure: unknown;
      try {
        await partialMaintenance.repairAllAfterRedisRestore({
          protocolTrafficStopped: true,
        });
      }
      catch (error) {
        partialFailure = error;
      }
      expect(partialFailure).toMatchObject({
        name: "ClientRuntimeRepairFailedError",
        message: "Client Runtime repair failed",
      });

      const independentVerifierBeforeRerun = createClientRuntimeSnapshotVerifier({
        inventory: createClientRuntimeRestoreInventoryReader(restoreObserver),
      });
      const incomplete = await independentVerifierBeforeRerun.verifyAllAfterRedisRestore({
        protocolTrafficStopped: true,
      });
      expect(incomplete.matchingKeys > 0).toBe(true);
      const sentinelBeforeRerun = await restoreObserver.get(sentinelKey);
      expect(sentinelBeforeRerun).toBe("fixture");

      const repair = createClientRuntimeSnapshotRestoreRepair({
        inventory: createClientRuntimeRestoreInventoryRepairer(restoreWriter),
      });
      const completed = await repair.repairAllAfterRedisRestore({
        protocolTrafficStopped: true,
      });
      const independentVerifier = createClientRuntimeSnapshotVerifier({
        inventory: createClientRuntimeRestoreInventoryReader(restoreObserver),
      });
      const verified = await independentVerifier.verifyAllAfterRedisRestore({
        protocolTrafficStopped: true,
      });

      expect(completed.unlinkedKeys > 0).toBe(true);
      expect(completed.unlinkBatches > 1).toBe(true);
      expect(verified).toEqual({ matchingKeys: 0 });
      const currentValues = await restoreObserver.mget(...versionedKeys);
      const legacyValues = await restoreObserver.mget(...legacyKeys);
      const sentinelAfterRepair = await restoreObserver.get(sentinelKey);
      expect(currentValues).toEqual(versionedKeys.map(() => null));
      expect(legacyValues).toEqual(legacyKeys.map(() => "fixture"));
      expect(sentinelAfterRepair).toBe("fixture");
    }
    catch (error) {
      testFailure = { error };
    }

    const cleanupFailures: unknown[] = [];
    try {
      await restoreCleanup.unlink(...versionedKeys, ...legacyKeys, sentinelKey);
    }
    catch (error) {
      cleanupFailures.push(error);
    }
    try {
      const emptyAfterCleanup = await createClientRuntimeSnapshotVerifier({
        inventory: createClientRuntimeRestoreInventoryReader(restoreObserver),
      }).verifyAllAfterRedisRestore({ protocolTrafficStopped: true });
      expect(emptyAfterCleanup).toEqual({ matchingKeys: 0 });
    }
    catch (error) {
      cleanupFailures.push(error);
    }
    const closeResults = await Promise.allSettled([
      restoreWriter.quit(),
      restoreObserver.quit(),
      restoreCleanup.quit(),
    ]);
    for (const result of closeResults) {
      if (result.status === "rejected")
        cleanupFailures.push(result.reason);
    }
    if (testFailure !== undefined && cleanupFailures.length > 0) {
      throw new AggregateError(
        [testFailure.error, ...cleanupFailures],
        "Client Runtime restore contract and cleanup failed",
      );
    }
    if (testFailure !== undefined)
      throw testFailure.error;
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        cleanupFailures,
        "Client Runtime restore contract cleanup failed",
      );
    }
  });

  test("targeted repair atomically advances control and removes all payloads on every run", async () => {
    const clientCode = ownedClientCode("targeted-repair");
    const keys = clientRuntimeSnapshotTestingKeys(clientCode);
    let sourceVersion = 1;
    const loadCounts = new Map<ClientRuntimeSnapshotKind, number>();
    const runtime = createClientRuntimeSnapshotModule({
      redis: writerRedis,
      adapters: (["oidc", "custom-sso", "traffic-gate"] as const).map(kind => createAdapter(kind, async () => {
        loadCounts.set(kind, (loadCounts.get(kind) ?? 0) + 1);
        return { label: `${kind}-v${sourceVersion}` };
      })),
      createEpoch: () => "runtime-epoch",
    });
    const observations: unknown[] = [];
    const maintenance = createClientRuntimeSnapshotMaintenance({
      redis: observerRedis,
      createEpoch: () => "repair-epoch",
      observability: { record: observation => observations.push(observation) },
    });
    await Promise.all([
      runtime.reader("oidc").acquire(clientCode),
      runtime.reader("custom-sso").acquire(clientCode),
      runtime.reader("traffic-gate").acquire(clientCode),
    ]);

    await maintenance.repairClient(clientCode);
    const firstRepair = await Promise.all([
      observerRedis.hget(keys.control, "generation"),
      ...keys.payloads.map(key => observerRedis.get(key)),
    ]);
    await maintenance.repairClient(clientCode);
    const secondRepair = await Promise.all([
      observerRedis.hget(keys.control, "generation"),
      ...keys.payloads.map(key => observerRedis.get(key)),
    ]);
    sourceVersion = 2;
    const repaired = await Promise.all([
      runtime.reader("oidc").acquire(clientCode),
      runtime.reader("custom-sso").acquire(clientCode),
      runtime.reader("traffic-gate").acquire(clientCode),
    ]);

    expect(firstRepair).toEqual(["1", null, null, null]);
    expect(secondRepair).toEqual(["2", null, null, null]);
    expect(repaired).toEqual([
      { kind: "present", value: { label: "oidc-v2" } },
      { kind: "present", value: { label: "custom-sso-v2" } },
      { kind: "present", value: { label: "traffic-gate-v2" } },
    ]);
    expect(loadCounts).toEqual(new Map([
      ["oidc", 2],
      ["custom-sso", 2],
      ["traffic-gate", 2],
    ]));
    expect(observations).toEqual([
      expect.objectContaining({
        operation: "repair-client",
        outcome: "completed",
        clientCode,
      }),
      expect.objectContaining({
        operation: "repair-client",
        outcome: "completed",
        clientCode,
      }),
    ]);
  });

  test("controlled canary mutation makes all three Readers reacquire post-mutation facts", async () => {
    const clientCode = ownedClientCode("canary-mutation");
    let sourceRevision = "before";
    const events: string[] = [];
    const loadCounts = new Map<ClientRuntimeSnapshotKind, number>();
    const runtime = createClientRuntimeSnapshotModule({
      redis: writerRedis,
      adapters: (["oidc", "custom-sso", "traffic-gate"] as const).map(kind => createAdapter(kind, async () => {
        loadCounts.set(kind, (loadCounts.get(kind) ?? 0) + 1);
        events.push(`load:${kind}:${sourceRevision}`);
        return { label: `${kind}-${sourceRevision}` };
      })),
      createEpoch: () => "canary-runtime-epoch",
    });

    const beforeMutation = [
      await runtime.reader("oidc").acquire(clientCode),
      await runtime.reader("custom-sso").acquire(clientCode),
      await runtime.reader("traffic-gate").acquire(clientCode),
    ];
    sourceRevision = "after";
    events.push("mutation:committed");
    await runtime.invalidateClient(clientCode);
    events.push("invalidation:completed");
    const afterMutation = [
      await runtime.reader("oidc").acquire(clientCode),
      await runtime.reader("custom-sso").acquire(clientCode),
      await runtime.reader("traffic-gate").acquire(clientCode),
    ];

    expect(beforeMutation).toEqual([
      { kind: "present", value: { label: "oidc-before" } },
      { kind: "present", value: { label: "custom-sso-before" } },
      { kind: "present", value: { label: "traffic-gate-before" } },
    ]);
    expect(afterMutation).toEqual([
      { kind: "present", value: { label: "oidc-after" } },
      { kind: "present", value: { label: "custom-sso-after" } },
      { kind: "present", value: { label: "traffic-gate-after" } },
    ]);
    expect(loadCounts).toEqual(new Map([
      ["oidc", 2],
      ["custom-sso", 2],
      ["traffic-gate", 2],
    ]));
    expect(events).toEqual([
      "load:oidc:before",
      "load:custom-sso:before",
      "load:traffic-gate:before",
      "mutation:committed",
      "invalidation:completed",
      "load:oidc:after",
      "load:custom-sso:after",
      "load:traffic-gate:after",
    ]);
  });

  test("late source reads cannot publish or serve after concurrent invalidation", async () => {
    const clientCode = ownedClientCode("late-refill");
    let sourceValue = "runtime-v1";
    let releaseOldRead!: () => void;
    let markOldReadStarted!: () => void;
    const oldReadStarted = new Promise<void>((resolve) => {
      markOldReadStarted = resolve;
    });
    const oldReadGate = new Promise<void>((resolve) => {
      releaseOldRead = resolve;
    });
    const writerLoad = mock(async () => {
      const captured = sourceValue;
      markOldReadStarted();
      await oldReadGate;
      return { label: captured };
    });
    const observerLoad = mock(async () => ({ label: sourceValue }));
    const writer = createClientRuntimeSnapshotModule({
      redis: writerRedis,
      adapters: [createAdapter("oidc", writerLoad)],
      createEpoch: () => "epoch-writer",
    });
    const observer = createClientRuntimeSnapshotModule({
      redis: observerRedis,
      adapters: [createAdapter("oidc", observerLoad)],
      createEpoch: () => "epoch-observer",
    });
    const writerReader = writer.reader("oidc");
    const oldRead = writerReader.acquire(clientCode);
    const joinedOldRead = writerReader.acquire(clientCode);
    await oldReadStarted;

    sourceValue = "runtime-v2";
    await observer.invalidateClient(clientCode);
    const current = await observer.reader("oidc").acquire(clientCode);
    releaseOldRead();
    const [first, joined] = await Promise.all([oldRead, joinedOldRead]);
    const reread = await observer.reader("oidc").acquire(clientCode);

    expect(current).toEqual({ kind: "present", value: { label: "runtime-v2" } });
    expect(first).toEqual(current);
    expect(joined).toEqual(current);
    expect(reread).toEqual(current);
    expect(writerLoad).toHaveBeenCalledTimes(1);
    expect(observerLoad).toHaveBeenCalledTimes(1);
  });

  test("corrupt control bootstraps one winner and removes all three residual payloads", async () => {
    const clientCode = ownedClientCode("bootstrap");
    const keys = clientRuntimeSnapshotTestingKeys(clientCode);
    await writerRedis.set(keys.control, "corrupt-control");
    await Promise.all(keys.payloads.map(key => writerRedis.set(key, "residual-payload")));
    const observations: unknown[] = [];
    let oidcLoads = 0;
    const runtime = createClientRuntimeSnapshotModule({
      redis: writerRedis,
      adapters: [
        createAdapter("oidc", async () => ({ label: `oidc-${++oidcLoads}` })),
        createAdapter("custom-sso", async () => ({ label: "custom-sso" })),
        createAdapter("traffic-gate", async () => ({ label: "traffic-gate" })),
      ],
      createEpoch: () => randomUUID(),
      observability: { record: observation => observations.push(observation) },
    });

    const [oidc, customSso] = await Promise.all([
      runtime.reader("oidc").acquire(clientCode),
      runtime.reader("custom-sso").acquire(clientCode),
    ]);
    const control = await observerRedis.hgetall(keys.control);
    const controlTtl = await observerRedis.pttl(keys.control);
    const trafficGatePayload = await observerRedis.get(keys.payloads[2]);

    expect(oidc).toEqual({ kind: "present", value: { label: "oidc-1" } });
    expect(customSso).toEqual({ kind: "present", value: { label: "custom-sso" } });
    expect(control).toMatchObject({ schemaVersion: "1", generation: "0" });
    expect(control.epoch).toBeString();
    expect(controlTtl).toBe(-1);
    expect(trafficGatePayload).toBeNull();
    expect(observations.filter(observation => (
      observation as { operation?: string }
    ).operation === "bootstrap")).toHaveLength(1);

    expect(oidcLoads).toBe(1);
  });

  test("reloads and repairs an expired payload", async () => {
    const clientCode = ownedClientCode("expired-payload");
    const keys = clientRuntimeSnapshotTestingKeys(clientCode);
    let loads = 0;
    const runtime = createClientRuntimeSnapshotModule({
      redis: writerRedis,
      adapters: [createAdapter("oidc", async () => ({ label: `runtime-${++loads}` }))],
      createEpoch: () => "epoch-expiry",
    });
    const reader = runtime.reader("oidc");
    const initial = await reader.acquire(clientCode);
    await writerRedis.pexpire(keys.payloads[0], 1);
    const expiredPayload = await waitForMissingKey(observerRedis, keys.payloads[0]);
    const repaired = await reader.acquire(clientCode);
    const published = await observerRedis.get(keys.payloads[0]);

    expect(initial).toEqual({ kind: "present", value: { label: "runtime-1" } });
    expect(expiredPayload).toBeNull();
    expect(repaired).toEqual({ kind: "present", value: { label: "runtime-2" } });
    expect(loads).toBe(2);
    expect(published).toContain("runtime-2");
    expect(published).not.toContain("runtime-1");
  });

  for (const mismatch of PAYLOAD_MISMATCH_CASES) {
    test(`reloads and repairs a payload with ${mismatch.label}`, async () => {
      const clientCode = ownedClientCode(mismatch.label.replaceAll(" ", "-"));
      const keys = clientRuntimeSnapshotTestingKeys(clientCode);
      let loads = 0;
      const runtime = createClientRuntimeSnapshotModule({
        redis: writerRedis,
        adapters: [createAdapter("oidc", async () => ({ label: `runtime-${++loads}` }))],
        createEpoch: () => `epoch-${mismatch.label}`,
      });
      const reader = runtime.reader("oidc");
      const initial = await reader.acquire(clientCode);
      const rawPayload = await observerRedis.get(keys.payloads[0]);
      if (rawPayload === null)
        throw new Error("expected initial OIDC Runtime Snapshot payload");
      const envelope = JSON.parse(rawPayload) as Record<string, unknown>;
      mismatch.mutate(envelope);
      await writerRedis.set(keys.payloads[0], JSON.stringify(envelope), "PX", 60_000);
      const repaired = await reader.acquire(clientCode);
      const published = await observerRedis.get(keys.payloads[0]);

      expect(initial).toEqual({ kind: "present", value: { label: "runtime-1" } });
      expect(repaired).toEqual({ kind: "present", value: { label: "runtime-2" } });
      expect(loads).toBe(2);
      expect(published).toContain("runtime-2");
      expect(published).not.toContain("runtime-1");
    });
  }

  test("retries one control conflict but returns unavailable after a second conflict", async () => {
    const onceClientCode = ownedClientCode("conflict-once");
    let onceInvalidated = false;
    const onceRedis = withBeforePublish(writerRedis, async () => {
      if (onceInvalidated)
        return;
      onceInvalidated = true;
      await createInvalidator(observerRedis).invalidateClient(onceClientCode);
    });
    let onceLoads = 0;
    const onceRuntime = createClientRuntimeSnapshotModule({
      redis: onceRedis,
      adapters: [createAdapter("oidc", async () => ({ label: `runtime-${++onceLoads}` }))],
      createEpoch: () => "epoch-once",
    });

    const onceResult = await onceRuntime.reader("oidc").acquire(onceClientCode);

    expect(onceResult).toEqual({ kind: "present", value: { label: "runtime-2" } });
    expect(onceLoads).toBe(2);

    const twiceClientCode = ownedClientCode("conflict-twice");
    const twiceRedis = withBeforePublish(writerRedis, async () => {
      await createInvalidator(observerRedis).invalidateClient(twiceClientCode);
    });
    const twiceLoad = mock(async () => ({ label: "never-published" }));
    const twiceRuntime = createClientRuntimeSnapshotModule({
      redis: twiceRedis,
      adapters: [createAdapter("oidc", twiceLoad)],
      createEpoch: () => "epoch-twice",
    });
    let failure: unknown;
    try {
      await twiceRuntime.reader("oidc").acquire(twiceClientCode);
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ClientRuntimeSnapshotUnavailableError);
    expect(twiceLoad).toHaveBeenCalledTimes(2);
  });

  test("epoch changes reject a publish even when generation repeats", async () => {
    const clientCode = ownedClientCode("epoch-aba");
    const keys = clientRuntimeSnapshotTestingKeys(clientCode);
    let replaced = false;
    const hookedRedis = withBeforePublish(writerRedis, async () => {
      if (replaced)
        return;
      replaced = true;
      const generation = await observerRedis.hget(keys.control, "generation");
      if (generation === null)
        throw new Error("expected control before ABA replacement");
      await observerRedis.hset(keys.control, "epoch", "replacement-epoch", "generation", generation);
    });
    let loads = 0;
    const runtime = createClientRuntimeSnapshotModule({
      redis: hookedRedis,
      adapters: [createAdapter("oidc", async () => ({ label: `runtime-${++loads}` }))],
      createEpoch: () => "initial-epoch",
    });

    const result = await runtime.reader("oidc").acquire(clientCode);

    expect(result).toEqual({ kind: "present", value: { label: "runtime-2" } });
    expect(loads).toBe(2);
  });

  test("Redis failures expose only the low-entropy unavailable error", async () => {
    const disconnectedRedis = createRedisClient(testRedisUrl);
    await connectRedis(disconnectedRedis);
    disconnectedRedis.disconnect();
    const load = mock(async () => ({ label: "must-not-load" }));
    const runtime = createClientRuntimeSnapshotModule({
      redis: disconnectedRedis,
      adapters: [createAdapter("oidc", load)],
      createEpoch: () => "epoch-disconnected",
    });
    let failure: unknown;
    try {
      await runtime.reader("oidc").acquire("client-sensitive");
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ClientRuntimeSnapshotUnavailableError);
    expect(failure).toMatchObject({
      message: "Client Runtime Snapshot unavailable",
      name: "ClientRuntimeSnapshotUnavailableError",
    });
    expect(load).not.toHaveBeenCalled();
    expect(JSON.stringify(failure)).not.toContain("client-sensitive");
  });
});

function createAdapter<K extends ClientRuntimeSnapshotKind>(
  kind: K,
  load: () => Promise<TestRuntime | null>,
): ClientRuntimeSnapshotAdapter<K, TestRuntime> {
  return {
    kind,
    presentTtlMs: 60_000,
    absentTtlMs: 3_000,
    async load() {
      const value = await load();
      return value === null ? { kind: "absent" } : { kind: "present", value };
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

function createInvalidator(redis: RedisType) {
  return createClientRuntimeSnapshotModule({
    redis,
    adapters: [] as const,
    createEpoch: randomUUID,
  });
}

function withBeforePublish(redis: RedisType, hook: () => Promise<void>) {
  return new Proxy(redis, {
    get(target, property) {
      if (property === "eval") {
        return async (script: string, keyCount: number, ...args: string[]) => {
          if (script.includes("client-runtime-snapshot:publish"))
            await hook();
          return await target.eval(script, keyCount, ...args);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function ownedClientCode(label: string) {
  const clientCode = `api-core-snapshot-test-${label}-${randomUUID()}`;
  ownedClientCodes.push(clientCode);
  return clientCode;
}

function createRedisClient(redisUrl: string) {
  return new Redis(redisUrl, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
}

async function connectRedis(redis: RedisType) {
  await redis.connect();
  await redis.ping();
}

function requireDedicatedRedisTestUrl() {
  const redisUrl = process.env[TEST_REDIS_URL_ENV];
  if (!redisUrl)
    throw new Error(`${TEST_REDIS_URL_ENV} must point to a caller-provided dedicated Redis test instance; no fallback is allowed`);
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new Error(`${TEST_REDIS_URL_ENV} must use the redis or rediss protocol`);
  return redisUrl;
}

async function deleteClientRuntimeKeys(redis: RedisType, clientCode: string) {
  const keys = clientRuntimeSnapshotTestingKeys(clientCode);
  await redis.unlink(keys.control, ...keys.payloads);
}

async function waitForMissingKey(redis: RedisType, key: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = await redis.get(key);
    if (value === null)
      return value;
    await Bun.sleep(5);
  }
  return await redis.get(key);
}
