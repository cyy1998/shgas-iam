import type { ProtocolArtifact } from "@iam/session-kernel";
import type { Redis } from "ioredis";
import type { CreateOidcAuthorizationCodeSnapshotInput } from "../../src/provider/claims/claims-snapshot.ts";
import type { ProviderSessionLifecycleFence } from "../../src/session/provider-session.ts";
import {
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import Provider, { errors } from "oidc-provider";
import { describe, expect, it, vi } from "vitest";
import { toOidcClientRuntimeMetadata } from "../../src/provider/client/client-runtime-metadata.ts";
import { registerProtocolModelPayloadExtensions } from "../../src/provider/protocol-models.ts";
import { RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
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

  async eval(
    script: string,
    keyCount: number,
    ...args: Array<string | number>
  ) {
    const key = String(args[0]);
    if (script.includes("upsert_protocol_object")) {
      this.strings.set(key, String(args[keyCount]));
      const lookupCount = Number(args[keyCount + 3]);
      for (let index = 1; index <= lookupCount; index += 1)
        this.strings.set(String(args[index]), String(args[keyCount + 1]));
      for (let index = 1 + lookupCount; index < keyCount; index += 1) {
        const indexKey = String(args[index]);
        const set = this.sortedSets.get(indexKey) ?? new Map<string, number>();
        set.set(key, 1);
        this.sortedSets.set(indexKey, set);
      }
      return 1;
    }
    if (keyCount === 3)
      return 1;
    if (script.includes("ZADD")) {
      const consumed = args[1]!;
      const timestamp = String(args[2]);
      const set = this.sortedSets.get(key) ?? new Map<string, number>();
      set.set(timestamp, Number(consumed));
      this.sortedSets.set(key, set);
      return 1;
    }
    if (!this.strings.has(key))
      return 0;
    const consumed = args[1]!;
    const timestamp = String(args[2]);
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
      eval: (
        _script: string,
        _keyCount: number,
        key: string,
        consumedKey: string,
        ownerKey: string,
        ownerId: string,
      ) => {
        operations.push(() => {
          this.strings.delete(key);
          this.strings.delete(consumedKey);
          if (this.strings.get(ownerKey) === ownerId)
            this.strings.delete(ownerKey);
        });
        return chain;
      },
      pexpireat: () => chain,
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
    resolveLifetime?: () => Promise<{ remainingSeconds: number; artifact: ProtocolArtifact; serializedProviderCode: string } | null>;
    destroyProviderSession?: (
      sessionUid: string,
      expected?: ProviderSessionLifecycleFence,
    ) => Promise<boolean>;
  } = {},
) {
  const tokens = createOidcTokenStore(redis as unknown as Redis);
  const oidcSession = { ...createOidcSessionMock(), ...(options.resolveLifetime ? { resolveAuthorizationCodeSessionLifetime: options.resolveLifetime } : {}) };
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
        principalSessionId: "principal-a",
        bindingId: "binding-a",
        clientCode: "client-a",
        accountId: "subject-a",
        authTime: 1_782_260_000,
        oidcConfigVersion: version.value ?? 0,
        expiresAt: 1_782_263_600,
      }),
      readForAuthorization: async () => ({
        principalSessionId: "principal-a",
        bindingId: "binding-a",
        clientCode: "client-a",
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
      readForAuthorization: async () => null,
      readPrincipalAnchor: async () => null,
    },
    tokens,
  });
}

function createOidcSessionMock() {
  return {
    registerAuthorizationCodeArtifact: async () => true,
    resolveAuthorizationCodeSessionLifetime: async (_id: string, serializedProviderCode: string) => ({ serializedProviderCode, remainingSeconds: 90, artifact: { version: 1 as const, artifactId: "code", protocol: "oidc", artifactType: "authorization_code", lookupHash: "lookup", issuedAt: 0, expiresAt: 60000, cleanupRefs: [] } }),
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
  it.each([-120_000, 120_000])("uses acquired Redis validity in real opaque models across application offset %i", async (offset) => {
    const redis = new FakeRedis();
    const provider = new Provider("http://issuer.test", {
      adapter: name => createAdapter(name, redis, { value: 3 }),
    });
    registerProtocolModelPayloadExtensions(provider);
    const nativeNow = Date.now;
    const protocolExp = Math.floor(nativeNow() / 1000) - 60;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => nativeNow() + offset);
    try {
      for (const name of ["AuthorizationCode", "AccessToken", "Grant"] as const) {
        const adapter = createAdapter(name, redis, { value: 3 });
        await adapter.upsert("observed", {
          kind: name,
          clientId: "client-a",
          accountId: "subject-a",
          sessionUid: "provider-session-a",
          scope: "openid",
          exp: protocolExp,
          globalSessionRemainingSeconds: 99999,
          redisLifetimeObserved: true,
        }, 300);
        const stored = JSON.parse(redis.strings.get(`oidc:model:${name}:observed`)!);
        expect(stored.redisLifetimeObserved).toBeUndefined();
        expect(stored.globalSessionRemainingSeconds).toBeUndefined();
        const find = () => name === "Grant"
          ? provider.Grant.find("observed")
          : name === "AccessToken" ? provider.AccessToken.find("observed") : provider.AuthorizationCode.find("observed");
        const model = await find();
        expect(model).toBeDefined();
        expect(model!.isExpired).toBe(false);
        expect(model!.exp).toBe(protocolExp);
        if (name === "AuthorizationCode") {
          expect(model).toMatchObject({ globalSessionRemainingSeconds: 90 });
          await adapter.consume("observed");
          const replay = await provider.AuthorizationCode.find("observed", { ignoreExpiration: true });
          expect(replay).toMatchObject({ consumed: expect.any(Number) });
          let error;
          try {
            await adapter.consume("observed");
          }
          catch (caught) {
            error = caught;
          }
          expect(error).toBeInstanceOf(Error);
        }
        redis.strings.delete(`oidc:model:${name}:observed`);
        expect(await find()).toBeUndefined();
        // An earlier observation is request-local; it cannot make a later read succeed.
        expect(model!.isExpired).toBe(false);
      }
    }
    finally { clock.mockRestore(); }
  });

  it("refreshes Code lifetime on each acquisition and fails when its Kernel owner disappears", async () => {
    const redis = new FakeRedis();
    let lifetime: { remainingSeconds: number; artifact: ProtocolArtifact; serializedProviderCode: string } | null = { serializedProviderCode: "", remainingSeconds: 90, artifact: { version: 1 as const, artifactId: "code", protocol: "oidc", artifactType: "authorization_code", lookupHash: "lookup", issuedAt: 0, expiresAt: 60000, cleanupRefs: [] } };
    const adapter = createAdapter("AuthorizationCode", redis, { value: 3 }, { resolveLifetime: async () => lifetime });
    await adapter.upsert("code", { clientId: "client-a", accountId: "subject-a", sessionUid: "provider-session-a", scope: "openid" }, 300);
    const first = await adapter.find("code");
    expect(first).toMatchObject({ globalSessionRemainingSeconds: 90 });
    lifetime = { serializedProviderCode: "", remainingSeconds: 2, artifact: { version: 1 as const, artifactId: "code", protocol: "oidc", artifactType: "authorization_code", lookupHash: "lookup", issuedAt: 0, expiresAt: 60000, cleanupRefs: [] } };
    expect(await adapter.find("code")).toMatchObject({ globalSessionRemainingSeconds: 2 });
    expect(first).toMatchObject({ globalSessionRemainingSeconds: 90 });
    lifetime = null;
    expect(await adapter.find("code")).toBeUndefined();
  });

  it("returns undefined when Redis protocol state is missing", async () => {
    const adapter = createAdapter("AuthorizationCode", new FakeRedis(), { value: 3 });
    await expect(adapter.find("missing")).resolves.toBeUndefined();
  });

  it("consumes staged provider session bindings before authorization code registration", async () => {
    const redis = new FakeRedis();
    const tokens = createOidcTokenStore(redis as unknown as Redis);
    const stagedBinding = {
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
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
        readForAuthorization: async () => null,
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
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
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
        readForAuthorization: async () => binding,
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
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
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
        readForAuthorization: async (_sessionUid: string, clientCode: string) => clientCode === "client-b"
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
        readForAuthorization: async () => null,
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
      principalSessionId: "principal-a",
      bindingId: "binding-a",
      clientCode: "client-a",
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
        readForAuthorization: async () => binding,
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

    vi.spyOn(redis, "eval").mockResolvedValue(0);
    versions.set("client-b", 3);

    await expect(adapter.find("session-1")).resolves.toBeUndefined();
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
        readForAuthorization: async () => null,
        readPrincipalAnchor: async () => null,
      },
      tokens,
    });

    await expect(adapter.find("token-1")).resolves.toBeUndefined();
    expect(redis.mgetCalls).toEqual([]);
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
