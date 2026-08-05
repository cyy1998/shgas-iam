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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createOidcSessionKernelAdapter,
  createOidcSessionKernelCleanupAdapter,
} from "../../src/session/oidc-session-kernel.adapter.ts";
import { createProviderSessionStateStore } from "../../src/session/provider-session-state.store.ts";
import {
  pendingProviderSessionBindingKey,
  providerSessionBindingKey,
  providerSessionBindingLookupKey,
  providerSessionGenerationMembersKey,
  providerSessionPrincipalAnchorKey,
} from "../../src/session/provider-session.ts";
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
    testScope.trackKey(firstPendingKey);
    const writerStore = createProviderSessionStateStore(asStateRedis(testScope.writer));
    const observerStore = createProviderSessionStateStore(asStateRedis(testScope.observer));
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    await writerStore.stage({
      accountId,
      authorizationAttemptId: firstAttemptId,
      authTime: 1_700_000_000,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt,
      oidcConfigVersion: 1,
      principalSessionId: testScope.unique("principal-first"),
      providerSessionUid: null,
      userId: 7,
    }, 60);

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
      userId: 7,
    }, 60);
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
  });

  it("publishes one generation, refreshes owned TTLs, and conditionally cleans its anchor", async () => {
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
      ttlSeconds: 60,
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
      ttlSeconds: 60,
    })).resolves.toMatchObject({ status: "committed" });
    await expect(writerStore.publishRebind({
      attemptId: initialAttemptId,
      binding: initialBinding,
      expectedAnchorGeneration: null,
      providerSessionUid,
      ttlSeconds: 60,
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
        ttlSeconds: 60,
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
      providerSessionBindingKey(providerSessionUid, clientCode),
      providerSessionBindingLookupKey(providerSessionUid, clientCode),
      providerSessionGenerationMembersKey(providerSessionUid, winnerAttemptId),
    ] as const;
    await Promise.all(publicationKeys.map(key => testScope.writer.pexpire(key, 1_000)));
    await expect(writerStore.refresh({
      binding: winner,
      providerSessionUid,
      ttlSeconds: 60,
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
      .toEqual([null, null, null, null]);
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
      ttlSeconds: 60,
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
      ttlSeconds: 60,
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
    await expect(store.readBinding(providerSessionUid, clientA)).resolves.toMatchObject({
      bindingId: bindingA.bindingId,
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
      ttlSeconds: 60,
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

  it("confirms a committed binding when the publish response is lost and does not revoke it", async () => {
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
      set: (key, value, ...args) => delegate.set(key, value, ...args),
      del: (...keys) => delegate.del(...keys),
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
        principalAbsoluteTtlMs: 120_000,
        principalIdleTtlMs: 60_000,
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
        findById: async () => null,
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
      clock: { now: Date.now },
      cookieName: "global_session",
      kernel,
      logger: { warn: () => undefined },
      providerSessionState,
    });
    const principal = await kernel.createPrincipalSession(accountId);
    if (principal.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const binding = await adapter.bind(providerSessionUid, {
      accountId,
      authTime: Math.floor(principal.value.authTime / 1000),
      sessionId: principal.value.principalSessionId,
      userId: 7,
    }, {
      authorizationAttemptId: testScope.unique("attempt"),
      clientId: clientCode,
      oidcConfigVersion: 1,
      providerSessionUid,
    });

    expect(binding).not.toBeNull();
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
    globalSessionId: input.principalSessionId,
    mappingOwnerId: input.mappingOwnerId,
    oidcConfigVersion: 1,
    principalSessionId: input.principalSessionId,
    userId: 7,
  };
}

function trackPublication(
  testScope: OidcProviderRedisTestScope,
  providerSessionUid: string,
  clientCode: string,
) {
  testScope.trackKey(providerSessionPrincipalAnchorKey(providerSessionUid));
  testScope.trackPrefix(providerSessionGenerationMembersKey(providerSessionUid, ""));
  testScope.trackKey(providerSessionBindingKey(providerSessionUid, clientCode));
  testScope.trackKey(providerSessionBindingLookupKey(providerSessionUid, clientCode));
}

function asStateRedis(redis: OidcProviderRedisTestScope["writer"]) {
  return redis as unknown as ProviderSessionStateRedis;
}
