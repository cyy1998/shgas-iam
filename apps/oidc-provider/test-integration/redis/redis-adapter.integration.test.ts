import type { CreateOidcAuthorizationCodeSnapshotInput } from "../../src/provider/claims-snapshot.ts";
import type {
  OidcProviderRedisTestHarness,
  OidcProviderRedisTestScope,
} from "./redis-test-harness.ts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
import { createOidcTokenStore } from "../../src/stores/token.store.ts";
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

describe("redis OIDC adapter real Redis contract", () => {
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

function createAdapter(testScope: OidcProviderRedisTestScope) {
  return new RedisOidcAdapter("Session", testScope.writer, {
    claims: {
      createAuthorizationCodeSnapshot: async (input: CreateOidcAuthorizationCodeSnapshotInput) => ({
        version: 1,
        ...input,
        claims: { sub: input.subjectIdentifier },
      }),
    },
    clientVersions: {
      findActiveVersion: async () => null,
    },
    oidcSession: {
      registerAuthorizationCodeArtifact: async () => true,
      consumeAuthorizationCodeArtifact: async () => null,
      registerAccessTokenCredential: async () => null,
      resolveAccessTokenCredential: async () => null,
      revokeAccessTokenCredential: async () => undefined,
      revokeClientProtocol: async () => undefined,
    },
    providerSessions: {
      consumeStaged: async () => null,
      destroyProviderSession: async () => true,
      ensureClientBinding: async () => null,
      read: async () => null,
      readPrincipalAnchor: async () => null,
    },
    tokens: createOidcTokenStore(testScope.writer),
  });
}
