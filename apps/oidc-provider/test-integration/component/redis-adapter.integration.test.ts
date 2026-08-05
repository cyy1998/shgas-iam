import type { Redis } from "ioredis";
import type { CreateOidcAuthorizationCodeSnapshotInput } from "../../src/provider/claims-snapshot.ts";
import type { ProviderSessionLifecycleFence } from "../../src/session/provider-session.ts";
import {
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { errors } from "oidc-provider";
import { describe, expect, it } from "vitest";
import { toOidcClientRuntimeMetadata } from "../../src/provider/client-runtime-metadata.ts";
import { RedisOidcAdapter, revokeClientProtocolObjects } from "../../src/storage/redis-adapter.ts";
import { createOidcTokenStore } from "../../src/stores/token.store.ts";

class FakeRedis {
  strings = new Map<string, string>();
  sortedSets = new Map<string, Map<string, number>>();
  mgetCalls: string[][] = [];

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }

  async mget(...keys: string[]) {
    this.mgetCalls.push(keys);
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

function createAdapter(
  model: string,
  redis: FakeRedis,
  version: { value: number | null },
  options: {
    destroyProviderSession?: (
      sessionUid: string,
      expected?: ProviderSessionLifecycleFence,
    ) => Promise<boolean>;
  } = {},
) {
  const tokens = createOidcTokenStore(redis as unknown as Redis);
  const oidcSession = createOidcSessionMock();
  return new RedisOidcAdapter(model, redis as unknown as Redis, {
    claims: createClaimsSnapshotMock(),
    clientVersions: {
      findActiveVersion: async () => version.value,
    },
    oidcSession,
    providerSessions: {
      consumeStaged: async () => null,
      destroyProviderSession: options.destroyProviderSession ?? (async () => true),
      ensureClientBinding: async () => ({
        globalSessionId: "principal-a",
        principalSessionId: "principal-a",
        bindingId: "binding-a",
        clientCode: "client-a",
        userId: 42,
        accountId: "subject-a",
        authTime: 1_782_260_000,
        oidcConfigVersion: version.value ?? 0,
        expiresAt: 1_782_263_600,
      }),
      read: async () => ({
        globalSessionId: "principal-a",
        principalSessionId: "principal-a",
        bindingId: "binding-a",
        clientCode: "client-a",
        userId: 42,
        accountId: "subject-a",
        authTime: 1_782_260_000,
        oidcConfigVersion: version.value ?? 0,
        expiresAt: 1_782_263_600,
      }),
      readPrincipalAnchor: async () => createPrincipalAnchor(),
    },
    tokens,
  });
}

function createMultiClientAdapter(model: string, redis: FakeRedis, versions: Map<string, number | null>) {
  const tokens = createOidcTokenStore(redis as unknown as Redis);
  const oidcSession = createOidcSessionMock();
  return new RedisOidcAdapter(model, redis as unknown as Redis, {
    claims: createClaimsSnapshotMock(),
    clientVersions: {
      findActiveVersion: async (clientId: string) => versions.get(clientId) ?? null,
    },
    oidcSession,
    providerSessions: {
      consumeStaged: async () => null,
      destroyProviderSession: async () => true,
      ensureClientBinding: async () => null,
      read: async () => null,
      readPrincipalAnchor: async () => null,
    },
    tokens,
  });
}

function createOidcSessionMock() {
  return {
    registerAuthorizationCodeArtifact: async () => true,
    consumeAuthorizationCodeArtifact: async () => ({ artifact: { artifactId: "artifact-a" } }),
    registerAccessTokenCredential: async () => ({
      credentialId: "credential-a",
      principalSessionId: "principal-a",
      clientCode: "client-a",
    } as never),
    resolveAccessTokenCredential: async (externalToken: string) => ({
      credential: {
        credentialId: "credential-a",
        principalSessionId: "principal-a",
        clientCode: "client-a",
      },
      metadata: {
        providerTokenKey: `oidc:model:AccessToken:${externalToken}`,
        providerTokenId: externalToken,
        oidcConfigVersion: 3,
      },
    } as never),
    revokeAccessTokenCredential: async () => undefined,
    revokeClientProtocol: async () => undefined,
  };
}

function createClaimsSnapshotMock() {
  return {
    createAuthorizationCodeSnapshot: async (input: CreateOidcAuthorizationCodeSnapshotInput) => ({
      version: 1 as const,
      ...input,
      claims: { sub: input.subjectIdentifier },
    }),
  };
}

function createPrincipalAnchor(principalSessionId = "principal-a") {
  return {
    accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
    generation: "generation-a",
    principalSessionId,
  };
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
    await adapter.upsert("code-1", {
      clientId: "client-a",
      accountId: "subject-a",
      sessionUid: "provider-session-a",
      scope: "openid",
    }, 300);

    const results = await Promise.allSettled([adapter.consume("code-1"), adapter.consume("code-1")]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    await expect(adapter.find("code-1")).resolves.toMatchObject({ consumed: expect.any(Number) });
  });

  it("consumes staged provider session bindings before authorization code registration", async () => {
    const redis = new FakeRedis();
    const tokens = createOidcTokenStore(redis as unknown as Redis);
    const stagedBinding = {
      globalSessionId: "principal-a",
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
      userId: 42,
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      authTime: 1_782_260_000,
      oidcConfigVersion: 3,
      expiresAt: 1_782_263_600,
    };
    let consumeStagedInput: {
      accountId: string;
      authorizationAttemptId: string;
      clientCode: string;
      providerSessionUid: string;
    } | undefined;
    let registeredBinding: unknown;

    const adapter = new RedisOidcAdapter("AuthorizationCode", redis as unknown as Redis, {
      claims: createClaimsSnapshotMock(),
      clientVersions: {
        findActiveVersion: async () => 3,
      },
      oidcSession: {
        ...createOidcSessionMock(),
        registerAuthorizationCodeArtifact: async (input: { binding: unknown }) => {
          registeredBinding = input.binding;
          return true;
        },
      },
      providerSessions: {
        destroyProviderSession: async () => true,
        ensureClientBinding: async () => null,
        readPrincipalAnchor: async () => null,
        read: async () => null,
        consumeStaged: async (input) => {
          consumeStagedInput = input;
          return stagedBinding;
        },
      },
      tokens,
    });

    await adapter.upsert("code-1", {
      clientId: "client-a",
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      authorizationAttemptId: "interaction-a",
      clientCode: "client-a",
      sessionUid: "provider-session-a",
      scope: "openid",
    }, 300);

    expect(consumeStagedInput).toEqual({
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      authorizationAttemptId: "interaction-a",
      clientCode: "client-a",
      providerSessionUid: "provider-session-a",
    });
    expect(registeredBinding).toBe(stagedBinding);
  });

  it("creates and binds the Claims Snapshot before persisting an authorization code", async () => {
    const redis = new FakeRedis();
    const tokens = createOidcTokenStore(redis as unknown as Redis);
    const binding = {
      globalSessionId: "principal-a",
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
      userId: 42,
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      authTime: 1_782_260_000,
      oidcConfigVersion: 3,
      expiresAt: 1_782_263_600,
    };
    const snapshot = {
      version: 1 as const,
      subjectIdentifier: binding.accountId,
      clientId: "client-a",
      scopes: ["openid", "profile"],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-session-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
      claims: { sub: binding.accountId, preferred_username: "alice", name: "Alice" },
    };
    const snapshotInputs: unknown[] = [];
    let registeredPayload: unknown;
    const adapter = new RedisOidcAdapter("AuthorizationCode", redis as unknown as Redis, {
      claims: {
        createAuthorizationCodeSnapshot: async (input: unknown) => {
          snapshotInputs.push(input);
          expect(redis.strings.has("oidc:model:AuthorizationCode:code-1")).toBe(false);
          return snapshot;
        },
      },
      clientVersions: { findActiveVersion: async () => 3 },
      oidcSession: {
        ...createOidcSessionMock(),
        registerAuthorizationCodeArtifact: async (input: { payload: unknown }) => {
          registeredPayload = input.payload;
          return true;
        },
      },
      providerSessions: {
        read: async () => binding,
        consumeStaged: async () => null,
        ensureClientBinding: async () => binding,
        readPrincipalAnchor: async () => createPrincipalAnchor(binding.principalSessionId),
      },
      tokens,
    } as never);

    await adapter.upsert("code-1", {
      clientId: "client-a",
      accountId: binding.accountId,
      sessionUid: "provider-session-a",
      scope: "openid profile",
    }, 300);

    expect(snapshotInputs).toEqual([{
      subjectIdentifier: binding.accountId,
      clientId: "client-a",
      scopes: ["openid", "profile"],
      oidcConfigVersion: 3,
      providerSessionUid: "provider-session-a",
      principalSessionId: "principal-a",
      providerSessionBindingId: "binding-a",
    }]);
    expect(registeredPayload).toMatchObject({ claimsSnapshot: snapshot });
    expect(JSON.parse(redis.strings.get("oidc:model:AuthorizationCode:code-1") ?? "null"))
      .toMatchObject({ claimsSnapshot: snapshot });
  });

  it("binds each client Claims Snapshot to its own Provider Session client lifecycle", async () => {
    const redis = new FakeRedis();
    const accountId = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";
    const bindingA = {
      globalSessionId: "principal-a",
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
      userId: 42,
      accountId,
      authTime: 1_782_260_000,
      oidcConfigVersion: 1,
      expiresAt: 1_782_263_600,
    };
    const bindingB = {
      ...bindingA,
      bindingId: "binding-b",
      clientCode: "client-b",
      oidcConfigVersion: 2,
    };
    const snapshotInputs: Array<{
      clientId: string;
      providerSessionBindingId: string;
      principalSessionId: string;
    }> = [];
    const registeredBindings: unknown[] = [];
    const adapter = new RedisOidcAdapter("AuthorizationCode", redis as unknown as Redis, {
      claims: {
        createAuthorizationCodeSnapshot: async (input: CreateOidcAuthorizationCodeSnapshotInput) => {
          snapshotInputs.push(input);
          return {
            version: 1,
            ...input,
            claims: { sub: input.subjectIdentifier },
          };
        },
      },
      clientVersions: {
        findActiveVersion: async (clientId: string) => clientId === "client-a" ? 1 : 2,
      },
      oidcSession: {
        ...createOidcSessionMock(),
        registerAuthorizationCodeArtifact: async (input: { binding: unknown }) => {
          registeredBindings.push(input.binding);
          return true;
        },
      },
      providerSessions: {
        consumeStaged: async () => null,
        ensureClientBinding: async (input: { clientCode: string }) => input.clientCode === "client-b"
          ? bindingB
          : bindingA,
        read: async (_sessionUid: string, clientCode: string) => clientCode === "client-b"
          ? bindingB
          : bindingA,
        readPrincipalAnchor: async () => createPrincipalAnchor(),
      },
      tokens: createOidcTokenStore(redis as unknown as Redis),
    } as never);

    await adapter.upsert("code-a", {
      accountId,
      clientId: "client-a",
      scope: "openid",
      sessionUid: "provider-session-a",
    }, 300);
    await adapter.upsert("code-b", {
      accountId,
      clientId: "client-b",
      scope: "openid",
      sessionUid: "provider-session-a",
    }, 300);

    expect(snapshotInputs).toEqual([
      expect.objectContaining({
        clientId: "client-a",
        principalSessionId: "principal-a",
        providerSessionBindingId: "binding-a",
      }),
      expect.objectContaining({
        clientId: "client-b",
        principalSessionId: "principal-a",
        providerSessionBindingId: "binding-b",
      }),
    ]);
    expect(registeredBindings).toEqual([bindingA, bindingB]);
  });

  it("does not issue an authorization code without a provider-session binding", async () => {
    const redis = new FakeRedis();
    let snapshotCalls = 0;
    let registrationCalls = 0;
    const adapter = new RedisOidcAdapter("AuthorizationCode", redis as unknown as Redis, {
      claims: {
        createAuthorizationCodeSnapshot: async () => {
          snapshotCalls += 1;
          throw new Error("snapshot must not be created without a binding");
        },
      },
      clientVersions: { findActiveVersion: async () => 3 },
      oidcSession: {
        ...createOidcSessionMock(),
        registerAuthorizationCodeArtifact: async () => {
          registrationCalls += 1;
          return true;
        },
      },
      providerSessions: {
        destroyProviderSession: async () => true,
        read: async () => null,
        consumeStaged: async () => null,
        ensureClientBinding: async () => null,
        readPrincipalAnchor: async () => createPrincipalAnchor(),
      },
      tokens: createOidcTokenStore(redis as unknown as Redis),
    });

    await expect(adapter.upsert("code-1", {
      clientId: "client-a",
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      sessionUid: "provider-session-a",
      scope: "openid",
    }, 300)).rejects.toThrow("provider-session binding");

    expect(snapshotCalls).toBe(0);
    expect(registrationCalls).toBe(0);
    expect(redis.strings.has("oidc:model:AuthorizationCode:code-1")).toBe(false);
  });

  it("does not issue an authorization code when Claims Snapshot creation fails", async () => {
    const redis = new FakeRedis();
    const binding = {
      globalSessionId: "principal-a",
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
      userId: 42,
      accountId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      authTime: 1_782_260_000,
      oidcConfigVersion: 3,
      expiresAt: 1_782_263_600,
    };
    let registrationCalls = 0;
    const adapter = new RedisOidcAdapter("AuthorizationCode", redis as unknown as Redis, {
      claims: {
        createAuthorizationCodeSnapshot: async () => {
          throw new errors.TemporarilyUnavailable();
        },
      },
      clientVersions: { findActiveVersion: async () => 3 },
      oidcSession: {
        ...createOidcSessionMock(),
        registerAuthorizationCodeArtifact: async () => {
          registrationCalls += 1;
          return true;
        },
      },
      providerSessions: {
        read: async () => binding,
        consumeStaged: async () => null,
        ensureClientBinding: async () => binding,
        readPrincipalAnchor: async () => createPrincipalAnchor(binding.principalSessionId),
      },
      tokens: createOidcTokenStore(redis as unknown as Redis),
    } as never);

    await expect(adapter.upsert("code-1", {
      clientId: "client-a",
      accountId: binding.accountId,
      sessionUid: "provider-session-a",
      scope: "openid iam:authorization",
    }, 300)).rejects.toBeInstanceOf(errors.TemporarilyUnavailable);

    expect(registrationCalls).toBe(0);
    expect(redis.strings.has("oidc:model:AuthorizationCode:code-1")).toBe(false);
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

  it("keeps access token reverse indexes in Kernel and removes provider token payload", async () => {
    const redis = new FakeRedis();
    const adapter = createAdapter("AccessToken", redis, { value: 3 });
    await adapter.upsert("token-1", {
      clientId: "client-a",
      accountId: "subject-a",
      extra: { userId: 42, globalSessionId: "global-a" },
    }, 3600);

    const tokenKey = "oidc:model:AccessToken:token-1";
    expect(redis.strings.has(tokenKey)).toBe(true);
    expect([...redis.sortedSets.keys()].filter(key => key.includes("-tokens:"))).toEqual([]);

    await adapter.destroy("token-1");

    expect(redis.strings.has(tokenKey)).toBe(false);
  });

  it("destroys the Provider Session anchor with its Session artifact", async () => {
    const redis = new FakeRedis();
    const destroyedProviderSessions: Array<{
      expected: ProviderSessionLifecycleFence | undefined;
      sessionUid: string;
    }> = [];
    const adapter = createAdapter("Session", redis, { value: 3 }, {
      async destroyProviderSession(sessionUid, expected) {
        destroyedProviderSessions.push({ expected, sessionUid });
        return true;
      },
    });
    await adapter.upsert("session-1", {
      kernelPrincipalSessionId: "principal-a",
      providerSessionAnchorGeneration: "generation-a",
      uid: "provider-session-a",
    }, 3600);

    await adapter.destroy("session-1");

    expect(destroyedProviderSessions).toEqual([{
      expected: {
        generation: "generation-a",
        principalSessionId: "principal-a",
      },
      sessionUid: "provider-session-a",
    }]);
    expect(redis.strings.has("oidc:model:Session:session-1")).toBe(false);
  });

  it("does not read provider access token payload when Kernel credential lookup fails", async () => {
    const redis = new FakeRedis();
    redis.strings.set("oidc:model:AccessToken:token-1", JSON.stringify({
      clientId: "client-a",
      extra: { kernelCredentialId: "credential-a" },
    }));
    const tokens = createOidcTokenStore(redis as unknown as Redis);
    const adapter = new RedisOidcAdapter("AccessToken", redis as unknown as Redis, {
      claims: createClaimsSnapshotMock(),
      clientVersions: {
        findActiveVersion: async () => 3,
      },
      oidcSession: {
        ...createOidcSessionMock(),
        resolveAccessTokenCredential: async () => null,
      },
      providerSessions: {
        consumeStaged: async () => null,
        destroyProviderSession: async () => true,
        ensureClientBinding: async () => null,
        read: async () => null,
        readPrincipalAnchor: async () => null,
      },
      tokens,
    });

    await expect(adapter.find("token-1")).resolves.toBeUndefined();
    expect(redis.mgetCalls).toEqual([]);
  });

  it("revokes all indexed protocol objects for an invalidated client", async () => {
    const redis = new FakeRedis();
    const version = { value: 3 };
    await createAdapter("AuthorizationCode", redis, version).upsert("code-1", {
      clientId: "client-a",
      accountId: "subject-a",
      sessionUid: "provider-session-a",
      scope: "openid",
    }, 300);
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
