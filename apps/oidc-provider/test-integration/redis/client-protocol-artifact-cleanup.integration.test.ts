import type { SessionKernelRedis } from "@iam/session-kernel";
import type { ProviderSessionStateRedis } from "../../src/session/provider-session-state.store.ts";
import type {
  OidcProviderRedisTestHarness,
  OidcProviderRedisTestScope,
} from "./redis-test-harness.ts";
import { randomUUID } from "node:crypto";
import { createCustomSsoCleanup } from "@iam/custom-sso/cleanup";
import {
  AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND,
  AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX,
  createLegacyAuthorizationGrantFixture,
} from "@iam/custom-sso/testing";
import {
  createSessionKernel,
  createSessionKernelConfig,
} from "@iam/session-kernel";
import { createSessionKernelKeyBuilder } from "@iam/session-kernel/testing";
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
import { createClientProtocolArtifactCleanup } from "../../src/commands/client-protocol-artifact-cleanup.ts";
import { maintainOnlineAuthState } from "../../src/composition/session/online-auth-state-maintenance.ts";
import { createProviderSessionStateStore } from "../../src/session/provider-session-state.store.ts";
import {
  pendingProviderSessionBindingKey,
  pendingProviderSessionBindingsByClientKey,
  providerSessionBindingLookupKey,
  providerSessionGenerationMembersKey,
  providerSessionPrincipalAnchorKey,
} from "../../src/session/provider-session.ts";
import { createOidcProtocolObjectStore, RedisOidcAdapter } from "../../src/storage/redis-adapter.ts";
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
  vi.restoreAllMocks();
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("client Protocol artifact cleanup real Redis contract", () => {
  it("resets current online owners without indexes, retries partial deletion and independently verifies retained state", async () => {
    const testScope = scope!;
    // The global protocol namespaces must be empty before this test creates any fixtures.
    // A caller-provided Redis with unrelated protocol state is never deleted by this test.
    const namespace = `${testScope.unique("online")}:`;
    testScope.trackPrefix(namespace);
    const options = { kernelNamespace: namespace, writersStopped: true };
    const preflight = await maintainOnlineAuthState({ ...options, redis: testScope.observer, operation: "verify" });
    expect(preflight.status).toBe("passed");
    const kernel = createSessionKernel({
      redis: testScope.writer as unknown as SessionKernelRedis,
      config: createSessionKernelConfig({
        namespace,
        principalAbsoluteTtlMs: 60_000,
        principalIdleTtlMs: 60_000,
        lookupHmacKeys: { current: { id: "reset", secret: "reset-test-secret-0000000000000000000000000" } },
      }),
    });
    const principal = await kernel.createPrincipalSession(randomUUID(), { subjectContext: "opaque-test-context" });
    if (principal.status !== "created" || !principal.externalToken)
      throw new Error("Principal fixture failed");
    const clientCode = testScope.unique("client");
    const binding = await kernel.createClientBinding({
      clientCode,
      principalSessionId: principal.value.principalSessionId,
      protocol: "oidc",
      ttlMs: 30_000,
    });
    if (binding.status !== "created")
      throw new Error("Binding fixture failed");
    const credential = await kernel.issueCredential({
      clientCode,
      principalSessionId: principal.value.principalSessionId,
      protocol: "custom-sso",
      credentialType: "gateway_local_session",
      tokenKind: "localSession",
      ttlMs: 30_000,
    });
    if (credential.status !== "created" || !credential.externalToken)
      throw new Error("Credential fixture failed");
    const grantId = randomUUID();
    const artifact = await kernel.createProtocolArtifact({
      artifactId: grantId,
      artifactType: "authorization_code",
      clientCode,
      principalSessionId: principal.value.principalSessionId,
      protocol: "custom-sso",
      ttlMs: 30_000,
    });
    if (artifact.status !== "created")
      throw new Error("Artifact fixture failed");
    const grantKey = `${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`;
    testScope.trackKey(grantKey);
    const grants = createLegacyAuthorizationGrantFixture({ redis: testScope.writer });
    await grants.initialize({ version: 1, grantId, state: "issued", expiresAt: artifact.value.expiresAt });
    const attempt = testScope.unique("attempt");
    const pendingKey = pendingProviderSessionBindingKey(attempt);
    const pendingIndex = pendingProviderSessionBindingsByClientKey(clientCode);
    testScope.trackKey(pendingKey);
    testScope.trackKey(pendingIndex);
    const state = createProviderSessionStateStore(testScope.writer as unknown as ProviderSessionStateRedis);
    const providerSessionUid = testScope.unique("provider-session");
    const generation = testScope.unique("generation");
    const mappingKeys = [
      providerSessionBindingLookupKey(providerSessionUid, clientCode),
      providerSessionPrincipalAnchorKey(providerSessionUid),
      providerSessionGenerationMembersKey(providerSessionUid, generation),
    ];
    for (const key of mappingKeys)
      testScope.trackKey(key);
    const published = await state.publishRebind({
      attemptId: generation,
      expectedAnchorGeneration: null,
      providerSessionUid,
      expiresAt: binding.value.expiresAt,
      binding: {
        accountId: randomUUID(),
        authTime: 1,
        bindingId: binding.value.bindingId,
        clientCode,
        expiresAt: binding.value.expiresAt,
        oidcConfigVersion: 1,
        principalSessionId: principal.value.principalSessionId,
        mappingOwnerId: randomUUID(),
      },
    });
    expect(published.status).toBe("committed");
    await state.stage({
      accountId: randomUUID(),
      authorizationAttemptId: attempt,
      authTime: 1,
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt: 1,
      oidcConfigVersion: 1,
      principalSessionId: principal.value.principalSessionId,
      providerSessionUid: null,
    }, principal.value.expiresAt);
    // These are intentionally malformed/orphaned owner records, simulating a lost historical index.
    const objectKey = `oidc:model:Interaction:${testScope.unique("orphan")}`;
    const consumedKey = objectKey.replace("oidc:model:", "oidc:consumed:");
    testScope.trackKey(objectKey);
    testScope.trackKey(consumedKey);
    await testScope.writer.mset(objectKey, "orphan", consumedKey, "consumed");
    // Keep a real tombstone + lookup tombstone alongside an active Credential.
    const revokedCredential = await kernel.issueCredential({
      clientCode,
      principalSessionId: principal.value.principalSessionId,
      protocol: "custom-sso",
      credentialType: "gateway_local_session",
      tokenKind: "localSession",
      ttlMs: 30_000,
    });
    if (revokedCredential.status !== "created")
      throw new Error("Revoked credential fixture failed");
    await kernel.revokeCredential(revokedCredential.value.credentialId);
    const keys = createSessionKernelKeyBuilder(namespace);
    await testScope.writer.del(keys.index.principalSessions, keys.index.client(clientCode), pendingIndex);
    const preserved = [
      `${namespace}unknown:preserved`,
      `subject-access:${testScope.unique("preserved")}`,
      `subject-facts:${testScope.unique("preserved")}`,
      `oidc:client-auth-failures:${testScope.unique("preserved")}`,
      `oidc:user-tokens:${testScope.unique("retired")}`,
      `client-runtime-snapshot:v1:${testScope.unique("preserved")}`,
    ];
    for (const key of preserved) {
      testScope.trackKey(key);
      await testScope.writer.set(key, "preserved");
    }
    const noConfirmation = await maintainOnlineAuthState({
      ...options,
      redis: testScope.writer,
      operation: "apply",
      writersStopped: false,
    });
    expect(noConfirmation.status).toBe("failed");
    const dryRun = await maintainOnlineAuthState({ ...options, redis: testScope.writer, operation: "dry-run" });
    expect(dryRun.status).toBe("passed");
    expect(dryRun.counts.oidcObjects?.observed).toBe(2);
    const before = await testScope.observer.mget(grantKey, objectKey, pendingKey);
    expect(before.every(value => value !== null)).toBe(true);
    let batches = 0;
    const partial = await maintainOnlineAuthState({
      ...options,
      operation: "apply",
      redis: {
        scan: (...args) => testScope.writer.scan(...args),
        unlink: async (...batch) => {
          if (++batches === 2)
            throw new Error(`sensitive ${objectKey}`);
          return await testScope.writer.unlink(...batch);
        },
      },
    });
    expect(partial.status).toBe("failed");
    expect(JSON.stringify(partial)).not.toContain(objectKey);
    const remaining = await maintainOnlineAuthState({ ...options, redis: testScope.observer, operation: "verify" });
    expect(remaining.status).toBe("failed");
    const applied = await maintainOnlineAuthState({ ...options, redis: testScope.writer, operation: "apply" });
    expect(applied.status).toBe("passed");
    const verified = await maintainOnlineAuthState({ ...options, redis: testScope.observer, operation: "verify" });
    expect(verified.status).toBe("passed");
    const repeated = await maintainOnlineAuthState({ ...options, redis: testScope.writer, operation: "apply" });
    expect(Object.values(repeated.counts).every(count => count.removed === 0)).toBe(true);
    const readback = await testScope.observer.mget(grantKey, objectKey, consumedKey, pendingKey, ...mappingKeys);
    expect(readback).toEqual([null, null, null, null, null, null, null]);
    const retained = await testScope.observer.mget(...preserved);
    expect(retained).toEqual(preserved.map(() => "preserved"));
    const oldPrincipal = await kernel.resolvePrincipalSession(principal.externalToken);
    const oldCredential = await kernel.resolveCredential(credential.externalToken, credential.value);
    expect(oldPrincipal.status).not.toBe("resolved");
    expect(oldCredential.status).not.toBe("resolved");
  });

  it("cleans exact protocol owners while preserving Principal, Profile, business, audit, and Subject state", async () => {
    const testScope = scope!;
    const prefix = `${testScope.unique("cleanup")}:`;
    const clientCode = testScope.unique("client");
    const grantId = randomUUID();
    const oidcObjectId = testScope.unique("interaction");
    const authorizationAttemptId = testScope.unique("authorization-attempt");
    testScope.trackPrefix(prefix);
    testScope.trackKey(pendingProviderSessionBindingKey(authorizationAttemptId));
    testScope.trackKey(pendingProviderSessionBindingsByClientKey(clientCode));

    testScope.trackKey(`${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`);
    const redemptionStore = createLegacyAuthorizationGrantFixture({
      redis: testScope.writer,
    });
    await redemptionStore.initialize({
      version: 1,
      grantId,
      state: "issued",
      expiresAt: Date.now() + 30_000,
    });
    const kernel = createSessionKernel({
      redis: testScope.writer as unknown as SessionKernelRedis,
      config: createSessionKernelConfig({
        lookupHmacKeys: {
          current: {
            id: "cleanup-test-current",
            secret: "cleanup-test-session-kernel-secret-000000000000",
          },
        },
        namespace: `${prefix}session`,
        principalAbsoluteTtlMs: 60_000,
        principalIdleTtlMs: 30_000,
      }),
      cleanupAdapters: [
        createCustomSsoCleanup({ redis: testScope.writer }),
      ],
    });
    const principal = await kernel.createPrincipalSession(
      "00000000-0000-4000-8000-000000000024",
      { subjectContext: "opaque-test-context" },
    );
    if (principal.status !== "created" || principal.externalToken === undefined)
      throw new Error("expected Principal Session fixture");
    expect(await kernel.resolvePrincipalSession(principal.externalToken)).toMatchObject({
      status: "resolved",
    });
    const artifact = await kernel.createProtocolArtifact({
      artifactId: grantId,
      artifactType: "authorization_code",
      clientCode,
      principalSessionId: principal.value.principalSessionId,
      protocol: "custom-sso",
      tokenKind: "authCode",
      ttlMs: 30_000,
      cleanupRefs: [{
        protocol: "custom-sso",
        kind: AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND,
        ref: grantId,
      }],
    });
    if (artifact.status !== "created" || artifact.externalToken === undefined)
      throw new Error("expected Custom SSO Grant fixture");
    const gatewaySession = await kernel.issueCredential({
      clientCode,
      credentialType: "gateway_local_session",
      principalSessionId: principal.value.principalSessionId,
      protocol: "custom-sso",
      tokenKind: "localSession",
      ttlMs: 30_000,
    });
    if (gatewaySession.status !== "created" || gatewaySession.externalToken === undefined)
      throw new Error("expected Gateway Local Session fixture");
    const oidcBinding = await kernel.createClientBinding({
      clientCode,
      principalSessionId: principal.value.principalSessionId,
      protocol: "oidc",
      ttlMs: 30_000,
    });
    if (oidcBinding.status !== "created")
      throw new Error("expected OIDC Binding fixture");
    const oidcCredential = await kernel.issueCredential({
      bindingId: oidcBinding.value.bindingId,
      clientCode,
      credentialType: "access_token",
      principalSessionId: principal.value.principalSessionId,
      protocol: "oidc",
      ttlMs: 30_000,
    });
    if (oidcCredential.status !== "created" || oidcCredential.externalToken === undefined)
      throw new Error("expected OIDC Credential fixture");
    expect(await kernel.resolvePrincipalSession(principal.externalToken)).toMatchObject({
      status: "resolved",
    });

    const rawKey = `${prefix}oidc:model:Interaction:${oidcObjectId}`;
    const rawIndex = `${prefix}oidc:client-objects:${clientCode}`;
    const unused = () => {
      throw new Error("Interaction fixture must not call a Session dependency");
    };
    const adapter = new RedisOidcAdapter("Interaction", testScope.writer, {
      claims: { createAuthorizationCodeSnapshot: unused },
      clientVersions: { findActiveVersion: async () => 7 },
      oidcSession: {
        registerAccessTokenCredential: unused,
        registerAuthorizationCodeArtifact: unused,
        resolveAuthorizationCodeSessionLifetime: async (_id: string, serializedProviderCode: string) => ({ serializedProviderCode, remainingSeconds: 90, artifact: { version: 1 as const, artifactId: "code", protocol: "oidc", artifactType: "authorization_code", lookupHash: "lookup", lookupKeyId: "test", issuedAt: 0, expiresAt: 60000, cleanupRefs: [] } }),
        consumeAuthorizationCodeArtifact: unused,
        resolveAccessTokenCredential: unused,
        revokeAccessTokenCredential: unused,
      },
      providerSessions: {
        consumeStaged: unused,
        destroyProviderSession: unused,
        ensureClientBinding: unused,
        readForAuthorization: unused,
        readPrincipalAnchor: unused,
      },
      tokens: { revokeAccessToken: unused },
    }, prefix);
    const nativeNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => nativeNow() - 120_000);
    await adapter.upsert(oidcObjectId, { clientId: clientCode }, 30);
    clock.mockRestore();
    const factsKey = `${prefix}subject-facts:preserved`;
    const barrierKey = `${prefix}subject-access:preserved`;
    const profileKey = `${prefix}profile:preserved`;
    const businessKey = `${prefix}business:preserved`;
    const auditKey = `${prefix}audit:preserved`;
    const preservedValues = [
      "facts",
      "barrier",
      JSON.stringify({ displayName: "Preserved Profile" }),
      JSON.stringify({ orderId: "preserved-order" }),
      JSON.stringify({ event: "preserved-audit" }),
    ] as const;
    const preservedKeys = [factsKey, barrierKey, profileKey, businessKey, auditKey];
    await testScope.writer.mset(
      factsKey,
      preservedValues[0],
      barrierKey,
      preservedValues[1],
      profileKey,
      preservedValues[2],
      businessKey,
      preservedValues[3],
      auditKey,
      preservedValues[4],
    );
    const redemptionKey = `${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`;
    const redemptionBeforeDryRun = await testScope.observer.get(redemptionKey);
    const rawIndexSizeBeforeDryRun = await testScope.observer.zcard(rawIndex);

    const protocolObjects = createOidcProtocolObjectStore(
      testScope.writer,
      { keyPrefix: prefix },
    );
    const providerSessionBindings = createProviderSessionStateStore(
      testScope.writer as unknown as ProviderSessionStateRedis,
    );
    await providerSessionBindings.stage({
      accountId: randomUUID(),
      authorizationAttemptId,
      authTime: Math.floor(Date.now() / 1000),
      clientCode,
      expectedAnchorGeneration: null,
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      oidcConfigVersion: 7,
      principalSessionId: principal.value.principalSessionId,
      providerSessionUid: null,
    }, Date.now() + 60_000);
    const cleanup = createClientProtocolArtifactCleanup({
      kernel,
      protocolObjects,
      providerSessionBindings,
    });
    const manifest = {
      version: 2 as const,
      clients: [{
        clientCode,
        customSso: {
          expectedEpoch: 3,
          ownerStatus: "confirmed" as const,
        },
        oidc: { expectedEpoch: 7, ownerStatus: "confirmed" as const },
      }],
    };

    expect(await kernel.resolvePrincipalSession(principal.externalToken)).toMatchObject({
      status: "resolved",
    });
    const dryRun = await cleanup.dryRun(manifest);
    expect(dryRun.status).toBe("passed");
    expect(dryRun.counts).toMatchObject({
      kernelObjects: 4,
      protocolObjects: 1,
      providerSessionBindings: 1,
    });
    expect(await testScope.observer.get(rawKey)).not.toBeNull();
    expect(await testScope.observer.get(
      pendingProviderSessionBindingKey(authorizationAttemptId),
    )).not.toBeNull();
    expect(await testScope.observer.get(redemptionKey)).toBe(redemptionBeforeDryRun);
    expect(await testScope.observer.zcard(rawIndex)).toBe(rawIndexSizeBeforeDryRun);
    expect(await testScope.observer.mget(...preservedKeys)).toEqual(preservedValues);

    const cleanupClock = vi.spyOn(Date, "now").mockImplementation(() => nativeNow() + 120_000);
    let applied;
    try {
      applied = await cleanup.apply(manifest);
    }
    finally {
      cleanupClock.mockRestore();
    }
    expect(applied.status).toBe("passed");
    expect((await cleanup.verify(manifest)).status).toBe("passed");
    expect(await testScope.observer.get(redemptionKey)).toBeNull();
    expect(await testScope.observer.get(rawKey)).toBeNull();
    expect(await testScope.observer.get(
      pendingProviderSessionBindingKey(authorizationAttemptId),
    )).toBeNull();
    expect(await kernel.resolvePrincipalSession(principal.externalToken)).toMatchObject({
      status: "resolved",
    });
    expect(await kernel.consumeProtocolArtifact(artifact.externalToken, artifact.value, artifact.value)).toMatchObject({
      status: "revoked",
    });
    expect(await kernel.resolveCredential(gatewaySession.externalToken, gatewaySession.value)).toMatchObject({
      status: "revoked",
    });
    expect(await kernel.resolveCredential(oidcCredential.externalToken, oidcCredential.value)).toMatchObject({
      status: "revoked",
    });
    expect(await testScope.observer.mget(...preservedKeys)).toEqual(preservedValues);
  });
});
