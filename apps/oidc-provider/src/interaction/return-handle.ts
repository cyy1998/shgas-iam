import type { Redis } from "ioredis";
import { randomBytes, timingSafeEqual } from "node:crypto";

const CONSUME_SCRIPT = `
local value = redis.call("GET", KEYS[1])
if not value then return nil end
redis.call("DEL", KEYS[1])
return value
`;

export type OidcReturnHandlePayload = {
  interactionUid: string;
  clientId: string;
  oidcConfigVersion: number;
  browserBinding: string;
};

const returnHandleKey = (handle: string) => `oidc:login-return:${handle}`;

export function createOpaqueValue() {
  return randomBytes(32).toString("base64url");
}

export function secureStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

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
