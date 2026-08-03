import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import {
  CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS,
  CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS,
  CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS,
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
} from "@iam/api-core/custom-sso";
import {
  ClientCodeSchema,
  RETRYABLE_SERVICE_UNAVAILABLE,
} from "@iam/contracts";
import { CustomSsoClientRuntimeDtoSchema } from "@iam/domain/client";
import { z } from "zod";

const GENERATION_PATTERN = /^(?:0|[1-9]\d*)$/u;

const CustomSsoClientRuntimeCacheRecordSchema = z.object({
  version: z.literal(1),
  generation: z.string().regex(GENERATION_PATTERN),
  clientCode: ClientCodeSchema,
  expiresAt: z.number().int().nonnegative(),
  client: CustomSsoClientRuntimeDtoSchema.nullable(),
}).strict();

const READ_RUNTIME_SNAPSHOT_SCRIPT = `-- custom-sso-client-runtime:read
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

const PUBLISH_IF_CURRENT_SCRIPT = `-- custom-sso-client-runtime:publish
if redis.call("GET", KEYS[2]) then
  return 0
end
local generation = redis.call("GET", KEYS[3])
if not generation then
  generation = "0"
end
if generation ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "PX", ARGV[3])
return 1
`;

export class CustomSsoClientRuntimeUnavailableError extends Error {
  public readonly retryability = RETRYABLE_SERVICE_UNAVAILABLE;

  constructor(options?: { cause?: unknown }) {
    super("Custom SSO client runtime is temporarily unavailable", options);
    this.name = "CustomSsoClientRuntimeUnavailableError";
  }
}

export interface CustomSsoClientRuntimeSource {
  findRuntimeRecord: (
    clientCode: string,
  ) => Promise<CustomSsoClientRuntimeDto | null>;
}

export interface CustomSsoClientRuntimeRedis {
  eval: (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => Promise<unknown>;
}

export interface CreateCustomSsoClientRuntimeReaderOptions {
  redis: CustomSsoClientRuntimeRedis;
  source: CustomSsoClientRuntimeSource;
  clock?: {
    now: () => number;
  };
  cache?: {
    positiveTtlMs: number;
    negativeTtlMs: number;
  };
}

type RuntimeSnapshot = {
  readonly generation: string;
  readonly serialized: string | null;
};

export function createCustomSsoClientRuntimeReader(
  options: CreateCustomSsoClientRuntimeReaderOptions,
) {
  const clock = options.clock ?? { now: Date.now };
  const cache = options.cache ?? {
    positiveTtlMs: CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS,
    negativeTtlMs: CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS,
  };
  assertCacheTtls(cache);

  const currentLoads = new Map<
    string,
    Promise<CustomSsoClientRuntimeDto | null>
  >();

  async function loadCurrentSingleFlight(clientCode: string) {
    const existing = currentLoads.get(clientCode);
    if (existing !== undefined)
      return await existing;

    const load = loadCurrent(clientCode).finally(() => {
      if (currentLoads.get(clientCode) === load)
        currentLoads.delete(clientCode);
    });
    currentLoads.set(clientCode, load);
    return await load;
  }

  async function loadCurrent(clientCode: string) {
    const snapshot = await readRuntimeSnapshot(options.redis, clientCode);
    const cached = parseCachedRuntime(
      snapshot.serialized,
      snapshot.generation,
      clientCode,
      clock.now(),
    );
    if (cached.hit)
      return cached.client;

    let sourceClient: CustomSsoClientRuntimeDto | null;
    try {
      sourceClient = await options.source.findRuntimeRecord(clientCode);
    }
    catch (error) {
      throw new CustomSsoClientRuntimeUnavailableError({ cause: error });
    }

    let client: CustomSsoClientRuntimeDto | null;
    try {
      client = sourceClient === null
        ? null
        : CustomSsoClientRuntimeDtoSchema.parse(sourceClient);
    }
    catch (error) {
      throw new CustomSsoClientRuntimeUnavailableError({ cause: error });
    }
    if (client !== null && client.clientCode !== clientCode) {
      throw new TypeError(
        "Custom SSO client runtime source returned a different client",
      );
    }

    const ttlMs = client === null
      ? cache.negativeTtlMs
      : cache.positiveTtlMs;
    const serialized = JSON.stringify({
      version: 1,
      generation: snapshot.generation,
      clientCode,
      expiresAt: clock.now() + ttlMs,
      client,
    });
    let published: unknown;
    try {
      published = await options.redis.eval(
        PUBLISH_IF_CURRENT_SCRIPT,
        3,
        customSsoClientRuntimeCacheKey(clientCode),
        customSsoClientRuntimeMutationKey(clientCode),
        customSsoClientRuntimeGenerationKey(clientCode),
        snapshot.generation,
        serialized,
        String(ttlMs),
      );
    }
    catch (error) {
      throw new CustomSsoClientRuntimeUnavailableError({ cause: error });
    }
    if (Number(published) !== 1)
      throw new CustomSsoClientRuntimeUnavailableError();
    return client;
  }

  return {
    async findRuntimeRecord(clientCode: string) {
      if (!ClientCodeSchema.safeParse(clientCode).success)
        return null;

      const snapshot = await readRuntimeSnapshot(options.redis, clientCode);
      const cached = parseCachedRuntime(
        snapshot.serialized,
        snapshot.generation,
        clientCode,
        clock.now(),
      );
      if (cached.hit)
        return cached.client;
      return await loadCurrentSingleFlight(clientCode);
    },
  };
}

async function readRuntimeSnapshot(
  redis: CustomSsoClientRuntimeRedis,
  clientCode: string,
): Promise<RuntimeSnapshot> {
  let raw: unknown;
  try {
    raw = await redis.eval(
      READ_RUNTIME_SNAPSHOT_SCRIPT,
      3,
      customSsoClientRuntimeCacheKey(clientCode),
      customSsoClientRuntimeMutationKey(clientCode),
      customSsoClientRuntimeGenerationKey(clientCode),
    );
  }
  catch (error) {
    throw new CustomSsoClientRuntimeUnavailableError({ cause: error });
  }
  if (!Array.isArray(raw) || raw.length === 0)
    throw new CustomSsoClientRuntimeUnavailableError();
  if (raw[0] === "blocked")
    throw new CustomSsoClientRuntimeUnavailableError();
  const generation = raw[1];
  const serialized = raw[2];
  if (
    raw[0] !== "ready"
    || typeof generation !== "string"
    || !GENERATION_PATTERN.test(generation)
    || (
      serialized !== undefined
      && serialized !== null
      && serialized !== false
      && typeof serialized !== "string"
    )
  ) {
    throw new CustomSsoClientRuntimeUnavailableError();
  }
  return {
    generation,
    serialized: typeof serialized === "string" ? serialized : null,
  };
}

function parseCachedRuntime(
  serialized: string | null,
  generation: string,
  clientCode: string,
  now: number,
):
  | { readonly hit: true; readonly client: CustomSsoClientRuntimeDto | null }
  | { readonly hit: false } {
  if (serialized === null)
    return { hit: false };
  try {
    const parsed = CustomSsoClientRuntimeCacheRecordSchema.safeParse(
      JSON.parse(serialized),
    );
    if (
      !parsed.success
      || parsed.data.generation !== generation
      || parsed.data.clientCode !== clientCode
      || parsed.data.expiresAt <= now
      || (
        parsed.data.client !== null
        && parsed.data.client.clientCode !== clientCode
      )
    ) {
      return { hit: false };
    }
    return { hit: true, client: parsed.data.client };
  }
  catch {
    return { hit: false };
  }
}

function assertCacheTtls(cache: {
  positiveTtlMs: number;
  negativeTtlMs: number;
}) {
  for (const [label, value] of [
    ["positive", cache.positiveTtlMs],
    ["negative", cache.negativeTtlMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(
        `Custom SSO client runtime ${label} cache TTL must be a positive safe integer`,
      );
    }
  }
  if (cache.negativeTtlMs >= cache.positiveTtlMs) {
    throw new RangeError(
      "Custom SSO client runtime negative cache TTL must be shorter than positive cache TTL",
    );
  }
  if (
    cache.positiveTtlMs
    >= CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS
  ) {
    throw new RangeError(
      "Custom SSO client runtime cache TTL must be shorter than the mutation fence TTL",
    );
  }
}

export type CustomSsoClientRuntimeReader = ReturnType<
  typeof createCustomSsoClientRuntimeReader
>;
