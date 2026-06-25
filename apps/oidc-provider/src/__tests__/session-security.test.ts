import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { createClientAuthRateLimiter, parseBasicClientId } from "../security/client-auth-rate-limit.ts";
import { createClientAuthFailureStore } from "../stores/client-auth-failure.store.ts";

class SecurityRedis {
  values = new Map<string, string>();
  ttls = new Map<string, number>();

  async ttl(key: string) {
    return this.ttls.get(key) ?? -2;
  }

  async set(key: string, value: string, _mode: string, ttl: number) {
    this.values.set(key, value);
    this.ttls.set(key, ttl);
    return "OK";
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async del(key: string) {
    this.values.delete(key);
    this.ttls.delete(key);
    return 1;
  }

  async eval(_script: string, _keys: number, key: string, windowSeconds: number) {
    const count = Number(this.values.get(key) ?? 0) + 1;
    this.values.set(key, String(count));
    this.ttls.set(key, windowSeconds);
    return count;
  }
}

describe("confidential client authentication rate limiting", () => {
  it("parses client_secret_basic without retaining the secret", () => {
    const header = `Basic ${Buffer.from("client%3Aa:secret-value").toString("base64")}`;
    expect(parseBasicClientId(header)).toBe("client:a");
    expect(parseBasicClientId("Bearer token")).toBeNull();
  });

  it("blocks a client and IP after the configured failure count and can clear it", async () => {
    const redis = new SecurityRedis();
    const limiter = createClientAuthRateLimiter(createClientAuthFailureStore(redis as unknown as Redis, 60), 2);

    expect(await limiter.isBlocked("client-a", "127.0.0.1")).toBe(false);
    await limiter.recordFailure("client-a", "127.0.0.1");
    expect(await limiter.isBlocked("client-a", "127.0.0.1")).toBe(false);
    await limiter.recordFailure("client-a", "127.0.0.1");
    expect(await limiter.isBlocked("client-a", "127.0.0.1")).toBe(true);
    expect(await limiter.isBlocked("client-a", "127.0.0.2")).toBe(false);
    await limiter.clear("client-a", "127.0.0.1");
    expect(await limiter.isBlocked("client-a", "127.0.0.1")).toBe(false);
  });
});
