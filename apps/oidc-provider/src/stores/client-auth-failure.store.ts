import type { Redis } from "ioredis";
import { createHash } from "node:crypto";

const INCREMENT_WITH_EXPIRY_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return count
`;

function clientAuthFailureKey(clientId: string, ip: string) {
  const identity = createHash("sha256").update(`${clientId}\0${ip}`).digest("base64url");
  return `oidc:client-auth-failures:${identity}`;
}

export function createClientAuthFailureStore(redis: Redis, windowSeconds: number) {
  return {
    async readFailureCount(clientId: string, ip: string) {
      return Number(await redis.get(clientAuthFailureKey(clientId, ip)) ?? 0);
    },
    async recordFailure(clientId: string, ip: string) {
      return Number(await redis.eval(
        INCREMENT_WITH_EXPIRY_SCRIPT,
        1,
        clientAuthFailureKey(clientId, ip),
        windowSeconds,
      ));
    },
    async clear(clientId: string, ip: string) {
      await redis.del(clientAuthFailureKey(clientId, ip));
    },
  };
}

export type ClientAuthFailureStore = ReturnType<typeof createClientAuthFailureStore>;
