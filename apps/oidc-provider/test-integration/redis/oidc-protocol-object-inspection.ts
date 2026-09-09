import type Redis from "ioredis";
import { artifactKey } from "../../src/storage/redis-adapter.ts";

/** Owner observation of persisted protocol bytes and absolute expiry; no find-time side effects. */
export function createOidcProtocolObjectInspection(redis: Pick<Redis, "get" | "pexpiretime">, keyPrefix = "") {
  return {
    async observe(model: string, id: string) {
      const key = artifactKey(model, id, keyPrefix);
      return { payload: await redis.get(key), expiresAt: await redis.pexpiretime(key) };
    },
  };
}
