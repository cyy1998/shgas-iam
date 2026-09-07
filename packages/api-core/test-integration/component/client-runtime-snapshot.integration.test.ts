import type { ClientRuntimeSnapshotAdapter } from "@iam/api-core/client-runtime-snapshot";
import {
  ClientRuntimeRepairFailedError,
  ClientRuntimeSnapshotUnavailableError,
  ClientRuntimeVerifyFailedError,
  createClientRuntimeSnapshotLoggerObservability,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientRuntimeRestoreInventoryReaderForTesting,
  createClientRuntimeRestoreInventoryRepairerForTesting,
  createClientRuntimeSnapshotMaintenanceWithAtomicStore,
  createClientRuntimeSnapshotModuleWithAtomicStore,
  createClientRuntimeSnapshotRestoreRepairWithInventory,
  createClientRuntimeSnapshotVerifierWithInventory,
  InMemoryClientRuntimeSnapshotAtomicStore,
} from "@iam/api-core/client-runtime-snapshot/testing";
import { SystemLogEvent } from "@iam/api-core/logger";
import { describe, expect, mock, test } from "bun:test";

interface TestRuntime {
  readonly label: string;
}

function createAdapter(load: () => Promise<TestRuntime | null>): ClientRuntimeSnapshotAdapter<"oidc", TestRuntime> {
  return createKindAdapter("oidc", load);
}

function createKindAdapter<K extends "oidc" | "custom-sso" | "traffic-gate">(
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

describe("Client Runtime Snapshot module", () => {
  test("full restore repair converges across SCAN deletion skips and preserves non-owner data", async () => {
    const redis = new RestoreMaintenanceRedisFake([
      "client-runtime-snapshot:v1:{a}:control",
      "client-runtime-snapshot:v1:{a}:payload:oidc",
      "client-runtime-snapshot:v1:{b}:control",
      "oidc:client-runtime:a",
      "custom-sso:client-runtime:a",
      "custom-sso:client-runtime-generation:a",
      "custom-sso:client-runtime-mutation:a",
      "client:traffic-gate:a",
      "client:traffic-gate-generation:a",
      "client:traffic-gate-mutation:a",
      "iam:sentinel:must-remain",
    ]);
    const maintenance = createClientRuntimeSnapshotRestoreRepairWithInventory({
      inventory: createClientRuntimeRestoreInventoryRepairerForTesting(redis, 2),
      unlinkBatchSize: 2,
    });
    const verifier = createClientRuntimeSnapshotVerifierWithInventory({
      inventory: createClientRuntimeRestoreInventoryReaderForTesting(redis, 2),
    });

    const report = await maintenance.repairAllAfterRedisRestore({
      protocolTrafficStopped: true,
    });
    const verify = await verifier.verifyAllAfterRedisRestore({
      protocolTrafficStopped: true,
    });

    expect(report.unlinkBatches > 1).toBe(true);
    expect(report).toMatchObject({
      scannedKeys: 3,
      unlinkedKeys: 3,
      unlinkBatches: expect.any(Number),
    });
    expect(verify).toEqual({ matchingKeys: 0 });
    expect(redis.keys()).toEqual([
      "oidc:client-runtime:a",
      "custom-sso:client-runtime:a",
      "custom-sso:client-runtime-generation:a",
      "custom-sso:client-runtime-mutation:a",
      "client:traffic-gate:a",
      "client:traffic-gate-generation:a",
      "client:traffic-gate-mutation:a",
      "iam:sentinel:must-remain",
    ].sort());
  });

  test("full restore repair fails closed without confirmation and can restart after a partial unlink failure", async () => {
    const redis = new RestoreMaintenanceRedisFake([
      "client-runtime-snapshot:v1:{a}:control",
      "client-runtime-snapshot:v1:{b}:control",
      "iam:sentinel:must-remain",
    ]);
    const maintenance = createClientRuntimeSnapshotRestoreRepairWithInventory({
      inventory: createClientRuntimeRestoreInventoryRepairerForTesting(redis, 1),
      unlinkBatchSize: 1,
    });

    let unconfirmedFailure: unknown;
    try {
      await maintenance.repairAllAfterRedisRestore({
        protocolTrafficStopped: false,
      } as never);
    }
    catch (error) {
      unconfirmedFailure = error;
    }
    expect(unconfirmedFailure).toBeInstanceOf(ClientRuntimeRepairFailedError);
    expect(redis.scanCalls).toBe(0);
    expect(redis.unlinkCalls).toBe(0);

    redis.failNextUnlink = true;
    let partialFailure: unknown;
    try {
      await maintenance.repairAllAfterRedisRestore({
        protocolTrafficStopped: true,
      });
    }
    catch (error) {
      partialFailure = error;
    }
    expect(partialFailure).toBeInstanceOf(ClientRuntimeRepairFailedError);

    const rerun = await maintenance.repairAllAfterRedisRestore({
      protocolTrafficStopped: true,
    });
    expect(rerun.unlinkedKeys).toBe(2);
    expect(redis.keys()).toEqual(["iam:sentinel:must-remain"]);
  });

  test("independent full verify scans every owner pattern without writing and keeps failures low entropy", async () => {
    const redis = new RestoreMaintenanceRedisFake([
      "client-runtime-snapshot:v1:{a}:control",
      "custom-sso:client-runtime-generation:a",
      "iam:sentinel:must-remain",
    ]);
    const verifier = createClientRuntimeSnapshotVerifierWithInventory({
      inventory: createClientRuntimeRestoreInventoryReaderForTesting(redis),
    });

    const report = await verifier.verifyAllAfterRedisRestore({
      protocolTrafficStopped: true,
    });
    expect(report).toEqual({ matchingKeys: 1 });
    expect(redis.unlinkCalls).toBe(0);

    redis.failNextScan = true;
    let failure: unknown;
    try {
      await verifier.verifyAllAfterRedisRestore({
        protocolTrafficStopped: true,
      });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ClientRuntimeVerifyFailedError);
    expect(failure).toMatchObject({
      name: "ClientRuntimeVerifyFailedError",
      message: "Client Runtime verify failed",
    });
    expect(JSON.stringify(failure)).not.toContain("redis-secret");
  });

  test("targeted maintenance repair invalidates all payload kinds and remains safe to repeat", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    const loadCounts = new Map<string, number>();
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: (["oidc", "custom-sso", "traffic-gate"] as const).map(kind => createKindAdapter(kind, async () => {
        const next = (loadCounts.get(kind) ?? 0) + 1;
        loadCounts.set(kind, next);
        return { label: `${kind}-${next}` };
      })),
      createEpoch: () => "runtime-epoch",
    });
    const maintenance = createClientRuntimeSnapshotMaintenanceWithAtomicStore({
      store,
      createEpoch: () => "repair-epoch",
    });

    const initial = await Promise.all([
      runtime.reader("oidc").acquire("client-a"),
      runtime.reader("custom-sso").acquire("client-a"),
      runtime.reader("traffic-gate").acquire("client-a"),
    ]);
    await maintenance.repairClient("client-a");
    await maintenance.repairClient("client-a");
    const repaired = await Promise.all([
      runtime.reader("oidc").acquire("client-a"),
      runtime.reader("custom-sso").acquire("client-a"),
      runtime.reader("traffic-gate").acquire("client-a"),
    ]);

    expect(initial).toEqual([
      { kind: "present", value: { label: "oidc-1" } },
      { kind: "present", value: { label: "custom-sso-1" } },
      { kind: "present", value: { label: "traffic-gate-1" } },
    ]);
    expect(repaired).toEqual([
      { kind: "present", value: { label: "oidc-2" } },
      { kind: "present", value: { label: "custom-sso-2" } },
      { kind: "present", value: { label: "traffic-gate-2" } },
    ]);
    expect(maintenance).not.toHaveProperty("reader");
    expect(maintenance).not.toHaveProperty("invalidateClient");
  });

  test("targeted repair keeps failures low entropy and observer failures best effort", async () => {
    const observations: unknown[] = [];
    const store = new Proxy(new InMemoryClientRuntimeSnapshotAtomicStore(), {
      get(target, property, receiver) {
        if (property === "invalidateClient") {
          return async () => {
            throw new Error("redis://user:secret@runtime repair payload");
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const maintenance = createClientRuntimeSnapshotMaintenanceWithAtomicStore({
      store,
      observability: {
        record(observation) {
          observations.push(observation);
          throw new Error("observer-secret");
        },
      },
    });

    let failure: unknown;
    try {
      await maintenance.repairClient("client-canary");
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ClientRuntimeRepairFailedError);
    expect(failure).toMatchObject({
      message: "Client Runtime repair failed",
      name: "ClientRuntimeRepairFailedError",
    });
    expect(observations).toEqual([{
      operation: "repair-client",
      outcome: "failed",
      durationMs: expect.any(Number),
      clientCode: "client-canary",
    }]);
    expect(JSON.stringify(failure)).not.toContain("secret");
    expect(JSON.stringify(observations)).not.toContain("secret");
  });

  test("returns present and absent snapshots while reusing a trusted payload", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    const load = mock(async () => ({ label: "runtime-v1" } as TestRuntime | null));
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createAdapter(load)],
      createEpoch: () => "epoch-a",
    });
    const reader = runtime.reader("oidc");

    const first = await reader.acquire("client-a");
    const second = await reader.acquire("client-a");

    expect(first).toEqual({ kind: "present", value: { label: "runtime-v1" } });
    expect(second).toEqual(first);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.publishedTtls).toEqual([60_000]);

    const absentLoad = mock(async () => null);
    const absentRuntime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store: new InMemoryClientRuntimeSnapshotAtomicStore(),
      adapters: [createAdapter(absentLoad)],
      createEpoch: () => "epoch-b",
    });
    const absent = await absentRuntime.reader("oidc").acquire("client-missing");

    expect(absent).toEqual({ kind: "absent" });
    expect(absentLoad).toHaveBeenCalledTimes(1);
  });

  test("collapses infrastructure and loader failures to one low-entropy unavailable error", async () => {
    const load = mock(async () => {
      throw new Error("postgresql://user:secret@db/client payload secret");
    });
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store: new InMemoryClientRuntimeSnapshotAtomicStore(),
      adapters: [createAdapter(load)],
      createEpoch: () => "epoch-a",
    });

    let failure: unknown;
    try {
      await runtime.reader("oidc").acquire("sensitive-client-code");
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ClientRuntimeSnapshotUnavailableError);
    expect(failure).toMatchObject({
      message: "Client Runtime Snapshot unavailable",
      name: "ClientRuntimeSnapshotUnavailableError",
    });
    expect(JSON.stringify(failure)).not.toContain("sensitive-client-code");
    expect(JSON.stringify(failure)).not.toContain("secret");
  });

  test("discards a source read that completes after invalidation and reloads once", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    let current = "runtime-v1";
    let releaseFirstLoad!: () => void;
    let markFirstLoadStarted!: () => void;
    const firstLoadStarted = new Promise<void>((resolve) => {
      markFirstLoadStarted = resolve;
    });
    const firstLoadGate = new Promise<void>((resolve) => {
      releaseFirstLoad = resolve;
    });
    let loadCount = 0;
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createAdapter(async () => {
        loadCount += 1;
        const captured = current;
        if (loadCount === 1) {
          markFirstLoadStarted();
          await firstLoadGate;
        }
        return { label: captured };
      })],
      createEpoch: () => `epoch-${loadCount}`,
    });

    const acquiring = runtime.reader("oidc").acquire("client-a");
    await firstLoadStarted;
    current = "runtime-v2";
    await runtime.invalidateClient("client-a");
    releaseFirstLoad();
    const result = await acquiring;

    expect(result).toEqual({ kind: "present", value: { label: "runtime-v2" } });
    expect(loadCount).toBe(2);
  });

  test("returns unavailable after two consecutive publish conflicts", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    store.beforePublish = (target) => {
      target.advanceGeneration("client-a");
    };
    const load = mock(async () => ({ label: "runtime" }));
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createAdapter(load)],
      createEpoch: () => "epoch-a",
    });

    let failure: unknown;
    try {
      await runtime.reader("oidc").acquire("client-a");
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ClientRuntimeSnapshotUnavailableError);
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.publishCount).toBe(2);
  });

  test("uses epoch in the publish CAS so generation ABA cannot publish an old read", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    store.beforePublish = (target, publishCount) => {
      if (publishCount !== 1)
        return;
      target.replaceEpoch("client-a", "epoch-after-reset");
    };
    let loadCount = 0;
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createAdapter(async () => ({ label: `runtime-${++loadCount}` }))],
      createEpoch: () => "epoch-initial",
    });

    const result = await runtime.reader("oidc").acquire("client-a");

    expect(result).toEqual({ kind: "present", value: { label: "runtime-2" } });
    expect(loadCount).toBe(2);
  });

  test("single-flights concurrent source loads and keeps observer failures best effort", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    let releaseLoad!: () => void;
    let markLoadStarted!: () => void;
    const loadStarted = new Promise<void>((resolve) => {
      markLoadStarted = resolve;
    });
    const loadGate = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const load = mock(async () => {
      markLoadStarted();
      await loadGate;
      return { label: "runtime" };
    });
    const observations: unknown[] = [];
    const runtime = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createAdapter(load)],
      createEpoch: () => "epoch-a",
      observability: {
        record(observation) {
          observations.push(observation);
          throw new Error("observer-canary-secret");
        },
      },
    });
    const reader = runtime.reader("oidc");

    const first = reader.acquire("client-sensitive");
    await loadStarted;
    const second = reader.acquire("client-sensitive");
    releaseLoad();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual({ kind: "present", value: { label: "runtime" } });
    expect(secondResult).toEqual(firstResult);
    expect(load).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(observations)).not.toContain("client-sensitive");
    expect(JSON.stringify(observations)).not.toContain("observer-canary-secret");
  });

  test("logger observability serializes only the bounded closed fields", () => {
    const info = mock(() => {});
    const observability = createClientRuntimeSnapshotLoggerObservability({ info });

    observability.record({
      operation: "acquire",
      outcome: "hit",
      durationMs: 7,
      kind: "oidc",
      clientCode: "client-canary",
      redisUrl: "redis://user:secret@runtime",
      control: "epoch-generation-canary",
      payload: "payload-canary",
      error: "loader-error-canary",
    } as never);

    expect(info).toHaveBeenCalledWith({
      event: SystemLogEvent.ClientRuntimeSnapshotOperationObserved,
      operation: "acquire",
      outcome: "hit",
      durationMs: 7,
      kind: "oidc",
    }, "Client Runtime Snapshot operation observed");
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).not.toContain("client-canary");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("epoch-generation-canary");
    expect(serialized).not.toContain("payload-canary");
    expect(serialized).not.toContain("loader-error-canary");

    observability.record({
      operation: "repair-client",
      outcome: "completed",
      durationMs: 9,
      clientCode: "client-canary",
      redisUrl: "redis://user:secret@runtime",
      control: "epoch-generation-canary",
      payload: "payload-canary",
      error: "repair-error-canary",
    } as never);

    expect(info).toHaveBeenLastCalledWith({
      event: SystemLogEvent.ClientRuntimeSnapshotOperationObserved,
      operation: "repair-client",
      outcome: "completed",
      durationMs: 9,
      clientCode: "client-canary",
    }, "Client Runtime Snapshot operation observed");
    const repairSerialized = JSON.stringify(info.mock.calls.at(-1));
    expect(repairSerialized).not.toContain("secret");
    expect(repairSerialized).not.toContain("epoch-generation-canary");
    expect(repairSerialized).not.toContain("payload-canary");
    expect(repairSerialized).not.toContain("repair-error-canary");

    observability.record({
      operation: "verify-all",
      outcome: "completed",
      durationMs: 11,
      clientCode: "client-canary",
      pattern: "client-runtime-snapshot:v1:*",
      error: "verify-error-canary",
    } as never);

    expect(info).toHaveBeenLastCalledWith({
      event: SystemLogEvent.ClientRuntimeSnapshotOperationObserved,
      operation: "verify-all",
      outcome: "completed",
      durationMs: 11,
    }, "Client Runtime Snapshot operation observed");
    const verifySerialized = JSON.stringify(info.mock.calls.at(-1));
    expect(verifySerialized).not.toContain("client-canary");
    expect(verifySerialized).not.toContain("client-runtime-snapshot:v1");
    expect(verifySerialized).not.toContain("verify-error-canary");
  });
});

class RestoreMaintenanceRedisFake {
  readonly #keys = new Set<string>();
  scanCalls = 0;
  unlinkCalls = 0;
  failNextScan = false;
  failNextUnlink = false;

  constructor(keys: string[]) {
    for (const key of keys)
      this.#keys.add(key);
  }

  async scan(
    cursor: string,
    _matchToken: "MATCH",
    pattern: string,
    _countToken: "COUNT",
    count: string,
  ): Promise<[string, string[]]> {
    this.scanCalls += 1;
    if (this.failNextScan) {
      this.failNextScan = false;
      throw new Error("redis-secret scan failure");
    }
    const matching = [...this.#keys].filter(key => key.startsWith(pattern.slice(0, -1)));
    const start = Number(cursor);
    const size = Number(count);
    const keys = matching.slice(start, start + size);
    const nextCursor = start + size >= matching.length ? "0" : String(start + size);
    return [nextCursor, keys];
  }

  async unlink(...keys: string[]) {
    this.unlinkCalls += 1;
    if (this.failNextUnlink) {
      this.failNextUnlink = false;
      throw new Error("redis-secret unlink failure");
    }
    let deleted = 0;
    for (const key of keys) {
      if (this.#keys.delete(key))
        deleted += 1;
    }
    return deleted;
  }

  keys() {
    return [...this.#keys].sort();
  }
}
