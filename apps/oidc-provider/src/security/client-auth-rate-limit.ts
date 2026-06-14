import type { Redis } from "ioredis";
import { createHash } from "node:crypto";

const INCREMENT_WITH_EXPIRY_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return count
`;

export function parseBasicClientId(authorization: string | undefined) {
  if (!authorization?.startsWith("Basic "))
    return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator > 0 ? decodeURIComponent(decoded.slice(0, separator)) : null;
  }
  catch {
    return null;
  }
}

export class ClientAuthRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly windowSeconds: number,
  ) {}

  private key(clientId: string, ip: string) {
    const identity = createHash("sha256").update(`${clientId}\0${ip}`).digest("base64url");
    return `oidc:client-auth-failures:${identity}`;
  }

  async isBlocked(clientId: string, ip: string) {
    return Number(await this.redis.get(this.key(clientId, ip)) ?? 0) >= this.limit;
  }

  async recordFailure(clientId: string, ip: string) {
    return Number(await this.redis.eval(
      INCREMENT_WITH_EXPIRY_SCRIPT,
      1,
      this.key(clientId, ip),
      this.windowSeconds,
    ));
  }

  async clear(clientId: string, ip: string) {
    await this.redis.del(this.key(clientId, ip));
  }
}
