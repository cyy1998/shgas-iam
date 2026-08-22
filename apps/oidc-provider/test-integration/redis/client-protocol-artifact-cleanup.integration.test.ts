import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { ProviderSessionStateRedis } from "../../src/session/provider-session-state.store.ts";
import type {
  OidcProviderRedisTestHarness,
  OidcProviderRedisTestScope,
} from "./redis-test-harness.ts";
import { randomUUID } from "node:crypto";
import {
  AUTHORIZATION_GRANT_REDEMPTION_CLEANUP_KIND,
  createAuthorizationGrantRedemptionCleanupAdapter,
  createRedisAuthorizationGrantRedemptionStore,
} from "@iam/api-core/authorization-grant";
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
import { createClientProtocolArtifactCleanup } from "../../src/commands/client-protocol-artifact-cleanup.ts";
import { createProviderSessionStateStore } from "../../src/session/provider-session-state.store.ts";
import {
  pendingProviderSessionBindingKey,
  pendingProviderSessionBindingsByClientKey,
} from "../../src/session/provider-session.ts";
import { createOidcProtocolObjectStore } from "../../src/storage/redis-adapter.ts";
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

describe("client Protocol artifact cleanup real Redis contract", () => {
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

    const redemptionStore = createRedisAuthorizationGrantRedemptionStore({
      keyPrefix: `${prefix}authorization-grant:redemption:v1:`,
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
        createAuthorizationGrantRedemptionCleanupAdapter(redemptionStore),
      ],
      principalAccessFence: {
        capture: async () => randomUUID(),
        validate: async () => ({ ok: true }),
      },
    });
    const principal = await kernel.createPrincipalSession(
      "00000000-0000-4000-8000-000000000024",
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
    await testScope.writer.set(rawKey, JSON.stringify({ clientId: clientCode }), "PX", 30_000);
    await testScope.writer.zadd(rawIndex, Date.now() + 30_000, rawKey);
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
    const redemptionKey = `${prefix}authorization-grant:redemption:v1:${grantId}`;
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
    }, 60);
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
          targetCatalogVersion: 2 as const,
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

    const applied = await cleanup.apply(manifest);
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
    expect(await kernel.consumeProtocolArtifact(artifact.externalToken)).toMatchObject({
      status: "revoked",
    });
    expect(await kernel.resolveCredential(gatewaySession.externalToken)).toMatchObject({
      status: "revoked",
    });
    expect(await kernel.resolveCredential(oidcCredential.externalToken)).toMatchObject({
      status: "revoked",
    });
    expect(await testScope.observer.mget(...preservedKeys)).toEqual(preservedValues);
  });
});
