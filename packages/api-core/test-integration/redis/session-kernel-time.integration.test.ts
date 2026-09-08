import type { RedisTestHarness, SessionKernelRedisTestScope } from "./redis-test-harness";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createRedisTestHarness, waitForRedisCondition } from "./redis-test-harness";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const lifetime = { principalIdleTtlMs: 2_000, principalAbsoluteTtlMs: 5_000, tombstoneTtlMs: 100, tombstoneGraceMs: 0 };
let harness: RedisTestHarness;
let scope: SessionKernelRedisTestScope | undefined;

beforeAll(async () => {
  harness = await createRedisTestHarness();
});
afterEach(async () => {
  await scope?.close();
  scope = undefined;
});
afterAll(async () => {
  await harness.close();
});

describe("Session Kernel Redis lifecycle time", () => {
  test.each([0, 5_000, -5_000])("owns all four lifecycles across application offset %d and clock jumps", async (offset) => {
    let writerOffset = offset;
    let observerOffset = -offset;
    scope = await harness.createSessionKernelScope({
      lifetime,
      writerClock: { now: () => Date.now() + writerOffset },
      observerClock: { now: () => Date.now() + observerOffset },
    });
    const principal = await scope.writer.createPrincipalSession(subjectIdentifier);
    if (principal.status !== "created")
      throw new Error("expected Principal Session");
    expect(principal.value.expiresAt - principal.observedAt).toBe(2_000);
    expect(principal.value.absoluteExpiresAt - principal.observedAt).toBe(5_000);
    const parent = { principalSessionId: principal.value.principalSessionId, clientCode: "portal", protocol: "oidc" };
    const binding = await scope.writer.createClientBinding({ ...parent, ttlMs: 10_000, renewalPolicy: "extend_with_principal" });
    const credential = await scope.writer.issueCredential({ ...parent, ttlMs: 10_000, credentialType: "access_token", renewalPolicy: "extend_with_principal" });
    const fixed = await scope.writer.issueCredential({ ...parent, ttlMs: 10_000, credentialType: "access_token" });
    const artifact = await scope.writer.createProtocolArtifact({ ...parent, ttlMs: 300, artifactType: "authorization_code" });
    if (binding.status !== "created" || credential.status !== "created" || fixed.status !== "created" || artifact.status !== "created")
      throw new Error("expected all derived objects");
    expect(binding.value.expiresAt).toBe(principal.value.expiresAt);
    expect(credential.value.expiresAt).toBe(principal.value.expiresAt);
    expect(artifact.value.expiresAt - artifact.observedAt).toBe(300);

    writerOffset += 86_400_000;
    observerOffset -= 86_400_000;
    const readPrincipal = await scope.observer.resolvePrincipalSession(principal.externalToken!);
    const readBinding = await scope.observer.resolveClientBindingById(binding.value.bindingId);
    const readCredential = await scope.observer.resolveCredential(credential.externalToken!);
    const readArtifact = await scope.observer.resolveProtocolArtifact(artifact.externalToken!);
    for (const result of [readPrincipal, readBinding, readCredential, readArtifact])
      expect(result.status).toBe("resolved");
    expect(readPrincipal).toMatchObject({ value: { authTime: principal.value.authTime } });
    const consumed = await scope.observer.consumeProtocolArtifact(artifact.externalToken!);
    expect(consumed.status).toBe("resolved");
    const replay = await scope.writer.consumeProtocolArtifact(artifact.externalToken!);
    expect(replay.status).toBe("consumed_replay");

    await waitForRedisCondition(async () => (await scope!.redisNow()) >= principal.observedAt + 1_000, "Redis did not reach renewal observation");
    writerOffset -= 172_800_000;
    observerOffset += 172_800_000;
    const renewed = await scope.writer.renewPrincipalSession(parent.principalSessionId);
    if (renewed.status !== "resolved")
      throw new Error("expected renewal");
    expect(renewed.value.expiresAt).toBe(Math.min(renewed.observedAt + 2_000, principal.value.absoluteExpiresAt));
    expect(renewed.value.authTime).toBe(principal.value.authTime);
    await waitForRedisCondition(async () => (await scope!.redisNow()) >= principal.value.expiresAt, "Redis did not reach original deadline");
    const byToken = await scope.observer.resolvePrincipalSession(principal.externalToken!);
    const byId = await scope.observer.resolvePrincipalSessionById(parent.principalSessionId);
    const renewedCredential = await scope.observer.resolveCredential(credential.externalToken!);
    const renewedBinding = await scope.observer.resolveClientBindingById(binding.value.bindingId);
    for (const result of [byToken, byId, renewedCredential, renewedBinding])
      expect(result).toMatchObject({ status: "resolved", value: { expiresAt: renewed.value.expiresAt } });
    const expiredFixed = await scope.observer.resolveCredential(fixed.externalToken!);
    expect(expiredFixed.status).toBe("missing_or_expired");
    const inventory = await scope.observer.listPrincipalSessions({ offset: 0, limit: 10 });
    expect(inventory.total).toBe(1);
    expect(inventory.items[0]?.principalSessionId).toBe(parent.principalSessionId);
    const revoked = await scope.observer.revokeUserSessions(principal.value.principal);
    expect(revoked.principalSessions.revoked).toBe(1);
    expect(revoked.bindings.revoked).toBe(1);
    expect(revoked.credentials.revoked).toBe(1);
    const revokedCredential = await scope.writer.resolveCredential(credential.externalToken!);
    expect(revokedCredential.status).toBe("revoked");
  });

  test("keeps an acquired authentication result while a later renewal cannot resurrect its missing object", async () => {
    scope = await harness.createSessionKernelScope({ lifetime: { ...lifetime, principalIdleTtlMs: 200 } });
    const principal = await scope.writer.createPrincipalSession(subjectIdentifier);
    if (principal.status !== "created")
      throw new Error("expected Principal Session");
    const pause = scope.pauseNextPrincipalValidation();
    const resolving = scope.writer.resolvePrincipalSession(principal.externalToken!);
    try {
      await pause.reached;
      await waitForRedisCondition(async () => !await scope!.activeObjectExists({ kind: "principal_session", id: principal.value.principalSessionId }), "Principal Session did not expire");
    }
    finally { pause.release(); }
    const resolved = await resolving;
    expect(resolved).toMatchObject({ status: "resolved", value: { expiresAt: principal.value.expiresAt } });
    const renewed = await scope.writer.renewPrincipalSession(principal.value.principalSessionId);
    expect(renewed.status).toBe("missing_or_expired");
  });

  test("retains pending cleanup beyond its deadline and finalizes it using Redis time after an application jump", async () => {
    let failCleanup = true;
    let offset = 5_000;
    scope = await harness.createSessionKernelScope({
      lifetime,
      writerClock: { now: () => Date.now() + offset },
      observerClock: { now: () => Date.now() - offset },
      cleanupAdapters: [{ protocol: "oidc", kind: "payload", cleanup: async () => {
        if (failCleanup)
          throw new Error("cleanup temporarily unavailable");
      } }],
    });
    const artifact = await scope.writer.createProtocolArtifact({ protocol: "oidc", clientCode: "portal", artifactType: "code", ttlMs: 200, cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "owned" }] });
    if (artifact.status !== "created")
      throw new Error("expected artifact");
    const revoked = await scope.writer.revokeClientProtocol("portal", "oidc");
    expect(revoked.cleanup.failed).toBe(1);
    const tombstone = await scope.observer.resolveProtocolArtifact(artifact.externalToken!);
    if (tombstone.status !== "revoked")
      throw new Error("expected tombstone");
    await waitForRedisCondition(async () => (await scope!.redisNow()) >= tombstone.tombstone.expiresAt, "Redis did not reach tombstone deadline");
    const pending = await scope.observer.inventoryClientProtocol("portal", "oidc");
    expect(pending.counts.cleanupPending).toBe(1);
    offset = -86_400_000;
    failCleanup = false;
    const retried = await scope.observer.revokeClientProtocol("portal", "oidc");
    expect(retried.cleanup).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    const completed = await scope.writer.inventoryClientProtocol("portal", "oidc");
    expect(completed.counts.total).toBe(0);
    const missing = await scope.writer.resolveProtocolArtifact(artifact.externalToken!);
    expect(missing.status).toBe("missing_or_expired");
  });

  test.each(["binding", "credential", "artifact"] as const)("uses the acquired parent deadline when issuing %s across parent expiry", async (kind) => {
    scope = await harness.createSessionKernelScope({ lifetime: { ...lifetime, principalIdleTtlMs: 200 } });
    const principal = await scope.writer.createPrincipalSession(subjectIdentifier);
    if (principal.status !== "created")
      throw new Error("expected Principal Session");
    const input = { principalSessionId: principal.value.principalSessionId, clientCode: "portal", protocol: "oidc", ttlMs: 2_000 };
    const pause = scope.pauseNextPrincipalValidation();
    const issuing = kind === "binding"
      ? scope.writer.createClientBinding(input)
      : kind === "credential"
        ? scope.writer.issueCredential({ ...input, credentialType: "access_token" })
        : scope.writer.createProtocolArtifact({ ...input, artifactType: "authorization_code" });
    try {
      await pause.reached;
      await waitForRedisCondition(async () => !await scope!.activeObjectExists({ kind: "principal_session", id: principal.value.principalSessionId }), "Principal Session did not expire");
    }
    finally {
      pause.release();
    }
    const issued = await issuing;
    if (issued.status !== "created")
      throw new Error("expected issuance to preserve its acquired parent validation");
    expect(issued.observedAt).toBeLessThan(principal.value.expiresAt);
    expect(issued.value.expiresAt).toBe(kind === "artifact" ? issued.observedAt + 2_000 : principal.value.expiresAt);
    const parent = await scope.observer.resolvePrincipalSession(principal.externalToken!);
    expect(parent.status).toBe("missing_or_expired");
  });

  test.each(["renew", "consume"] as const)("does not resurrect a missing object after paused %s validation", async (operation) => {
    scope = await harness.createSessionKernelScope({ lifetime: { ...lifetime, principalIdleTtlMs: 200 } });
    const principal = await scope.writer.createPrincipalSession(subjectIdentifier);
    if (principal.status !== "created")
      throw new Error("expected Principal Session");
    const artifact = await scope.writer.createProtocolArtifact({ principalSessionId: principal.value.principalSessionId, protocol: "oidc", artifactType: "code", ttlMs: 200 });
    if (artifact.status !== "created")
      throw new Error("expected Protocol Artifact");
    const pause = scope.pauseNextPrincipalValidation();
    const pending = operation === "renew"
      ? scope.writer.renewPrincipalSession(principal.value.principalSessionId)
      : scope.writer.consumeProtocolArtifact(artifact.externalToken!);
    try {
      await pause.reached;
      await waitForRedisCondition(async () => !await scope!.activeObjectExists(operation === "renew"
        ? { kind: "principal_session", id: principal.value.principalSessionId }
        : { kind: "artifact", id: artifact.value.artifactId }), "Lifecycle object did not expire");
    }
    finally {
      pause.release();
    }
    const result = await pending;
    expect(result.status).toBe("missing_or_expired");
  });
});
