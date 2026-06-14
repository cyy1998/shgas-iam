import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { ClientAuthRateLimiter, parseBasicClientId } from "../security/client-auth-rate-limit.ts";
import {
  bindProviderSession,
  providerSessionBindingKey,
  readProviderSessionBinding,
} from "../session/provider-session.ts";

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

describe("provider session binding", () => {
  it("binds the provider session to the remaining global session TTL", async () => {
    const redis = new SecurityRedis();
    redis.ttls.set("global_session:global-1", 120);
    const binding = await bindProviderSession(redis as unknown as Redis, "provider-1", {
      sessionId: "global-1",
      authTime: 123,
      userId: 7,
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
    });

    expect(binding).toMatchObject({ globalSessionId: "global-1", userId: 7, authTime: 123 });
    expect(redis.ttls.get(providerSessionBindingKey("provider-1"))).toBe(120);
    await expect(readProviderSessionBinding(redis as unknown as Redis, "provider-1")).resolves.toEqual(binding);
  });

  it("fails closed when the global session is already gone", async () => {
    const redis = new SecurityRedis();
    await expect(bindProviderSession(redis as unknown as Redis, "provider-1", {
      sessionId: "missing",
      authTime: 123,
      userId: 7,
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
    })).resolves.toBeNull();
  });
});

describe("confidential client authentication rate limiting", () => {
  it("parses client_secret_basic without retaining the secret", () => {
    const header = `Basic ${Buffer.from("client%3Aa:secret-value").toString("base64")}`;
    expect(parseBasicClientId(header)).toBe("client:a");
    expect(parseBasicClientId("Bearer token")).toBeNull();
  });

  it("blocks a client and IP after the configured failure count and can clear it", async () => {
    const redis = new SecurityRedis();
    const limiter = new ClientAuthRateLimiter(redis as unknown as Redis, 2, 60);

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
