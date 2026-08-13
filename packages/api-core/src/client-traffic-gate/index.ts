import type { Redis } from "ioredis";
import type {
  GenerationFencedRuntimeMutationHeartbeat,
  GenerationFencedRuntimeMutationHeartbeatTimer,
  GenerationFencedRuntimeMutationRedis,
} from "../redis/generation-fenced-runtime-mutation";
import { ClientCodeSchema, ClientStatus } from "@iam/contracts";
import { z } from "zod";
import {
  beginGenerationFencedRuntimeMutation,
  finishGenerationFencedRuntimeMutation,
  invalidateGenerationFencedRuntime,
  startGenerationFencedRuntimeMutationHeartbeat,
} from "../redis/generation-fenced-runtime-mutation";
import { clientTrafficGateRuntimeKeys } from "./runtime-keys";

const POSITIVE_CACHE_TTL_MS = 30_000;
const NEGATIVE_CACHE_TTL_MS = 3_000;
const MUTATION_FENCE_TTL_MS = 120_000;
const GENERATION_PATTERN = /^(?:0|[1-9]\d*)$/u;

const CachedGateRecordSchema = z.object({
  version: z.literal(1),
  generation: z.string().regex(GENERATION_PATTERN),
  clientCode: ClientCodeSchema,
  expiresAt: z.number().int().nonnegative(),
  state: z.enum(["enabled", "maintenance", "disabled", "deleted", "missing"]),
}).strict();

const READ_SNAPSHOT_SCRIPT = `-- client-traffic-gate:read
if redis.call("GET", KEYS[2]) then
  return { "blocked" }
end
local generation = redis.call("GET", KEYS[3])
if not generation then
  generation = "0"
end
local cached = redis.call("GET", KEYS[1])
if cached then
  return { "ready", generation, cached }
end
return { "ready", generation }
`;

const PUBLISH_SOURCE_IF_CURRENT_SCRIPT = `-- client-traffic-gate:publish-source
if redis.call("GET", KEYS[2]) then
  return 0
end
local generation = redis.call("GET", KEYS[3])
if not generation then
  generation = "0"
end
if generation ~= ARGV[1] then
  return 2
end
redis.call("SET", KEYS[1], ARGV[2], "PX", ARGV[3])
return 1
`;

const PUBLISH_MUTATION_SCRIPT = `-- client-traffic-gate:publish-mutation
local current = redis.call("GET", KEYS[1])
if not current then
  return 2
end
if current ~= ARGV[1] then
  return 0
end
local generation = redis.call("INCR", KEYS[2])
local record = cjson.encode({
  version = 1,
  generation = tostring(generation),
  clientCode = ARGV[2],
  expiresAt = tonumber(ARGV[3]),
  state = ARGV[4]
})
redis.call("SET", KEYS[3], record, "PX", ARGV[5])
redis.call("DEL", KEYS[1])
return 1
`;

export type ClientTrafficGateResult
  = | { readonly outcome: "enabled" }
    | { readonly outcome: "maintenance" }
    | { readonly outcome: "disabled" }
    | { readonly outcome: "deleted" }
    | {
      readonly outcome: "unavailable";
      readonly reason: "corrupt" | "missing" | "mutation-in-progress" | "read-failed";
    };

export interface ClientTrafficGateSourceRecord {
  readonly clientCode: string;
  readonly isDelete: boolean;
  readonly status: ClientStatus;
}

export interface ClientTrafficGateSource {
  findClientTrafficState: (
    clientCode: string,
  ) => Promise<ClientTrafficGateSourceRecord | null>;
}

export type ClientTrafficGateRedis = GenerationFencedRuntimeMutationRedis;

export interface ClientTrafficGateMutation {
  readonly clientCode: string;
  readonly fenceTtlMs: number;
  readonly mutationId: string;
}

export type ClientTrafficGateMutationHeartbeatTimer
  = GenerationFencedRuntimeMutationHeartbeatTimer;

export type ClientTrafficGateMutationHeartbeat
  = GenerationFencedRuntimeMutationHeartbeat;

export class ClientTrafficGateMutationOwnershipError extends Error {
  constructor(
    public readonly ownership: "expired" | "superseded",
  ) {
    super(`Client traffic gate mutation ownership ${ownership}`);
    this.name = "ClientTrafficGateMutationOwnershipError";
  }
}

export function createClientTrafficGateReader(options: {
  redis: ClientTrafficGateRedis;
  source: ClientTrafficGateSource;
  clock?: { now: () => number };
  cache?: { positiveTtlMs: number; negativeTtlMs: number };
}) {
  const clock = options.clock ?? { now: Date.now };
  const cache = options.cache ?? {
    positiveTtlMs: POSITIVE_CACHE_TTL_MS,
    negativeTtlMs: NEGATIVE_CACHE_TTL_MS,
  };
  assertCacheTtls(cache);
  const currentLoads = new Map<string, Promise<ClientTrafficGateResult>>();

  async function check(clientCode: string): Promise<ClientTrafficGateResult> {
    if (!ClientCodeSchema.safeParse(clientCode).success)
      return unavailable("missing");

    const snapshot = await readSnapshot(options.redis, clientCode);
    if (snapshot.outcome === "unavailable")
      return snapshot;
    const cached = parseCachedResult(
      snapshot.serialized,
      snapshot.generation,
      clientCode,
      clock.now(),
    );
    if (cached.kind === "hit")
      return stateToResult(cached.state);
    if (cached.kind === "corrupt")
      return unavailable("corrupt");

    const existing = currentLoads.get(clientCode);
    if (existing !== undefined)
      return await existing;
    const load = loadFromSource(clientCode, snapshot.generation).finally(() => {
      if (currentLoads.get(clientCode) === load)
        currentLoads.delete(clientCode);
    });
    currentLoads.set(clientCode, load);
    return await load;
  }

  async function loadFromSource(
    clientCode: string,
    generation: string,
  ): Promise<ClientTrafficGateResult> {
    let record: ClientTrafficGateSourceRecord | null;
    try {
      record = await options.source.findClientTrafficState(clientCode);
    }
    catch {
      return unavailable("read-failed");
    }

    const state = sourceRecordToState(record, clientCode);
    if (state === "corrupt")
      return unavailable("corrupt");
    const ttlMs = state === "missing"
      ? cache.negativeTtlMs
      : cache.positiveTtlMs;
    const serialized = serializeRecord({
      clientCode,
      expiresAt: clock.now() + ttlMs,
      generation,
      state,
    });
    let published: unknown;
    try {
      const keys = runtimeKeys(clientCode);
      published = await options.redis.eval(
        PUBLISH_SOURCE_IF_CURRENT_SCRIPT,
        3,
        keys.cacheKey,
        keys.mutationKey,
        keys.generationKey,
        generation,
        serialized,
        String(ttlMs),
      );
    }
    catch {
      return unavailable("read-failed");
    }
    if (Number(published) === 0)
      return unavailable("mutation-in-progress");
    if (Number(published) === 2)
      return unavailable("mutation-in-progress");
    if (Number(published) !== 1)
      return unavailable("corrupt");
    return stateToResult(state);
  }

  return { check };
}

export async function beginClientTrafficGateMutation(
  redis: ClientTrafficGateRedis,
  input: Omit<ClientTrafficGateMutation, "fenceTtlMs"> & {
    readonly fenceTtlMs?: number;
  },
): Promise<ClientTrafficGateMutation> {
  const fenceTtlMs = input.fenceTtlMs ?? MUTATION_FENCE_TTL_MS;
  assertPositiveSafeInteger(fenceTtlMs, "mutation fence TTL");
  if (fenceTtlMs < 3)
    throw new RangeError("Client traffic gate mutation fence TTL must be at least 3 milliseconds");
  await beginGenerationFencedRuntimeMutation(redis, {
    ...runtimeKeys(input.clientCode),
    fenceTtlMs,
    mutationId: input.mutationId,
  });
  return {
    clientCode: input.clientCode,
    fenceTtlMs,
    mutationId: input.mutationId,
  };
}

export function startClientTrafficGateMutationHeartbeat(
  redis: ClientTrafficGateRedis,
  mutation: ClientTrafficGateMutation,
  options: { timer?: ClientTrafficGateMutationHeartbeatTimer } = {},
): ClientTrafficGateMutationHeartbeat {
  return startGenerationFencedRuntimeMutationHeartbeat(
    redis,
    runtimeLease(mutation),
    {
      createOwnershipError: ownership =>
        new ClientTrafficGateMutationOwnershipError(ownership),
      failureMessage: "Client traffic gate heartbeat and settlement failed",
      ...(options.timer === undefined ? {} : { timer: options.timer }),
    },
  );
}

export async function publishClientTrafficGateMutation(
  redis: ClientTrafficGateRedis,
  mutation: ClientTrafficGateMutation,
  status: ClientStatus,
  options: { clock?: { now: () => number }; ttlMs?: number } = {},
): Promise<"expired" | "published" | "superseded"> {
  const state = statusToState(status);
  const ttlMs = options.ttlMs ?? POSITIVE_CACHE_TTL_MS;
  assertPositiveSafeInteger(ttlMs, "cache TTL");
  const now = options.clock?.now() ?? Date.now();
  const keys = runtimeKeys(mutation.clientCode);
  const result = await redis.eval(
    PUBLISH_MUTATION_SCRIPT,
    3,
    keys.mutationKey,
    keys.generationKey,
    keys.cacheKey,
    mutation.mutationId,
    mutation.clientCode,
    String(now + ttlMs),
    state,
    String(ttlMs),
  );
  if (Number(result) === 1)
    return "published";
  if (Number(result) === 2)
    return "expired";
  return "superseded";
}

export async function abortClientTrafficGateMutation(
  redis: ClientTrafficGateRedis,
  mutation: ClientTrafficGateMutation,
): Promise<"aborted" | "expired" | "superseded"> {
  const result = await finishGenerationFencedRuntimeMutation(redis, {
    ...runtimeKeys(mutation.clientCode),
    mutationId: mutation.mutationId,
  });
  if (result === "finished")
    return "aborted";
  return result;
}

export async function invalidateClientTrafficGate(
  redis: Redis,
  clientCode: string,
) {
  await invalidateGenerationFencedRuntime(
    redis,
    runtimeKeys(clientCode),
    "Client traffic gate invalidation transaction failed",
  );
}

async function readSnapshot(
  redis: ClientTrafficGateRedis,
  clientCode: string,
): Promise<
  | { readonly generation: string; readonly outcome: "ready"; readonly serialized: string | null }
  | Extract<ClientTrafficGateResult, { outcome: "unavailable" }>
> {
  let raw: unknown;
  try {
    const keys = runtimeKeys(clientCode);
    raw = await redis.eval(
      READ_SNAPSHOT_SCRIPT,
      3,
      keys.cacheKey,
      keys.mutationKey,
      keys.generationKey,
    );
  }
  catch {
    return unavailable("read-failed");
  }
  if (!Array.isArray(raw) || raw.length === 0)
    return unavailable("corrupt");
  if (raw[0] === "blocked")
    return unavailable("mutation-in-progress");
  const generation = raw[1];
  const serialized = raw[2];
  if (
    raw[0] !== "ready"
    || typeof generation !== "string"
    || !GENERATION_PATTERN.test(generation)
    || (serialized != null && serialized !== false && typeof serialized !== "string")
  ) {
    return unavailable("corrupt");
  }
  return {
    outcome: "ready",
    generation,
    serialized: typeof serialized === "string" ? serialized : null,
  };
}

function parseCachedResult(
  serialized: string | null,
  generation: string,
  clientCode: string,
  now: number,
):
  | { readonly kind: "corrupt" }
  | { readonly kind: "hit"; readonly state: CachedState }
  | { readonly kind: "miss" } {
  if (serialized === null)
    return { kind: "miss" };
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  }
  catch {
    return { kind: "corrupt" };
  }
  const parsed = CachedGateRecordSchema.safeParse(value);
  if (!parsed.success)
    return { kind: "corrupt" };
  if (
    parsed.data.generation !== generation
    || parsed.data.clientCode !== clientCode
    || parsed.data.expiresAt <= now
  ) {
    return { kind: "miss" };
  }
  return { kind: "hit", state: parsed.data.state };
}

type CachedState = z.infer<typeof CachedGateRecordSchema>["state"];

function sourceRecordToState(
  record: ClientTrafficGateSourceRecord | null,
  clientCode: string,
): CachedState | "corrupt" {
  if (record === null)
    return "missing";
  if (record.clientCode !== clientCode)
    return "corrupt";
  if (record.isDelete)
    return "deleted";
  try {
    return statusToState(record.status);
  }
  catch {
    return "corrupt";
  }
}

function statusToState(status: ClientStatus): Exclude<CachedState, "missing"> {
  if (status === ClientStatus.Enable)
    return "enabled";
  if (status === ClientStatus.Maintenance)
    return "maintenance";
  if (status === ClientStatus.Disable)
    return "disabled";
  throw new TypeError("Invalid client traffic gate status");
}

function stateToResult(state: CachedState): ClientTrafficGateResult {
  if (state === "missing")
    return unavailable("missing");
  return { outcome: state };
}

function unavailable(
  reason: Extract<ClientTrafficGateResult, { outcome: "unavailable" }>["reason"],
): Extract<ClientTrafficGateResult, { outcome: "unavailable" }> {
  return { outcome: "unavailable", reason };
}

function serializeRecord(input: {
  clientCode: string;
  expiresAt: number;
  generation: string;
  state: CachedState;
}) {
  return JSON.stringify({ version: 1, ...input });
}

function runtimeKeys(clientCode: string) {
  return clientTrafficGateRuntimeKeys(clientCode);
}

function runtimeLease(mutation: ClientTrafficGateMutation) {
  return {
    fenceTtlMs: mutation.fenceTtlMs,
    mutationId: mutation.mutationId,
    mutationKey: runtimeKeys(mutation.clientCode).mutationKey,
  };
}

function assertCacheTtls(cache: { negativeTtlMs: number; positiveTtlMs: number }) {
  assertPositiveSafeInteger(cache.positiveTtlMs, "positive cache TTL");
  assertPositiveSafeInteger(cache.negativeTtlMs, "negative cache TTL");
  if (cache.negativeTtlMs >= cache.positiveTtlMs)
    throw new RangeError("Client traffic gate negative cache TTL must be shorter than positive cache TTL");
  if (cache.positiveTtlMs >= MUTATION_FENCE_TTL_MS)
    throw new RangeError("Client traffic gate cache TTL must be shorter than the mutation fence TTL");
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`Client traffic gate ${label} must be a positive safe integer`);
}
