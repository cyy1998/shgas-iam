import type { ProviderSessionStateRedis } from "../../src/session/provider-session-state.store.ts";
import type { ProviderSessionBinding } from "../../src/session/provider-session.ts";
import type {
  OidcProviderRedisTestHarness,
  OidcProviderRedisTestScope,
} from "./redis-test-harness.ts";
import { randomUUID } from "node:crypto";
import { LoggerSourceApp } from "@iam/api-core/logger";
import {
  createSessionKernel,
  createSessionKernelConfig,
} from "@iam/api-core/session/kernel";
import Provider from "oidc-provider";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { registerProtocolModelPayloadExtensions } from "../../src/provider/protocol-models.ts";
import {
  createOidcSessionKernelAdapter,
  createOidcSessionKernelCleanupAdapter,
} from "../../src/session/oidc-session-kernel.adapter.ts";
import { createProviderSessionStateStore } from "../../src/session/provider-session-state.store.ts";
import {
  pendingProviderSessionBindingKey,
  pendingProviderSessionBindingsByClientKey,
  providerSessionBindingLookupKey,
  providerSessionGenerationMembersKey,
  providerSessionPrincipalAnchorKey,
} from "../../src/session/provider-session.ts";
import { RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
import { createOidcProviderRedisTestHarness } from "./redis-test-harness.ts";

let harness: OidcProviderRedisTestHarness | undefined;
let scope: OidcProviderRedisTestScope | undefined;

beforeAll(async () => {
  harness = await createOidcProviderRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createScope();
});

afterEach(async () => {
  await scope?.close();
  scope = undefined;
  vi.restoreAllMocks();
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("oIDC Provider Session real Redis contract", () => {
  it("atomically claims attempt-bound staged principals with and without an existing Provider Session uid", async () => {
    const testScope = scope!;
    const accountId = randomUUID();
    const clientCode = testScope.unique("client");
    const firstAttemptId = testScope.unique("first-attempt");
    const firstPendingKey = pendingProviderSessionBindingKey(firstAttemptId);
    const pendingIndexKey = pendingProviderSessionBindingsByClientKey(clientCode);
    testScope.trackKey(firstPendingKey);
    testScope.trackKey(pendingIndexKey);
    const writerStore = createProviderSessionStateStore(asStateRedis(testScope.writer));
    const observerStore = createProviderSessionStateStore(asStateRedis(testScope.observer));
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    const firstPrincipalSessionId = testScope.unique("principal-first");
    await writerStore.stage({
      accountId,
      authorizationAttemptId: firstAttemptId,
      authTime: 1_700_000_000,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt,
      oidcConfigVersion: 1,
      principalSessionId: firstPrincipalSessionId,
      providerSessionUid: null,
    }, expiresAt * 1000);
    expect(JSON.parse(await testScope.observer.get(firstPendingKey) ?? "null")).toEqual({
      accountId,
      authorizationAttemptId: firstAttemptId,
      authTime: 1_700_000_000,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt: expect.any(Number),
      oidcConfigVersion: 1,
      principalSessionId: firstPrincipalSessionId,
      providerSessionUid: null,
    });
    await expect(writerStore.inventoryClientStagedBindings(clientCode)).resolves.toMatchObject({
      counts: { bindings: 1, invalid: 0, stale: 0, total: 1 },
    });
    expect(await testScope.observer.zcard(pendingIndexKey)).toBe(1);

    const firstClaims = await Promise.all([
      writerStore.claim({
        accountId,
        authorizationAttemptId: firstAttemptId,
        clientCode,
        providerSessionUid: testScope.unique("provider-first"),
      }),
      observerStore.claim({
        accountId,
        authorizationAttemptId: firstAttemptId,
        clientCode,
        providerSessionUid: testScope.unique("provider-first-racer"),
      }),
    ]);

    expect(firstClaims.filter(Boolean)).toHaveLength(1);
    expect(await testScope.observer.exists(firstPendingKey)).toBe(0);
    expect(await testScope.observer.zcard(pendingIndexKey)).toBe(0);

    const providerSessionUid = testScope.unique("provider-existing");
    const existingAttemptId = testScope.unique("existing-attempt");
    const existingPendingKey = pendingProviderSessionBindingKey(existingAttemptId);
    testScope.trackKey(existingPendingKey);
    await writerStore.stage({
      accountId,
      authorizationAttemptId: existingAttemptId,
      authTime: 1_700_000_001,
      clientCode,
      expectedAnchorGeneration: testScope.unique("generation-existing"),
      expiresAt,
      oidcConfigVersion: 1,
      principalSessionId: testScope.unique("principal-existing"),
      providerSessionUid,
    }, expiresAt * 1000);
    const ttl = await testScope.observer.ttl(existingPendingKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);

    await expect(writerStore.claim({
      accountId,
      authorizationAttemptId: existingAttemptId,
      clientCode,
      providerSessionUid: testScope.unique("provider-wrong"),
    })).resolves.toBeNull();
    expect(await testScope.observer.exists(existingPendingKey)).toBe(1);
    await expect(observerStore.claim({
      accountId,
      authorizationAttemptId: existingAttemptId,
      clientCode,
      providerSessionUid,
    })).resolves.toMatchObject({
      authorizationAttemptId: existingAttemptId,
      providerSessionUid,
    });
    expect(await testScope.observer.exists(existingPendingKey)).toBe(0);

    const legacyAttemptId = testScope.unique("legacy-attempt");
    const legacyPendingKey = pendingProviderSessionBindingKey(legacyAttemptId);
    const legacyPrincipalSessionId = testScope.unique("principal-legacy");
    testScope.trackKey(legacyPendingKey);
    await testScope.writer.set(legacyPendingKey, JSON.stringify({
      accountId,
      authorizationAttemptId: legacyAttemptId,
      authTime: 1_700_000_002,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt,
      oidcConfigVersion: 1,
      principalSessionId: legacyPrincipalSessionId,
      providerSessionUid,
      userId: 7,
    }), "EX", 60);
    await expect(observerStore.readStaged(legacyAttemptId)).resolves.toEqual({
      accountId,
      authorizationAttemptId: legacyAttemptId,
      authTime: 1_700_000_002,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt,
      oidcConfigVersion: 1,
      principalSessionId: legacyPrincipalSessionId,
      providerSessionUid,
    });
    await expect(writerStore.claim({
      accountId,
      authorizationAttemptId: legacyAttemptId,
      clientCode,
      providerSessionUid,
    })).resolves.toEqual({
      accountId,
      authorizationAttemptId: legacyAttemptId,
      authTime: 1_700_000_002,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt,
      oidcConfigVersion: 1,
      principalSessionId: legacyPrincipalSessionId,
      providerSessionUid,
    });
    expect(await testScope.observer.exists(legacyPendingKey)).toBe(0);
  });

  it("does not let cleanup delete a staged binding replaced after its inventory snapshot", async () => {
    const testScope = scope!;
    const accountId = randomUUID();
    const authorizationAttemptId = testScope.unique("attempt");
    const clientCode = testScope.unique("client");
    const pendingKey = pendingProviderSessionBindingKey(authorizationAttemptId);
    const pendingIndexKey = pendingProviderSessionBindingsByClientKey(clientCode);
    testScope.trackKey(pendingKey);
    testScope.trackKey(pendingIndexKey);
    const baseRedis = asStateRedis(testScope.writer);
    const observerStore = createProviderSessionStateStore(asStateRedis(testScope.observer));
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    const originalPrincipalSessionId = testScope.unique("principal-original");
    const replacementPrincipalSessionId = testScope.unique("principal-replacement");
    await observerStore.stage({
      accountId,
      authorizationAttemptId,
      authTime: 1_700_000_000,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt,
      oidcConfigVersion: 1,
      principalSessionId: originalPrincipalSessionId,
      providerSessionUid: null,
    }, expiresAt * 1000);
    const cleanupRedis = new Proxy(baseRedis, {
      get(target, property, receiver) {
        if (property === "mget") {
          return async (...keys: string[]) => {
            const snapshot = await target.mget(...keys);
            await observerStore.stage({
              accountId,
              authorizationAttemptId,
              authTime: 1_700_000_001,
              clientCode,
              expectedAnchorGeneration: null,
              expiresAt,
              oidcConfigVersion: 1,
              principalSessionId: replacementPrincipalSessionId,
              providerSessionUid: null,
            }, expiresAt * 1000);
            return snapshot;
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const cleanupStore = createProviderSessionStateStore(cleanupRedis);

    await expect(cleanupStore.revokeClientStagedBindings(clientCode)).rejects.toThrow(
      "OIDC staged Provider Session binding inventory contains invalid records",
    );
    await expect(observerStore.readStaged(authorizationAttemptId)).resolves.toMatchObject({
      principalSessionId: replacementPrincipalSessionId,
    });
    await expect(observerStore.inventoryClientStagedBindings(clientCode)).resolves.toMatchObject({
      counts: { bindings: 1, invalid: 0, stale: 0, total: 1 },
    });
  });

  it("preserves long-lived anchor and generation members when another writer publishes and refreshes a short member", async () => {
    const testScope = scope!;
    const writer = createProviderSessionStateStore(asStateRedis(testScope.writer));
    const observer = createProviderSessionStateStore(asStateRedis(testScope.observer));
    const uid = testScope.unique("provider");
    const generation = testScope.unique("generation");
    const binding = createBinding({ accountId: randomUUID(), anchorGeneration: generation, bindingId: testScope.unique("binding"), clientCode: testScope.unique("client"), mappingOwnerId: randomUUID(), principalSessionId: testScope.unique("principal") });
    const other = { ...binding, clientCode: testScope.unique("short-client"), bindingId: testScope.unique("short-binding"), mappingOwnerId: randomUUID() };
    trackPublication(testScope, uid, binding.clientCode);
    trackPublication(testScope, uid, other.clientCode);
    const time = await testScope.observer.time();
    const deadline = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000) + 60_000;
    await writer.publishRebind({ attemptId: generation, binding, expectedAnchorGeneration: null, providerSessionUid: uid, expiresAt: deadline });
    const anchor = await observer.readAnchor(uid);
    const nativeNow = Date.now;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => nativeNow() + 120_000);
    await observer.publishClientBinding({ anchor: anchor!, binding: other, expectedLookup: null, providerSessionUid: uid, expiresAt: deadline - 59_000 });
    clock.mockImplementation(() => nativeNow() - 120_000);
    await observer.refresh({ binding: other, providerSessionUid: uid, expiresAt: deadline - 59_000 });
    expect(await testScope.observer.pexpiretime(providerSessionPrincipalAnchorKey(uid))).toBe(deadline);
    expect(await testScope.observer.pexpiretime(providerSessionGenerationMembersKey(uid, generation))).toBe(deadline);
    expect(await testScope.observer.pexpiretime(providerSessionBindingLookupKey(uid, binding.clientCode))).toBe(deadline);
    await vi.waitFor(async () => {
      const short = await observer.readLookup(uid, other.clientCode);
      expect(short.exists).toBe(false);
    }, { timeout: 2500, interval: 20 });
    expect((await writer.readLookup(uid, binding.clientCode)).exists).toBe(true);
    expect(await observer.readAnchor(uid)).toEqual(anchor);
  });

  it("publishes only minimal state, refreshes owned TTLs, and conditionally cleans its anchor", async () => {
    const testScope = scope!;
    const accountId = randomUUID();
    const clientCode = testScope.unique("client");
    const providerSessionUid = testScope.unique("provider");
    trackPublication(testScope, providerSessionUid, clientCode);
    const writerStore = createProviderSessionStateStore(asStateRedis(testScope.writer));
    const observerStore = createProviderSessionStateStore(asStateRedis(testScope.observer));
    const initialAttemptId = testScope.unique("attempt-initial");
    const initialBinding = createBinding({
      accountId,
      anchorGeneration: initialAttemptId,
      bindingId: testScope.unique("binding-initial"),
      clientCode,
      mappingOwnerId: testScope.unique("owner-initial"),
      principalSessionId: testScope.unique("principal-initial"),
    });
    await expect(writerStore.publishRebind({
      attemptId: initialAttemptId,
      binding: initialBinding,
      expectedAnchorGeneration: null,
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toMatchObject({ status: "committed" });
    const initialAnchor = await writerStore.readAnchor(providerSessionUid);
    expect(initialAnchor).not.toBeNull();
    const secondaryClientCode = testScope.unique("client-secondary");
    trackPublication(testScope, providerSessionUid, secondaryClientCode);
    const secondaryBinding = createBinding({
      accountId,
      anchorGeneration: initialAttemptId,
      bindingId: testScope.unique("binding-secondary"),
      clientCode: secondaryClientCode,
      mappingOwnerId: testScope.unique("owner-secondary"),
      principalSessionId: initialBinding.principalSessionId,
    });
    await expect(writerStore.publishClientBinding({
      anchor: initialAnchor!,
      binding: secondaryBinding,
      expectedLookup: null,
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toMatchObject({ status: "committed" });
    await expect(writerStore.publishClientBinding({
      anchor: initialAnchor!,
      binding: {
        ...secondaryBinding,
        bindingId: testScope.unique("binding-stale-owner"),
        mappingOwnerId: testScope.unique("owner-stale-owner"),
      },
      expectedLookup: {
        bindingId: secondaryBinding.bindingId,
        mappingOwnerId: testScope.unique("owner-wrong-expected"),
      },
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toMatchObject({ status: "conflict" });
    await expect(writerStore.readLookup(providerSessionUid, secondaryClientCode))
      .resolves
      .toMatchObject({
        exists: true,
        value: {
          bindingId: secondaryBinding.bindingId,
          mappingOwnerId: secondaryBinding.mappingOwnerId,
        },
      });
    await expect(writerStore.publishRebind({
      attemptId: initialAttemptId,
      binding: initialBinding,
      expectedAnchorGeneration: null,
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toMatchObject({ status: "committed" });
    await expect(writerStore.readAnchor(providerSessionUid)).resolves.toMatchObject({
      generation: initialAttemptId,
      principalSessionId: initialBinding.principalSessionId,
    });

    const contenderAttemptIds = [
      testScope.unique("attempt-a"),
      testScope.unique("attempt-b"),
    ] as const;
    const contenders = contenderAttemptIds.map((attemptId, index) => createBinding({
      accountId,
      anchorGeneration: attemptId,
      bindingId: testScope.unique(`binding-${index}`),
      clientCode,
      mappingOwnerId: testScope.unique(`owner-${index}`),
      principalSessionId: testScope.unique(`principal-${index}`),
    }));
    const results = await Promise.all(contenders.map(async (binding, index) => {
      const store = index === 0 ? writerStore : observerStore;
      return await store.publishRebind({
        attemptId: contenderAttemptIds[index]!,
        binding,
        expectedAnchorGeneration: initialAttemptId,
        providerSessionUid,
        expiresAt: Date.now() + 60_000,
      });
    }));

    expect(results.map(result => result.status).sort()).toEqual(["committed", "conflict"]);
    const winnerIndex = results.findIndex(result => result.status === "committed");
    const winner = contenders[winnerIndex]!;
    const winnerAttemptId = contenderAttemptIds[winnerIndex]!;
    await expect(writerStore.readAnchor(providerSessionUid)).resolves.toMatchObject({
      generation: winnerAttemptId,
      principalSessionId: winner.principalSessionId,
    });

    const publicationKeys = [
      providerSessionPrincipalAnchorKey(providerSessionUid),
      providerSessionBindingLookupKey(providerSessionUid, clientCode),
      providerSessionGenerationMembersKey(providerSessionUid, winnerAttemptId),
    ] as const;
    await Promise.all(publicationKeys.map(key => testScope.writer.pexpire(key, 1_000)));
    await expect(writerStore.refresh({
      binding: { ...winner, mappingOwnerId: testScope.unique("owner-stale-refresh") },
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toBe(false);
    await expect(writerStore.refresh({
      binding: winner,
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toBe(true);
    const refreshedTtls = await Promise.all(publicationKeys.map(key => testScope.observer.pttl(key)));
    expect(refreshedTtls.every(ttl => ttl > 50_000)).toBe(true);

    await writerStore.deleteOwned({
      anchorGeneration: initialBinding.anchorGeneration,
      clientCode,
      mappingOwnerId: initialBinding.mappingOwnerId,
      providerSessionUid,
    });
    await expect(writerStore.readAnchor(providerSessionUid)).resolves.not.toBeNull();
    await writerStore.deleteOwned({
      anchorGeneration: winner.anchorGeneration,
      clientCode,
      mappingOwnerId: winner.mappingOwnerId,
      providerSessionUid,
    });
    await expect(Promise.all(publicationKeys.map(key => testScope.observer.get(key))))
      .resolves
      .toEqual([null, null, null]);
  });

  it("keeps a Provider Session generation anchored until its last client mapping is revoked", async () => {
    const testScope = scope!;
    const accountId = randomUUID();
    const providerSessionUid = testScope.unique("provider-shared-anchor");
    const clientA = testScope.unique("client-a");
    const clientB = testScope.unique("client-b");
    trackPublication(testScope, providerSessionUid, clientA);
    trackPublication(testScope, providerSessionUid, clientB);
    const store = createProviderSessionStateStore(asStateRedis(testScope.writer));
    const generation = testScope.unique("generation");
    const bindingA = createBinding({
      accountId,
      anchorGeneration: generation,
      bindingId: testScope.unique("binding-a"),
      clientCode: clientA,
      mappingOwnerId: testScope.unique("owner-a"),
      principalSessionId: testScope.unique("principal"),
    });
    await expect(store.publishRebind({
      attemptId: generation,
      binding: bindingA,
      expectedAnchorGeneration: null,
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toMatchObject({ status: "committed" });
    const anchor = await store.readAnchor(providerSessionUid);
    expect(anchor).not.toBeNull();
    const bindingB = createBinding({
      accountId,
      anchorGeneration: generation,
      bindingId: testScope.unique("binding-b"),
      clientCode: clientB,
      mappingOwnerId: testScope.unique("owner-b"),
      principalSessionId: bindingA.principalSessionId,
    });
    await expect(store.publishClientBinding({
      anchor: anchor!,
      binding: bindingB,
      expectedLookup: null,
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toMatchObject({ status: "committed" });

    await store.deleteOwned({
      anchorGeneration: bindingB.anchorGeneration,
      clientCode: clientB,
      mappingOwnerId: bindingB.mappingOwnerId,
      providerSessionUid,
    });

    await expect(store.readAnchor(providerSessionUid)).resolves.toMatchObject({
      generation,
      principalSessionId: bindingA.principalSessionId,
    });
    await expect(store.readLookup(providerSessionUid, clientA)).resolves.toMatchObject({
      exists: true,
      value: { bindingId: bindingA.bindingId },
    });
    await store.deleteOwned({
      anchorGeneration: bindingA.anchorGeneration,
      clientCode: clientA,
      mappingOwnerId: bindingA.mappingOwnerId,
      providerSessionUid,
    });
    await expect(store.readAnchor(providerSessionUid)).resolves.toBeNull();
  });

  it("requires a complete matching lifecycle fence to destroy a Provider Session generation", async () => {
    const testScope = scope!;
    const accountId = randomUUID();
    const providerSessionUid = testScope.unique("provider-destroyed");
    const clientCode = testScope.unique("client");
    const generation = testScope.unique("generation");
    trackPublication(testScope, providerSessionUid, clientCode);
    const membersKey = providerSessionGenerationMembersKey(providerSessionUid, generation);
    const store = createProviderSessionStateStore(asStateRedis(testScope.writer));
    const binding = createBinding({
      accountId,
      anchorGeneration: generation,
      bindingId: testScope.unique("binding"),
      clientCode,
      mappingOwnerId: testScope.unique("owner"),
      principalSessionId: testScope.unique("principal"),
    });
    await expect(store.publishRebind({
      attemptId: generation,
      binding,
      expectedAnchorGeneration: null,
      providerSessionUid,
      expiresAt: Date.now() + 60_000,
    })).resolves.toMatchObject({ status: "committed" });
    expect(await testScope.observer.exists(membersKey)).toBe(1);

    await expect(store.destroyProviderSession(providerSessionUid)).resolves.toBe(true);
    await expect(store.readAnchor(providerSessionUid)).resolves.toMatchObject({ generation });
    await expect(store.destroyProviderSession(providerSessionUid, {
      principalSessionId: binding.principalSessionId,
    })).resolves.toBe(true);
    await expect(store.readAnchor(providerSessionUid)).resolves.toMatchObject({ generation });
    await expect(store.destroyProviderSession(providerSessionUid, {
      generation,
    })).resolves.toBe(true);
    await expect(store.readAnchor(providerSessionUid)).resolves.toMatchObject({ generation });
    expect(await testScope.observer.exists(membersKey)).toBe(1);
    await expect(store.destroyProviderSession(
      providerSessionUid,
      { principalSessionId: testScope.unique("stale-principal") },
    )).resolves.toBe(true);
    await expect(store.readAnchor(providerSessionUid)).resolves.toMatchObject({
      principalSessionId: binding.principalSessionId,
    });
    await expect(store.destroyProviderSession(providerSessionUid, {
      generation: testScope.unique("stale-generation"),
      principalSessionId: binding.principalSessionId,
    })).resolves.toBe(true);
    await expect(store.readAnchor(providerSessionUid)).resolves.toMatchObject({ generation });

    await expect(store.destroyProviderSession(
      providerSessionUid,
      {
        generation,
        principalSessionId: binding.principalSessionId,
      },
    )).resolves.toBe(true);

    await expect(store.readAnchor(providerSessionUid)).resolves.toBeNull();
    expect(await testScope.observer.exists(membersKey)).toBe(0);
  });

  it.each([0, -5000, 5000])("keeps Kernel deadlines through staged publication, Code and Credential under offset %i", async (offset) => {
    const testScope = scope!;
    const accountId = randomUUID();
    const clientCode = testScope.unique("client");
    const providerSessionUid = testScope.unique("provider");
    const kernelNamespace = `${testScope.unique("kernel")}:`;
    testScope.trackPrefix(kernelNamespace);
    trackPublication(testScope, providerSessionUid, clientCode);
    const delegate = testScope.writer as unknown as ProviderSessionStateRedis;
    let losePublicationResponse = true;
    const ambiguousRedis: ProviderSessionStateRedis = {
      get: key => delegate.get(key),
      mget: (...keys) => delegate.mget(...keys),
      set: (key, value, ...args) => delegate.set(key, value, ...args),
      del: (...keys) => delegate.del(...keys),
      zrangebyscore: (key, min, max) => delegate.zrangebyscore(key, min, max),
      zremrangebyscore: (key, min, max) => delegate.zremrangebyscore(key, min, max),
      async eval(script, keyCount, ...args) {
        const result = await delegate.eval(script, keyCount, ...args);
        if (losePublicationResponse && script.includes("publish_provider_session_rebind")) {
          losePublicationResponse = false;
          throw new Error("publication response lost");
        }
        return result;
      },
    };
    const providerSessionState = createProviderSessionStateStore(ambiguousRedis);
    const kernel = createSessionKernel({
      cleanupAdapters: createOidcSessionKernelCleanupAdapter({
        providerSessionState,
        redis: ambiguousRedis,
      }),
      config: createSessionKernelConfig({
        lookupHmacKeys: {
          current: {
            id: "redis-test-current",
            secret: "oidc-provider-redis-test-secret-0000000000000000",
          },
        },
        namespace: kernelNamespace,
        principalAbsoluteTtlMs: 6000,
        principalIdleTtlMs: 3000,
      }),
      principalAccessFence: {
        capture: async () => randomUUID(),
        validate: async () => ({ ok: true }),
      },
      redis: testScope.writer,
      sourceApp: LoggerSourceApp.OidcProvider,
    });
    const adapter = createOidcSessionKernelAdapter({
      accounts: {
        findBySubject: async subject => subject === accountId
          ? {
              id: 7,
              isDelete: false,
              mobile: null,
              name: "Redis Test",
              status: 1,
              subjectIdentifier: accountId,
              username: "redis-test",
            }
          : null,
      },
      clients: {
        findActiveVersion: async code => code === clientCode ? 1 : null,
        findRuntime: async () => null,
      },
      cookieName: "global_session",
      kernel,
      logger: { warn: () => undefined },
      providerSessionState,
    });
    const nativeNow = Date.now;
    let applicationOffset = offset;
    vi.spyOn(Date, "now").mockImplementation(() => nativeNow() + applicationOffset);
    const principal = await kernel.createPrincipalSession(accountId);
    if (principal.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const authorizationAttemptId = testScope.unique("attempt");
    const session = {
      accountId,
      authTime: Math.floor(principal.value.authTime / 1000),
      sessionId: principal.value.principalSessionId,
    };
    testScope.trackKey(pendingProviderSessionBindingKey(authorizationAttemptId));
    testScope.trackKey(pendingProviderSessionBindingsByClientKey(clientCode));
    await adapter.stage(session, {
      authorizationAttemptId,
      clientId: clientCode,
      oidcConfigVersion: 1,
      providerSessionUid,
    });
    const stagedDeadline = await testScope.observer.pexpiretime(pendingProviderSessionBindingKey(authorizationAttemptId));
    expect(stagedDeadline).toBe(principal.value.expiresAt);
    expect(Number(await testScope.observer.zscore(pendingProviderSessionBindingsByClientKey(clientCode), pendingProviderSessionBindingKey(authorizationAttemptId)))).toBe(stagedDeadline);
    applicationOffset = -offset;
    expect(await adapter.isStagedPrincipal(authorizationAttemptId, clientCode, session)).toBe(true);
    const binding = await adapter.consumeStaged({
      accountId,
      authorizationAttemptId,
      clientCode,
      providerSessionUid,
    });

    expect(binding).not.toBeNull();
    const mappingKey = providerSessionBindingLookupKey(providerSessionUid, clientCode);
    expect(await testScope.observer.pexpiretime(mappingKey)).toBe(principal.value.expiresAt);
    applicationOffset = 120_000;
    await adapter.read(providerSessionUid, clientCode);
    expect(await testScope.observer.pexpiretime(mappingKey)).toBe(principal.value.expiresAt);
    const codeId = testScope.unique("code");
    const payload = { clientId: clientCode, scope: "openid", authTime: session.authTime };
    testScope.trackKey(`oidc:model:AuthorizationCode:${codeId}`);
    testScope.trackKey(`oidc:consumed:AuthorizationCode:${codeId}`);
    testScope.trackKey(`oidc:client-objects:${clientCode}`);
    const protocolAdapter = (name: string) => new RedisOidcAdapter(name, testScope.writer, {
      oidcSession: adapter,
      providerSessions: adapter,
      clientVersions: { findActiveVersion: async () => 1 },
      claims: { createAuthorizationCodeSnapshot: async () => ({}) },
      tokens: { revokeAccessToken: async () => undefined },
    });
    const provider = new Provider("http://issuer.test", { adapter: protocolAdapter });
    registerProtocolModelPayloadExtensions(provider);
    const codes = protocolAdapter("AuthorizationCode");
    await codes.upsert(codeId, { ...payload, kind: "AuthorizationCode", accountId, sessionUid: providerSessionUid }, 60);
    expect(await provider.AuthorizationCode.find(codeId)).toBeDefined();
    const lifetime = await adapter.resolveAuthorizationCodeSessionLifetime(codeId);
    expect(lifetime!.remainingSeconds).toBeGreaterThan(0);
    expect(lifetime!.remainingSeconds).toBeLessThanOrEqual(3);
    applicationOffset = -120_000;
    await codes.consume(codeId);
    expect(await adapter.resolveAuthorizationCodeSessionLifetime(codeId)).toBeNull();
    const replay = await provider.AuthorizationCode.find(codeId, { ignoreExpiration: true });
    expect(replay).toMatchObject({ consumed: expect.any(Number), clientId: clientCode });
    expect(replay!.isExpired).toBe(false);
    expect(replay).not.toHaveProperty("globalSessionRemainingSeconds");
    let replayFailure;
    try {
      await codes.consume(codeId);
    }
    catch (error) {
      replayFailure = error;
    }
    expect(replayFailure).toBeInstanceOf(Error);
    expect(await adapter.consumeAuthorizationCodeArtifact(codeId)).toBeNull();
    const tokenId = testScope.unique("token");
    const credential = await adapter.registerAccessTokenCredential({ providerTokenId: tokenId, providerTokenKey: testScope.unique("payload"), payload, expiresIn: lifetime!.remainingSeconds, binding });
    expect(credential!.expiresAt).toBeLessThanOrEqual(principal.value.expiresAt);
    expect((await adapter.resolveAccessTokenCredential(tokenId))!.credential.credentialId).toBe(credential!.credentialId);
    await adapter.revokeAccessTokenCredential(credential!.credentialId);
    expect(await adapter.resolveAccessTokenCredential(tokenId)).toBeNull();

    await expect(kernel.resolveClientBindingById(binding!.bindingId)).resolves.toMatchObject({
      status: "resolved",
      value: { bindingId: binding!.bindingId },
    });
    await expect(adapter.read(providerSessionUid, clientCode)).resolves.toMatchObject({
      bindingId: binding!.bindingId,
      principalSessionId: principal.value.principalSessionId,
    });
  });
});

function createBinding(input: {
  accountId: string;
  anchorGeneration: string;
  bindingId: string;
  clientCode: string;
  mappingOwnerId: string;
  principalSessionId: string;
}): ProviderSessionBinding {
  return {
    accountId: input.accountId,
    anchorGeneration: input.anchorGeneration,
    authTime: 1_700_000_000,
    bindingId: input.bindingId,
    clientCode: input.clientCode,
    expiresAt: Math.floor(Date.now() / 1000) + 120,
    mappingOwnerId: input.mappingOwnerId,
    oidcConfigVersion: 1,
    principalSessionId: input.principalSessionId,
  };
}

function trackPublication(
  testScope: OidcProviderRedisTestScope,
  providerSessionUid: string,
  clientCode: string,
) {
  testScope.trackKey(providerSessionPrincipalAnchorKey(providerSessionUid));
  testScope.trackPrefix(providerSessionGenerationMembersKey(providerSessionUid, ""));
  testScope.trackKey(providerSessionBindingLookupKey(providerSessionUid, clientCode));
}

function asStateRedis(redis: OidcProviderRedisTestScope["writer"]) {
  return redis as unknown as ProviderSessionStateRedis;
}
