import type { OidcStateRedis } from "./state";
import { createHash } from "node:crypto";
import { z } from "zod";
import { OidcStateUnavailableError } from "./errors";

/** The first failed Basic authentication starts a fixed window for this Client and IP. */
export function createOidcClientAuthRateLimiter(options: {
  redis: OidcStateRedis;
  namespace: string;
  limit?: number;
  windowSeconds?: number;
}) {
  const namespace = z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(options.namespace);
  const limit = z
    .number()
    .int()
    .positive()
    .parse(options.limit ?? 5);
  const windowSeconds = z
    .number()
    .int()
    .positive()
    .parse(options.windowSeconds ?? 60);
  function key(clientId: string, ip: string) {
    const identity = createHash("sha256").update(`${clientId}\0${ip}`).digest("base64url");
    return `${namespace}:client-auth-failures:${identity}`;
  }
  async function execute(script: string, clientId: string, ip: string, ...args: string[]) {
    try {
      return await options.redis.eval(script, 1, key(clientId, ip), ...args);
    }
    catch {
      throw new OidcStateUnavailableError();
    }
  }
  return {
    async isBlocked(clientId: string, ip: string) {
      return Number(await execute("return redis.call('GET',KEYS[1]) or '0'", clientId, ip)) >= limit;
    },
    async recordFailure(clientId: string, ip: string) {
      await execute(
        "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return count",
        clientId,
        ip,
        String(windowSeconds),
      );
    },
    async clear(clientId: string, ip: string) {
      await execute("return redis.call('DEL',KEYS[1])", clientId, ip);
    },
  };
}
export type OidcClientAuthRateLimiter = ReturnType<typeof createOidcClientAuthRateLimiter>;
