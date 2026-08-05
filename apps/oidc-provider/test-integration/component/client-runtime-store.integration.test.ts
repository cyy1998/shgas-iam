import type { OidcClientRuntimeDto } from "@iam/domain/client";
import {
  oidcClientRuntimeCacheKey,
} from "@iam/api-core/oidc";
import {
  ClientStatus,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { describe, expect, it } from "vitest";
import { createOidcClientRuntimeCache, createOidcClientRuntimeStore } from "../../src/stores/client-runtime.store.ts";

class ClientRuntimeRedis {
  values = new Map<string, string>();
  ttls = new Map<string, number>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, _mode: string, ttl: number) {
    this.values.set(key, value);
    this.ttls.set(key, ttl);
    return "OK";
  }

  async del(key: string) {
    this.values.delete(key);
    this.ttls.delete(key);
    return 1;
  }
}

const activeClient: OidcClientRuntimeDto = {
  id: 7,
  clientCode: "client-a",
  clientName: "Client A",
  status: ClientStatus.Enable,
  isDelete: false,
  oidcEnabled: true,
  oidcConfigVersion: 3,
  oidcConfig: {
    clientType: OidcClientType.Public,
    tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
    redirectUris: ["https://client.example/callback"],
    postLogoutRedirectUris: [],
    allowedScopes: [OidcScope.OpenId],
  },
};

describe("oIDC client runtime store", () => {
  it("reads through DB lookup, caches runtime metadata, and reuses the cache namespace", async () => {
    const redis = new ClientRuntimeRedis();
    let calls = 0;
    const store = createOidcClientRuntimeStore({
      repository: {
        findRuntimeRecord: async () => {
          calls += 1;
          return activeClient;
        },
      },
      cache: createOidcClientRuntimeCache(redis as never, 60),
    });

    await expect(store.findRuntime("client-a")).resolves.toMatchObject({
      client_id: "client-a",
      oidc_config_version: 3,
    });
    await expect(store.findRuntime("client-a")).resolves.toMatchObject({
      client_id: "client-a",
      oidc_config_version: 3,
    });

    expect(calls).toBe(1);
    expect(redis.values.has(oidcClientRuntimeCacheKey("client-a"))).toBe(true);
    expect(redis.ttls.get(oidcClientRuntimeCacheKey("client-a"))).toBe(60);
  });

  it("removes malformed cached metadata and falls back to DB lookup", async () => {
    const redis = new ClientRuntimeRedis();
    redis.values.set(oidcClientRuntimeCacheKey("client-a"), "{not-json");
    const store = createOidcClientRuntimeStore({
      repository: {
        findRuntimeRecord: async () => activeClient,
      },
      cache: createOidcClientRuntimeCache(redis as never, 60),
    });

    await expect(store.findRuntime("client-a")).resolves.toMatchObject({ client_id: "client-a" });
    expect(JSON.parse(redis.values.get(oidcClientRuntimeCacheKey("client-a")) ?? "{}")).toMatchObject({
      client_id: "client-a",
    });
  });
});
