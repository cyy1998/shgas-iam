import type { Redis } from "ioredis";
import type { OidcReturnHandlePayload } from "../interaction/return-handle.ts";
import { createOpaqueValue } from "../interaction/return-handle.ts";

const CONSUME_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then return nil end
redis.call("DEL", KEYS[1])
return value
`;

const returnHandleKey = (handle: string) => `oidc:login-return:${handle}`;

export function createOidcReturnHandleStore(redis: Redis) {
  return {
    create(payload: OidcReturnHandlePayload, ttlSeconds: number) {
      return createOidcReturnHandle(redis, payload, ttlSeconds);
    },
    consume(handle: string) {
      return consumeOidcReturnHandle(redis, handle);
    },
  };
}

export type OidcReturnHandleStore = ReturnType<typeof createOidcReturnHandleStore>;

export async function createOidcReturnHandle(
  redis: Redis,
  payload: OidcReturnHandlePayload,
  ttlSeconds: number,
) {
  const handle = createOpaqueValue();
  await redis.set(returnHandleKey(handle), JSON.stringify(payload), "EX", ttlSeconds);
  return handle;
}

export async function consumeOidcReturnHandle(redis: Redis, handle: string) {
  if (!/^[\w-]{43}$/.test(handle))
    return null;
  const value = await redis.eval(CONSUME_SCRIPT, 1, returnHandleKey(handle));
  if (typeof value !== "string")
    return null;
  try {
    return JSON.parse(value) as OidcReturnHandlePayload;
  }
  catch {
    return null;
  }
}
