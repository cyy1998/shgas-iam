import type { Redis } from "ioredis";
import {
  oidcClientTokenIndexKey,
  oidcGlobalSessionTokenIndexKey,
  oidcUserTokenIndexKey,
} from "@iam/api-core/oidc";
import {
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { describe, expect, it } from "vitest";
import { toOidcClientRuntimeMetadata } from "../repositories/client-metadata.ts";
import { RedisOidcAdapter, revokeClientProtocolObjects } from "../storage/redis-adapter.ts";
import { createOidcTokenStore } from "../stores/token.store.ts";

class FakeRedis {
  strings = new Map<string, string>();
  sortedSets = new Map<string, Map<string, number>>();

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }

  async mget(...keys: string[]) {
    return keys.map(key => this.strings.get(key) ?? null);
  }

  async set(key: string, value: string) {
    this.strings.set(key, value);
    return "OK";
  }

  async del(...keys: string[]) {
    for (const key of keys) {
      this.strings.delete(key);
      this.sortedSets.delete(key);
    }
    return keys.length;
  }

  async zrange(key: string) {
    return [...(this.sortedSets.get(key)?.entries() ?? [])]
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
  }

  async zremrangebyscore(key: string, _min: string, max: number) {
    const set = this.sortedSets.get(key);
    if (!set)
      return 0;
    let removed = 0;
    for (const [member, score] of set) {
      if (score <= Number(max)) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  async eval(script: string, _keyCount: number, key: string, consumed: string | number, timestamp: string) {
    if (script.includes("ZADD")) {
      const set = this.sortedSets.get(key) ?? new Map<string, number>();
      set.set(timestamp, Number(consumed));
      this.sortedSets.set(key, set);
      return 1;
    }
    if (!this.strings.has(key))
      return 0;
    if (this.strings.has(String(consumed)))
      return -1;
    this.strings.set(String(consumed), timestamp);
    return 1;
  }

  multi() {
    const operations: Array<() => void> = [];
    const chain = {
      set: (key: string, value: string) => {
        operations.push(() => this.strings.set(key, value));
        return chain;
      },
      zadd: (key: string, score: number, member: string) => {
        operations.push(() => {
          const set = this.sortedSets.get(key) ?? new Map<string, number>();
          set.set(member, score);
          this.sortedSets.set(key, set);
        });
        return chain;
      },
      zrem: (key: string, member: string) => {
        operations.push(() => this.sortedSets.get(key)?.delete(member));
        return chain;
      },
      expire: () => chain,
      exec: async () => {
        operations.forEach(operation => operation());
        return [];
      },
    };
    return chain;
  }
}

function createAdapter(model: string, redis: FakeRedis, version: { value: number | null }) {
  const tokens = createOidcTokenStore(redis as unknown as Redis);
  return new RedisOidcAdapter(model, redis as unknown as Redis, {
    clientVersions: {
      findActiveVersion: async () => version.value,
    },
    providerSessions: {
      consumeStaged: async () => null,
      read: async () => null,
    },
    tokens,
  });
}

function createMultiClientAdapter(model: string, redis: FakeRedis, versions: Map<string, number | null>) {
  const tokens = createOidcTokenStore(redis as unknown as Redis);
  return new RedisOidcAdapter(model, redis as unknown as Redis, {
    clientVersions: {
      findActiveVersion: async (clientId: string) => versions.get(clientId) ?? null,
    },
    providerSessions: {
      consumeStaged: async () => null,
      read: async () => null,
    },
    tokens,
  });
}

describe("redis OIDC adapter", () => {
  it("returns undefined when Redis protocol state is missing", async () => {
    const adapter = createAdapter("AuthorizationCode", new FakeRedis(), { value: 3 });
    await expect(adapter.find("missing")).resolves.toBeUndefined();
  });

  it("atomically consumes an authorization code only once", async () => {
    const redis = new FakeRedis();
    const version = { value: 3 };
    const adapter = createAdapter("AuthorizationCode", redis, version);
    await adapter.upsert("code-1", { clientId: "client-a", accountId: "subject-a" }, 300);

    const results = await Promise.allSettled([adapter.consume("code-1"), adapter.consume("code-1")]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    await expect(adapter.find("code-1")).resolves.toMatchObject({ consumed: expect.any(Number) });
  });

  it("rejects artifacts after the client configuration version changes", async () => {
    const redis = new FakeRedis();
    const version = { value: 3 };
    const adapter = createAdapter("Interaction", redis, version);
    await adapter.upsert("interaction-1", { params: { client_id: "client-a" } }, 600);

    version.value = 4;

    await expect(adapter.find("interaction-1")).resolves.toBeUndefined();
    expect(redis.strings.has("oidc:model:Interaction:interaction-1")).toBe(false);
  });

  it("validates every client version referenced by a provider session", async () => {
    const redis = new FakeRedis();
    const versions = new Map<string, number | null>([["client-a", 1], ["client-b", 2]]);
    const adapter = createMultiClientAdapter("Session", redis, versions);
    await adapter.upsert("session-1", {
      uid: "provider-session-1",
      authorizations: {
        "client-a": {},
        "client-b": {},
      },
    }, 3600);

    versions.set("client-b", 3);

    await expect(adapter.find("session-1")).resolves.toBeUndefined();
  });

  it("registers and removes user, client, and global session token indexes", async () => {
    const redis = new FakeRedis();
    const adapter = createAdapter("AccessToken", redis, { value: 3 });
    await adapter.upsert("token-1", {
      clientId: "client-a",
      accountId: "subject-a",
      extra: { userId: 42, globalSessionId: "global-a" },
    }, 3600);

    const tokenKey = "oidc:model:AccessToken:token-1";
    expect(await redis.zrange(oidcUserTokenIndexKey(42))).toEqual([tokenKey]);
    expect(await redis.zrange(oidcClientTokenIndexKey("client-a"))).toEqual([tokenKey]);
    expect(await redis.zrange(oidcGlobalSessionTokenIndexKey("global-a"))).toEqual([tokenKey]);

    await adapter.destroy("token-1");

    expect(await redis.zrange(oidcUserTokenIndexKey(42))).toEqual([]);
    expect(await redis.zrange(oidcClientTokenIndexKey("client-a"))).toEqual([]);
    expect(await redis.zrange(oidcGlobalSessionTokenIndexKey("global-a"))).toEqual([]);
  });

  it("revokes all indexed protocol objects for an invalidated client", async () => {
    const redis = new FakeRedis();
    const version = { value: 3 };
    await createAdapter("AuthorizationCode", redis, version).upsert("code-1", { clientId: "client-a" }, 300);
    await createAdapter("Interaction", redis, version).upsert(
      "interaction-1",
      { params: { client_id: "client-a" } },
      600,
    );

    await revokeClientProtocolObjects(
      redis as unknown as Redis,
      createOidcTokenStore(redis as unknown as Redis),
      "client-a",
    );

    expect(redis.strings.has("oidc:model:AuthorizationCode:code-1")).toBe(false);
    expect(redis.strings.has("oidc:model:Interaction:interaction-1")).toBe(false);
  });
});

describe("dynamic OIDC client metadata", () => {
  it("contains no database secret hash", () => {
    const metadata = toOidcClientRuntimeMetadata({
      id: 7,
      clientCode: "client-a",
      clientName: "Client A",
      status: 1,
      isDelete: false,
      oidcEnabled: true,
      oidcConfigVersion: 3,
      oidcConfig: {
        clientType: OidcClientType.Confidential,
        tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic,
        redirectUris: ["https://client.example.com/callback"],
        postLogoutRedirectUris: [],
        allowedScopes: [OidcScope.OpenId],
      },
    });

    expect(metadata.client_secret).toBe("__iam_bcrypt_managed__");
    expect(metadata).not.toHaveProperty("oidcSecretHash");
    expect(JSON.stringify(metadata)).not.toContain("$2");
  });
});
