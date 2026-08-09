import type { CreateOidcAuthorizationCodeSnapshotInput } from "../../src/provider/claims-snapshot.ts";
import type {
  OidcProviderRedisTestHarness,
  OidcProviderRedisTestScope,
} from "./redis-test-harness.ts";
import { randomInt } from "node:crypto";
import { SystemLogEvent } from "@iam/api-core/logger";
import { OIDC_CLIENT_INVALIDATION_CHANNEL } from "@iam/api-core/oidc";
import Redis from "ioredis";
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
import { startClientInvalidationSubscriber } from "../../src/invalidation/client-invalidation.ts";
import { createOidcProtocolObjectStore, RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
import { createOidcTokenStore } from "../../src/stores/token.store.ts";
import { createOidcProviderRedisTestHarness } from "./redis-test-harness.ts";

let harness: OidcProviderRedisTestHarness | undefined;
let scope: OidcProviderRedisTestScope | undefined;
const SUBJECT_IDENTIFIER = "00000000-0000-4000-8000-000000000007";

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

describe("redis OIDC adapter real Redis contract", () => {
  it("coordinates client invalidation through current lifecycle owners", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const revokeClientProtocol = vi.fn(async () => undefined);
    const revokeClient = vi.fn(async () => undefined);
    const subscriber = startClientInvalidationSubscriber(
      testScope.writer,
      { warn: vi.fn() } as never,
      {
        oidcSession: { revokeClientProtocol },
        protocolObjects: { revokeClient },
      },
    );
    try {
      await vi.waitFor(async () => {
        const subscription = await testScope.observer.pubsub("NUMSUB", OIDC_CLIENT_INVALIDATION_CHANNEL);
        expect(Number(subscription[1])).toBeGreaterThan(0);
      });

      subscriber.disconnect();
      await vi.waitFor(async () => {
        const subscription = await testScope.observer.pubsub("NUMSUB", OIDC_CLIENT_INVALIDATION_CHANNEL);
        expect(Number(subscription[1])).toBe(0);
      });
      await subscriber.connect();
      await vi.waitFor(async () => {
        const subscription = await testScope.observer.pubsub("NUMSUB", OIDC_CLIENT_INVALIDATION_CHANNEL);
        expect(Number(subscription[1])).toBeGreaterThan(0);
      });

      await testScope.writer.publish(
        OIDC_CLIENT_INVALIDATION_CHANNEL,
        JSON.stringify({ clientCode: clientId }),
      );

      await vi.waitFor(() => {
        expect(revokeClientProtocol).toHaveBeenCalledWith(clientId, "client_config_changed");
        expect(revokeClient).toHaveBeenCalledWith(clientId);
      });
    }
    finally {
      await subscriber.quit();
    }
  });

  it("fails startup observably when the invalidation subscriber cannot connect", async () => {
    const logger = { warn: vi.fn() };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const redis = new Redis({
      enableOfflineQueue: false,
      host: "127.0.0.1",
      lazyConnect: true,
      port: 1,
      retryStrategy: () => null,
    });
    try {
      const subscriber = startClientInvalidationSubscriber(
        redis,
        logger as never,
        {
          oidcSession: { revokeClientProtocol: vi.fn(async () => undefined) },
          protocolObjects: { revokeClient: vi.fn(async () => undefined) },
        },
      );

      await vi.waitFor(() => {
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: SystemLogEvent.OidcClientInvalidationSubscriptionFailed,
            err: expect.any(Error),
          }),
          "OIDC client invalidation subscription failed",
        );
      });
      expect(consoleError).not.toHaveBeenCalled();
      subscriber.disconnect();
    }
    finally {
      redis.disconnect();
      consoleError.mockRestore();
    }
  });

  it("keeps access token authority in Session Kernel without legacy token indexes", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const providerSessionUid = testScope.unique("provider-session");
    const tokenId = testScope.unique("token");
    const legacyUserId = randomInt(1, 2_147_483_647);
    const tokenKey = `oidc:model:AccessToken:${tokenId}`;
    const consumedKey = `oidc:consumed:AccessToken:${tokenId}`;
    const currentClientIndex = `oidc:client-objects:${clientId}`;
    const legacyKeys = [
      `oidc:user-tokens:${legacyUserId}`,
      `oidc:client-tokens:${clientId}`,
      `oidc:global-session-tokens:${providerSessionUid}`,
    ];
    for (const key of [tokenKey, consumedKey, currentClientIndex, ...legacyKeys])
      testScope.trackKey(key);
    const adapter = createAdapter(testScope, "AccessToken");

    await adapter.upsert(tokenId, {
      accountId: SUBJECT_IDENTIFIER,
      clientId,
      extra: { globalSessionId: providerSessionUid, userId: legacyUserId },
      sessionUid: providerSessionUid,
    }, 60);

    expect(await testScope.observer.exists(tokenKey)).toBe(1);
    expect(await testScope.observer.zscore(currentClientIndex, tokenKey)).not.toBeNull();
    expect(await testScope.observer.exists(...legacyKeys)).toBe(0);
    expect(Object.keys(createOidcTokenStore(testScope.writer))).toEqual(["revokeAccessToken"]);

    await adapter.destroy(tokenId);

    expect(await testScope.observer.exists(tokenKey, consumedKey)).toBe(0);
  });

  it("removes an access token provider payload during grant cleanup", async () => {
    const testScope = scope!;
    const clientId = testScope.unique("client");
    const grantId = testScope.unique("grant");
    const tokenId = testScope.unique("token");
    const tokenKey = `oidc:model:AccessToken:${tokenId}`;
    const grantIndex = `oidc:grant-objects:${grantId}`;
    const clientIndex = `oidc:client-objects:${clientId}`;
    for (const key of [tokenKey, `oidc:consumed:AccessToken:${tokenId}`, grantIndex, clientIndex])
      testScope.trackKey(key);
    const adapter = createAdapter(testScope, "AccessToken");
    await adapter.upsert(tokenId, {
      accountId: SUBJECT_IDENTIFIER,
      clientId,
      grantId,
      sessionUid: testScope.unique("provider-session"),
    }, 60);

    await adapter.revokeByGrantId(grantId);

    expect(await testScope.observer.exists(tokenKey)).toBe(0);
  });

  it("removes only the invalidated client's provider protocol objects", async () => {
    const testScope = scope!;
    const clientA = testScope.unique("client-a");
    const clientB = testScope.unique("client-b");
    const tokenA = testScope.unique("token-a");
    const tokenB = testScope.unique("token-b");
    const interactionA = testScope.unique("interaction-a");
    const interactionB = testScope.unique("interaction-b");
    const modelKeys = [
      `oidc:model:AccessToken:${tokenA}`,
      `oidc:model:AccessToken:${tokenB}`,
      `oidc:model:Interaction:${interactionA}`,
      `oidc:model:Interaction:${interactionB}`,
    ];
    for (const key of [
      ...modelKeys,
      ...modelKeys.map(key => key.replace("oidc:model:", "oidc:consumed:")),
      `oidc:client-objects:${clientA}`,
      `oidc:client-objects:${clientB}`,
    ]) {
      testScope.trackKey(key);
    }
    const accessTokens = createAdapter(testScope, "AccessToken");
    const interactions = createAdapter(testScope, "Interaction");
    await accessTokens.upsert(tokenA, {
      accountId: SUBJECT_IDENTIFIER,
      clientId: clientA,
      sessionUid: testScope.unique("provider-session-a"),
    }, 60);
    await accessTokens.upsert(tokenB, {
      accountId: SUBJECT_IDENTIFIER,
      clientId: clientB,
      sessionUid: testScope.unique("provider-session-b"),
    }, 60);
    await interactions.upsert(interactionA, { params: { client_id: clientA } }, 60);
    await interactions.upsert(interactionB, { params: { client_id: clientB } }, 60);

    const protocolObjects = createOidcProtocolObjectStore(
      testScope.writer,
      createOidcTokenStore(testScope.writer),
    );
    await protocolObjects.revokeClient(clientA);

    expect(await testScope.observer.exists(modelKeys[0]!, modelKeys[2]!)).toBe(0);
    expect(await testScope.observer.exists(modelKeys[1]!, modelKeys[3]!)).toBe(2);
  });

  it("removes every Session key when the artifact still owns its UID", async () => {
    const testScope = scope!;
    const providerSessionUid = testScope.unique("provider-session");
    const sessionId = testScope.unique("session");
    const artifactKey = `oidc:model:Session:${sessionId}`;
    const consumedKey = `oidc:consumed:Session:${sessionId}`;
    const reverseKey = `oidc:session-uid:${providerSessionUid}`;
    testScope.trackKey(artifactKey);
    testScope.trackKey(consumedKey);
    testScope.trackKey(reverseKey);
    const adapter = createAdapter(testScope);
    await adapter.upsert(sessionId, {
      kernelPrincipalSessionId: "principal-current",
      providerSessionAnchorGeneration: "generation-current",
      uid: providerSessionUid,
    }, 60);
    await adapter.consume(sessionId);
    expect(await Promise.all([
      testScope.observer.exists(artifactKey),
      testScope.observer.exists(consumedKey),
      testScope.observer.exists(reverseKey),
    ])).toEqual([1, 1, 1]);

    await adapter.destroy(sessionId);

    await expect(adapter.findByUid(providerSessionUid)).resolves.toBeUndefined();
    expect(await Promise.all([
      testScope.observer.exists(artifactKey),
      testScope.observer.exists(consumedKey),
      testScope.observer.exists(reverseKey),
    ])).toEqual([0, 0, 0]);
  });

  it("preserves a newer Session owner when an old artifact is destroyed late", async () => {
    const testScope = scope!;
    const providerSessionUid = testScope.unique("provider-session");
    const oldSessionId = testScope.unique("session-old");
    const newSessionId = testScope.unique("session-new");
    const oldArtifactKey = `oidc:model:Session:${oldSessionId}`;
    const newArtifactKey = `oidc:model:Session:${newSessionId}`;
    const reverseKey = `oidc:session-uid:${providerSessionUid}`;
    testScope.trackKey(oldArtifactKey);
    testScope.trackKey(newArtifactKey);
    testScope.trackKey(`oidc:consumed:Session:${oldSessionId}`);
    testScope.trackKey(`oidc:consumed:Session:${newSessionId}`);
    testScope.trackKey(reverseKey);
    const adapter = createAdapter(testScope);
    await adapter.upsert(oldSessionId, {
      kernelPrincipalSessionId: "principal-old",
      providerSessionAnchorGeneration: "generation-old",
      uid: providerSessionUid,
    }, 60);
    await adapter.upsert(newSessionId, {
      kernelPrincipalSessionId: "principal-new",
      providerSessionAnchorGeneration: "generation-new",
      uid: providerSessionUid,
    }, 60);
    expect(await testScope.observer.get(reverseKey)).toBe(newSessionId);

    await adapter.destroy(oldSessionId);

    await expect(adapter.findByUid(providerSessionUid)).resolves.toMatchObject({
      kernelPrincipalSessionId: "principal-new",
      providerSessionAnchorGeneration: "generation-new",
    });
    expect(await testScope.observer.get(reverseKey)).toBe(newSessionId);
    expect(await testScope.observer.exists(oldArtifactKey)).toBe(0);
    expect(await testScope.observer.exists(newArtifactKey)).toBe(1);
  });
});

function createAdapter(testScope: OidcProviderRedisTestScope, model = "Session") {
  return new RedisOidcAdapter(model, testScope.writer, {
    claims: {
      createAuthorizationCodeSnapshot: async (input: CreateOidcAuthorizationCodeSnapshotInput) => ({
        version: 1,
        ...input,
        claims: { sub: input.subjectIdentifier },
      }),
    },
    clientVersions: {
      findActiveVersion: async () => 3,
    },
    oidcSession: {
      registerAuthorizationCodeArtifact: async () => true,
      consumeAuthorizationCodeArtifact: async () => null,
      registerAccessTokenCredential: async input => ({ credentialId: `${input.providerTokenId}-credential` }) as never,
      resolveAccessTokenCredential: async () => null,
      revokeAccessTokenCredential: async () => undefined,
      revokeClientProtocol: async () => undefined,
    },
    providerSessions: {
      consumeStaged: async () => null,
      destroyProviderSession: async () => true,
      ensureClientBinding: async () => null,
      read: async (_sessionUid, clientCode) => ({
        accountId: SUBJECT_IDENTIFIER,
        authTime: 1_782_260_000,
        bindingId: `${clientCode}-binding`,
        clientCode,
        expiresAt: 1_782_263_600,
        oidcConfigVersion: 3,
        principalSessionId: "principal-a",
      }),
      readPrincipalAnchor: async () => null,
    },
    tokens: createOidcTokenStore(testScope.writer),
  });
}
