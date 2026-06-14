import type { Redis } from "ioredis";
import { describe, expect, it } from "bun:test";
import {
  oidcClientTokenIndexKey,
  oidcGlobalSessionTokenIndexKey,
  oidcUserTokenIndexKey,
  registerOidcAccessToken,
  revokeOidcAccessTokensForUser,
} from "../token-revocation";

class TokenIndexRedis {
  strings = new Map<string, string>();
  sortedSets = new Map<string, Map<string, number>>();
  expiresAt = new Map<string, number>();

  async eval(_script: string, _keyCount: number, key: string, score: number, member: string) {
    const set = this.sortedSets.get(key) ?? new Map<string, number>();
    set.set(member, score);
    this.sortedSets.set(key, set);
    this.expiresAt.set(key, Math.max(...set.values()));
    return 1;
  }

  async zremrangebyscore(key: string, _min: string, max: number) {
    const set = this.sortedSets.get(key);
    if (!set)
      return 0;
    let removed = 0;
    for (const [member, score] of set) {
      if (score <= max) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  async zrange(key: string) {
    return [...(this.sortedSets.get(key)?.entries() ?? [])]
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
  }

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }

  async del(...keys: string[]) {
    for (const key of keys) {
      this.strings.delete(key);
      this.sortedSets.delete(key);
      this.expiresAt.delete(key);
    }
    return keys.length;
  }

  multi() {
    const operations: Array<() => void> = [];
    const chain = {
      zrem: (key: string, member: string) => {
        operations.push(() => this.sortedSets.get(key)?.delete(member));
        return chain;
      },
      exec: async () => {
        operations.forEach(operation => operation());
        return [];
      },
    };
    return chain;
  }
}

describe("OIDC access token reverse indexes", () => {
  it("keeps an index alive until its latest token expires", async () => {
    const redis = new TokenIndexRedis();
    const later = Date.now() + 3_600_000;
    const sooner = Date.now() + 60_000;
    await registerOidcAccessToken(redis as unknown as Redis, {
      tokenKey: "oidc:model:AccessToken:long",
      userId: 1,
      clientId: "client-a",
      globalSessionId: "global-a",
      expiresAt: later,
    });
    await registerOidcAccessToken(redis as unknown as Redis, {
      tokenKey: "oidc:model:AccessToken:short",
      userId: 1,
      clientId: "client-a",
      globalSessionId: "global-a",
      expiresAt: sooner,
    });

    expect(redis.expiresAt.get(oidcUserTokenIndexKey(1))).toBe(later);
    expect(redis.expiresAt.get(oidcClientTokenIndexKey("client-a"))).toBe(later);
    expect(redis.expiresAt.get(oidcGlobalSessionTokenIndexKey("global-a"))).toBe(later);
  });

  it("revokes token storage and removes every reverse-index membership", async () => {
    const redis = new TokenIndexRedis();
    const tokenKey = "oidc:model:AccessToken:token-a";
    redis.strings.set(tokenKey, JSON.stringify({
      clientId: "client-a",
      extra: { userId: 1, globalSessionId: "global-a" },
    }));
    await registerOidcAccessToken(redis as unknown as Redis, {
      tokenKey,
      userId: 1,
      clientId: "client-a",
      globalSessionId: "global-a",
      expiresAt: Date.now() + 60_000,
    });

    await revokeOidcAccessTokensForUser(redis as unknown as Redis, 1);

    expect(redis.strings.has(tokenKey)).toBe(false);
    expect(await redis.zrange(oidcClientTokenIndexKey("client-a"))).toEqual([]);
    expect(await redis.zrange(oidcGlobalSessionTokenIndexKey("global-a"))).toEqual([]);
  });
});
