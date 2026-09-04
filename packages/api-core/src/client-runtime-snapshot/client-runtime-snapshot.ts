import type {
  ClientRuntimeSnapshotAtomicStore,
} from "./atomic-store";
import type {
  ClientRuntimeSnapshot,
  ClientRuntimeSnapshotAdapter,
  ClientRuntimeSnapshotKind,
  ClientRuntimeSnapshotReader,
} from "./contract";
import type { ClientRuntimeSnapshotObservabilityPort } from "./observability";
import type { ClientRuntimeSnapshotRedis } from "./redis-store";
import { randomUUID } from "node:crypto";
import {
  ClientRuntimeInvalidationFailedError,
  ClientRuntimeSnapshotUnavailableError,
} from "./contract";
import { createClientRuntimeSnapshotRedisStore } from "./redis-store";

type AnyAdapter = ClientRuntimeSnapshotAdapter<ClientRuntimeSnapshotKind, unknown>;
type AdapterKind<A extends readonly AnyAdapter[]> = A[number]["kind"];
type AdapterValue<
  A extends readonly AnyAdapter[],
  K extends AdapterKind<A>,
> = Extract<A[number], { kind: K }> extends ClientRuntimeSnapshotAdapter<K, infer T>
  ? T
  : never;

export interface ClientRuntimeSnapshotModule<
  A extends readonly ClientRuntimeSnapshotAdapter<ClientRuntimeSnapshotKind, unknown>[],
> {
  readonly reader: <K extends A[number]["kind"]>(
    kind: K,
  ) => ClientRuntimeSnapshotReader<
    Extract<A[number], { kind: K }> extends ClientRuntimeSnapshotAdapter<K, infer T>
      ? T
      : never
  >;
  readonly invalidateClient: (clientCode: string) => Promise<void>;
}

export interface CreateClientRuntimeSnapshotModuleOptions<
  A extends readonly AnyAdapter[],
> {
  readonly redis: ClientRuntimeSnapshotRedis;
  readonly adapters: A;
  readonly createEpoch?: () => string;
  readonly now?: () => number;
  readonly observability?: ClientRuntimeSnapshotObservabilityPort;
}

export interface CreateClientRuntimeSnapshotModuleWithAtomicStoreOptions<
  A extends readonly AnyAdapter[],
> extends Omit<CreateClientRuntimeSnapshotModuleOptions<A>, "redis"> {
  readonly store: ClientRuntimeSnapshotAtomicStore;
}

export function createClientRuntimeSnapshotModule<
  const A extends readonly AnyAdapter[],
>(
  options: CreateClientRuntimeSnapshotModuleOptions<A>,
): ClientRuntimeSnapshotModule<A> {
  return createClientRuntimeSnapshotModuleWithAtomicStore({
    ...options,
    store: createClientRuntimeSnapshotRedisStore(options.redis),
  });
}

export function createClientRuntimeSnapshotModuleWithAtomicStore<
  const A extends readonly AnyAdapter[],
>(
  options: CreateClientRuntimeSnapshotModuleWithAtomicStoreOptions<A>,
): ClientRuntimeSnapshotModule<A> {
  const { store } = options;
  const adapters = new Map<ClientRuntimeSnapshotKind, AnyAdapter>();
  const inFlight = new Map<string, Promise<ClientRuntimeSnapshot<unknown>>>();
  const createEpoch = options.createEpoch ?? randomUUID;
  const now = options.now ?? Date.now;
  for (const adapter of options.adapters) {
    assertPositiveSafeInteger(adapter.presentTtlMs, "present TTL");
    if (adapter.absentTtlMs !== undefined)
      assertPositiveSafeInteger(adapter.absentTtlMs, "absent TTL");
    if (adapters.has(adapter.kind))
      throw new Error(`Duplicate Client Runtime Snapshot adapter: ${adapter.kind}`);
    adapters.set(adapter.kind, adapter);
  }

  function observe(observation: Parameters<ClientRuntimeSnapshotObservabilityPort["record"]>[0]) {
    try {
      options.observability?.record(observation);
    }
    catch {}
  }

  async function acquire<T>(
    adapter: ClientRuntimeSnapshotAdapter<ClientRuntimeSnapshotKind, T>,
    clientCode: string,
  ): Promise<ClientRuntimeSnapshot<T>> {
    const startedAt = now();
    const key = `${adapter.kind}\0${clientCode}`;
    const existing = inFlight.get(key);
    if (existing) {
      try {
        return await existing as ClientRuntimeSnapshot<T>;
      }
      catch {
        throw new ClientRuntimeSnapshotUnavailableError();
      }
    }
    let acquisitionOutcome: "hit" | "loaded-present" | "loaded-absent" | "unavailable" = "unavailable";
    const operation = acquireWithRetry(adapter, clientCode).then((result) => {
      acquisitionOutcome = result.outcome;
      return result.snapshot;
    });
    inFlight.set(key, operation);
    try {
      return await operation;
    }
    catch {
      throw new ClientRuntimeSnapshotUnavailableError();
    }
    finally {
      if (inFlight.get(key) === operation)
        inFlight.delete(key);
      observe({
        operation: "acquire",
        outcome: acquisitionOutcome,
        durationMs: elapsed(now, startedAt),
        kind: adapter.kind,
      });
    }
  }

  async function acquireWithRetry<T>(
    adapter: ClientRuntimeSnapshotAdapter<ClientRuntimeSnapshotKind, T>,
    clientCode: string,
  ) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const state = await store.readOrBootstrap(clientCode, adapter.kind, createEpoch());
      if (state.bootstrapped) {
        observe({
          operation: "bootstrap",
          outcome: "created",
          durationMs: 0,
          kind: adapter.kind,
        });
      }
      const cached = decodeEnvelope(adapter, clientCode, state.control, state.payload);
      if (cached !== null)
        return { snapshot: cached, outcome: "hit" as const };

      const snapshot = await adapter.load(clientCode);
      const ttlMs = snapshot.kind === "present"
        ? adapter.presentTtlMs
        : (adapter.absentTtlMs ?? 0);
      const envelope = encodeEnvelope(adapter, clientCode, state.control, snapshot);
      const publishStartedAt = now();
      const publish = ttlMs === 0
        ? await store.verifyCurrent(clientCode, state.control)
        : await store.publishIfCurrent(
            clientCode,
            adapter.kind,
            state.control,
            envelope,
            ttlMs,
          );
      observe({
        operation: "publish",
        outcome: publish,
        durationMs: elapsed(now, publishStartedAt),
        kind: adapter.kind,
      });
      if (publish !== "conflict") {
        return {
          snapshot,
          outcome: snapshot.kind === "present" ? "loaded-present" as const : "loaded-absent" as const,
        };
      }
    }
    throw new ClientRuntimeSnapshotUnavailableError();
  }

  return {
    reader<K extends AdapterKind<A>>(kind: K): ClientRuntimeSnapshotReader<AdapterValue<A, K>> {
      const adapter = adapters.get(kind);
      if (!adapter)
        throw new Error(`Client Runtime Snapshot adapter is not registered: ${kind}`);
      return {
        acquire: clientCode => acquire(adapter, clientCode) as Promise<ClientRuntimeSnapshot<AdapterValue<A, K>>>,
      };
    },

    async invalidateClient(clientCode: string) {
      const startedAt = now();
      let outcome: "completed" | "failed" = "failed";
      try {
        await store.invalidateClient(clientCode, createEpoch());
        outcome = "completed";
      }
      catch {
        throw new ClientRuntimeInvalidationFailedError();
      }
      finally {
        observe({
          operation: "invalidate",
          outcome,
          durationMs: elapsed(now, startedAt),
        });
      }
    },
  };
}

function encodeEnvelope<T>(
  adapter: ClientRuntimeSnapshotAdapter<ClientRuntimeSnapshotKind, T>,
  clientCode: string,
  control: { epoch: string; generation: string },
  snapshot: ClientRuntimeSnapshot<T>,
) {
  return JSON.stringify({
    schemaVersion: 1,
    clientCode,
    kind: adapter.kind,
    control,
    snapshot: snapshot.kind === "present"
      ? { kind: "present", value: adapter.codec.encode(snapshot.value) }
      : { kind: "absent" },
  });
}

function decodeEnvelope<T>(
  adapter: ClientRuntimeSnapshotAdapter<ClientRuntimeSnapshotKind, T>,
  clientCode: string,
  control: { epoch: string; generation: string },
  raw: string | null,
): ClientRuntimeSnapshot<T> | null {
  if (raw === null)
    return null;
  try {
    const envelope = JSON.parse(raw) as unknown;
    if (!isRecord(envelope)
      || envelope.schemaVersion !== 1
      || envelope.clientCode !== clientCode
      || envelope.kind !== adapter.kind
      || !isRecord(envelope.control)
      || envelope.control.epoch !== control.epoch
      || envelope.control.generation !== control.generation
      || !isRecord(envelope.snapshot)) {
      return null;
    }
    if (envelope.snapshot.kind === "absent")
      return { kind: "absent" };
    if (envelope.snapshot.kind !== "present" || !("value" in envelope.snapshot))
      return null;
    return { kind: "present", value: adapter.codec.decode(envelope.snapshot.value) };
  }
  catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`Client Runtime Snapshot ${label} must be a positive safe integer`);
}

function elapsed(now: () => number, startedAt: number) {
  const duration = now() - startedAt;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}
