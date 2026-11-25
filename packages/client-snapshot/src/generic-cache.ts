import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import type { ClientSnapshotRedis } from "./contract";

export type GenericClientCacheRedis = ClientSnapshotRedis;

export interface GenericClientCacheIdentity {
  readonly clientCode: string;
  readonly clientSecret: string;
}

type LookupKind = "code" | "secret";

interface GenericClientCacheSource<T> {
  getClientByCode: (code: string) => Promise<T | null>;
  getClientBySecret: (secret: string) => Promise<T | null>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const CLIENT_CACHE_PREFIX = "cache:client";
const INVALIDATION_GENERATION_KEY = `${CLIENT_CACHE_PREFIX}:invalidation-generation`;
export const GENERIC_CLIENT_CACHE_INVENTORY = [
  cacheKey("code", "*"),
  cacheKey("secret", "*"),
  INVALIDATION_GENERATION_KEY,
] as const;

const READ = `
local generation = redis.call("GET", KEYS[1])
if not generation then
  generation = ARGV[1]
  redis.call("SET", KEYS[1], generation)
end
local kind = redis.call("TYPE", KEYS[2]).ok
if kind == "string" then
  return {generation, redis.call("GET", KEYS[2])}
end
if kind ~= "none" then redis.call("DEL", KEYS[2]) end
return {generation, false}
`;

const DELETE_CORRUPT = `
if redis.call("TYPE", KEYS[1]).ok == "string" and redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("DEL", KEYS[1])
end
`;

const PUBLISH = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("MSET", KEYS[2], ARGV[2], KEYS[3], ARGV[2])
return 1
`;

const INVALIDATE = `
redis.call("SET", KEYS[1], ARGV[1])
return redis.call("DEL", unpack(KEYS, 2))
`;

function cacheKey(kind: LookupKind, value: string) {
  return `${CLIENT_CACHE_PREFIX}:${kind}:${value}`;
}

function clientKeys(client: GenericClientCacheIdentity) {
  return [cacheKey("code", client.clientCode), cacheKey("secret", client.clientSecret)];
}

function matches(client: GenericClientCacheIdentity, kind: LookupKind, value: string) {
  return (kind === "code" ? client.clientCode : client.clientSecret) === value;
}

function decode<T>(schema: ZodType<T>, payload: string) {
  let value: unknown;
  try {
    value = JSON.parse(payload, (key, field: unknown) =>
      (key === "createTime" || key === "updateTime") && typeof field === "string" && ISO_DATE.test(field)
        ? new Date(field)
        : field,
    );
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createGenericClientCache<T extends GenericClientCacheIdentity>(options: {
  redis: GenericClientCacheRedis;
  source: GenericClientCacheSource<T>;
  schema: ZodType<T>;
}) {
  const { redis, schema, source } = options;

  async function evalCache(script: string, keys: string[], ...args: string[]) {
    try {
      return await redis.eval(script, keys.length, ...keys, ...args);
    } catch {
      // Redis command errors can carry the key and payload, including the Internal API Secret.
      throw new Error("Generic Client cache unavailable");
    }
  }

  async function read(kind: LookupKind, value: string, load: () => Promise<T | null>): Promise<T | null> {
    const key = cacheKey(kind, value);
    for (let attempt = 0; attempt < 2; attempt++) {
      // Either lookup can backfill both aliases, so observe the shared generation before loading the source.
      const observed = await evalCache(READ, [INVALIDATION_GENERATION_KEY, key], randomUUID());
      if (
        !Array.isArray(observed) ||
        observed.length !== 2 ||
        typeof observed[0] !== "string" ||
        (observed[1] !== null && typeof observed[1] !== "string")
      ) {
        throw new Error("Invalid generic Client cache read result");
      }
      const [generation, payload] = observed;
      if (typeof payload === "string") {
        const cached = decode(schema, payload);
        if (cached && matches(cached, kind, value)) return cached;
        await evalCache(DELETE_CORRUPT, [key], payload);
      }
      const current = await load();
      if (current === null) return null;
      if (!matches(current, kind, value))
        throw new Error("Generic Client source lookup returned a mismatched identity");
      const published = await evalCache(
        PUBLISH,
        [INVALIDATION_GENERATION_KEY, ...clientKeys(current)],
        generation,
        JSON.stringify(current),
      );
      if (published === 1) return current;
      if (published !== 0) throw new Error("Invalid generic Client cache publish result");
    }
    throw new Error("Generic Client cache changed repeatedly during lookup");
  }

  return {
    getClientByCode: (code: string) => read("code", code, () => source.getClientByCode(code)),
    getClientBySecret: (secret: string) => read("secret", secret, () => source.getClientBySecret(secret)),
  };
}

export function createGenericClientCacheInvalidation({ redis }: { redis: GenericClientCacheRedis }) {
  async function invalidate(...clients: GenericClientCacheIdentity[]) {
    const keys = [INVALIDATION_GENERATION_KEY, ...new Set(clients.flatMap(clientKeys))];
    try {
      await redis.eval(INVALIDATE, keys.length, ...keys, randomUUID());
    } catch {
      throw new Error("Generic Client cache invalidation failed");
    }
  }
  return {
    invalidateClient: (client: GenericClientCacheIdentity) => invalidate(client),
    invalidateUpdatedClient: (oldClient: GenericClientCacheIdentity, newClient: GenericClientCacheIdentity) =>
      invalidate(oldClient, newClient),
  };
}
