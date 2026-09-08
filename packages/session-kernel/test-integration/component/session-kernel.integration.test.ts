import type {
  SessionKernel,
  SessionKernelDependencies,
  SessionKernelRedisTransaction,
} from "@iam/session-kernel";

import { createSessionKernelConfig } from "@iam/session-kernel";
import * as sessionKernelPublicModule from "@iam/session-kernel";
import { createSessionKernelForTesting, KernelFakeRedis } from "@iam/session-kernel/testing";
import { describe, expect, test } from "bun:test";
import { SessionKernelLogEvent } from "../../src/log-events";
import { createLookupHash } from "../../src/security/hmac";
import { generateKernelToken } from "../../src/security/token";
import { parseLifecycleObject } from "../../src/state/model";

import { evaluateFreshness } from "../../src/state/time";
import { createSessionKernelKeyBuilder, encodeIndexMember, parseIndexMember } from "../../src/storage/keys";

type RedisResult = [Error | null, unknown];

const publicDependencyBoundary = {
  // @ts-expect-error artifact consumption settlement is internal to Session Kernel.
  artifactConsumer: undefined,
} satisfies Partial<SessionKernelDependencies>;
void publicDependencyBoundary;

class FailingRedis extends KernelFakeRedis {
  override multi() {
    const transaction: SessionKernelRedisTransaction = {
      set: () => transaction,
      pexpireat: () => transaction,
      del: () => transaction,
      zadd: () => transaction,
      zrem: () => transaction,
      exec: async () => [[new Error("redis down"), null] as RedisResult],
    };
    return transaction;
  }
}

class FailNextTransactionRedis extends KernelFakeRedis {
  failNextTransaction = false;

  override multi() {
    if (!this.failNextTransaction)
      return super.multi();
    this.failNextTransaction = false;
    const transaction: SessionKernelRedisTransaction = {
      set: () => transaction,
      pexpireat: () => transaction,
      del: () => transaction,
      zadd: () => transaction,
      zrem: () => transaction,
      exec: async () => [[new Error("redis transaction failed"), null] as RedisResult],
    };
    return transaction;
  }
}

function createConfig(
  redis: KernelFakeRedis,
  overrides: Partial<Parameters<typeof createSessionKernelConfig>[0]> = {},
) {
  return createSessionKernelConfig({
    principalIdleTtlMs: 60_000,
    principalAbsoluteTtlMs: 300_000,
    tombstoneTtlMs: 10_000,
    tombstoneGraceMs: 5_000,
    lookupHmacKeys: {
      current: { id: "current", secret: "c".repeat(32) },
    },
    clock: { now: () => redis.now },
    ...overrides,
  });
}

function createKernel(redis = new KernelFakeRedis(), overrides: Partial<Parameters<typeof createConfig>[1]> = {}) {
  const config = createConfig(redis, overrides);
  return { redis, config, kernel: createSessionKernel({ redis, config }) };
}

function createSessionKernel(
  deps: Omit<SessionKernelDependencies, "principalAccessFence">
    & Partial<Pick<SessionKernelDependencies, "principalAccessFence">>,
) {
  return createSessionKernelForTesting({
    principalAccessFence: {
      capture: () => "20000000-0000-4000-8000-000000000001",
      validate: () => ({ ok: true }),
    },
    ...deps,
  });
}

function createKernelLogCapture() {
  const entries: Array<{ data: Record<string, unknown>; message: string; level: "info" | "warn" }> = [];
  return {
    entries,
    logger: {
      info(data: Record<string, unknown>, message: string) {
        entries.push({ data, message, level: "info" });
      },
      warn(data: Record<string, unknown>, message: string) {
        entries.push({ data, message, level: "warn" });
      },
    },
  };
}

function createDerivedObject(
  kernel: SessionKernel,
  operation: "artifact" | "binding" | "credential",
  principalSessionId: string,
) {
  if (operation === "binding") {
    return kernel.createClientBinding({
      principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
    });
  }
  if (operation === "credential") {
    return kernel.issueCredential({
      principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      ttlMs: 30_000,
    });
  }
  return kernel.createProtocolArtifact({
    principalSessionId,
    protocol: "oidc",
    clientCode: "portal",
    artifactType: "authorization_code",
    ttlMs: 30_000,
  });
}

function createEmptyRevokeSummaryForExpectation() {
  const counter = {
    revoked: 0,
    alreadyRevoked: 0,
    missing: 0,
    excluded: 0,
  };
  return {
    principalSessions: counter,
    bindings: counter,
    credentials: counter,
    artifacts: counter,
    cleanup: {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      failures: [],
    },
  };
}

function subjectIdentifierFor(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const principal = { principalType: "user", subjectId: subjectIdentifierFor(1) };

describe("session kernel module boundaries", () => {
  test("keeps artifact consumption mechanics out of the public module", () => {
    expect(sessionKernelPublicModule).not.toHaveProperty(
      "createRedisSessionKernelArtifactConsumer",
    );
    expect(sessionKernelPublicModule).not.toHaveProperty("SessionKernelStore");
  });

  test("generates a PrincipalSession token through the Kernel entry", () => {
    const redis = new KernelFakeRedis();
    const token = generateKernelToken(createConfig(redis), "principalSession");
    expect(token.startsWith("iam_ps_")).toBe(true);
  });

  test("permanently rejects a stale subject generation without revoking newer sessions", async () => {
    const redis = new KernelFakeRedis();
    let currentGeneration = "20000000-0000-4000-8000-000000000001";
    const kernel = createSessionKernel({
      redis,
      config: createConfig(redis),
      principalAccessFence: {
        capture: () => currentGeneration,
        validate: session => (
          session.subjectAccessTransitionId === currentGeneration
            ? { ok: true }
            : { ok: false, reason: "session_generation_stale" }
        ),
      },
    });
    const oldSession = await kernel.createPrincipalSession(principal.subjectId);
    const oldSessionForRenew = await kernel.createPrincipalSession(principal.subjectId);
    expect(oldSession.status).toBe("created");
    expect(oldSessionForRenew.status).toBe("created");

    currentGeneration = "20000000-0000-4000-8000-000000000002";
    const newSession = await kernel.createPrincipalSession(principal.subjectId);
    expect(newSession.status).toBe("created");
    if (
      oldSession.status !== "created"
      || oldSessionForRenew.status !== "created"
      || newSession.status !== "created"
    ) {
      throw new Error("expected Principal Sessions to be created");
    }

    await expect(kernel.renewPrincipalSession(oldSessionForRenew.value.principalSessionId))
      .resolves
      .toMatchObject({
        status: "validation_failed",
        reason: "session_generation_stale",
      });
    await expect(kernel.resolvePrincipalSession(oldSession.externalToken!))
      .resolves
      .toMatchObject({
        status: "validation_failed",
        reason: "session_generation_stale",
      });
    await expect(kernel.listPrincipalSessions({
      limit: 10,
      offset: 0,
      subjectIdentifier: principal.subjectId,
    })).resolves.toMatchObject({
      items: [{
        principalSessionId: newSession.value.principalSessionId,
      }],
      total: 1,
    });
    await expect(kernel.resolvePrincipalSession(newSession.externalToken!))
      .resolves
      .toMatchObject({
        status: "resolved",
        value: {
          principalSessionId: newSession.value.principalSessionId,
          subjectAccessTransitionId: "20000000-0000-4000-8000-000000000002",
        },
      });
  });

  test("does not let delayed disabled validation cleanup revoke a newer transition", async () => {
    const redis = new KernelFakeRedis();
    const oldTransitionId = "20000000-0000-4000-8000-000000000001";
    const newTransitionId = "20000000-0000-4000-8000-000000000002";
    let currentTransitionId = oldTransitionId;
    let delayOldValidation = false;
    const validationStarted = Promise.withResolvers<void>();
    const validationCanFinish = Promise.withResolvers<void>();
    const kernel = createSessionKernel({
      redis,
      config: createConfig(redis),
      principalAccessFence: {
        capture: () => currentTransitionId,
        validate: async (target) => {
          if (
            delayOldValidation
            && target.subjectAccessTransitionId === oldTransitionId
          ) {
            validationStarted.resolve();
            await validationCanFinish.promise;
          }
          return target.subjectAccessTransitionId === currentTransitionId
            ? { ok: true }
            : { ok: false, reason: "user_disabled" };
        },
      },
    });
    const oldSession = await kernel.createPrincipalSession(principal.subjectId);
    if (oldSession.status !== "created")
      throw new Error("expected old Principal Session");

    delayOldValidation = true;
    const resolvingOld = kernel.resolvePrincipalSession(oldSession.externalToken!);
    await validationStarted.promise;
    currentTransitionId = newTransitionId;
    const newSession = await kernel.createPrincipalSession(principal.subjectId);
    if (newSession.status !== "created")
      throw new Error("expected new Principal Session");

    validationCanFinish.resolve();
    await expect(resolvingOld).resolves.toMatchObject({
      status: "validation_failed",
      reason: "user_disabled",
    });
    await expect(kernel.resolvePrincipalSession(newSession.externalToken!))
      .resolves
      .toMatchObject({
        status: "resolved",
        value: {
          principalSessionId: newSession.value.principalSessionId,
          subjectAccessTransitionId: newTransitionId,
        },
      });
  });
});

describe("session kernel config, keys, token, and HMAC", () => {
  test("rejects invalid lookup HMAC configuration", () => {
    const redis = new KernelFakeRedis();
    expect(() => createConfig(redis, {
      lookupHmacKeys: { current: { id: "", secret: "c".repeat(32) } },
    })).toThrow("key id");
    expect(() => createConfig(redis, {
      lookupHmacKeys: { current: { id: "short", secret: "too-short" } },
    })).toThrow("at least 32 bytes");
    expect(() => createConfig(redis, {
      lookupHmacKeys: {
        current: { id: "same", secret: "c".repeat(32) },
        previous: { id: "same", secret: "p".repeat(32) },
      },
    })).toThrow("ids must be different");
  });

  test("builds namespaced keys and parses compact index members", () => {
    const keys = createSessionKernelKeyBuilder();
    expect(keys.active("principal_session", "ps-1")).toBe("sess:v2:active:p:ps-1");
    expect(keys.lookup("credential", "hash")).toBe("sess:v2:lookup:c:hash");
    expect(keys.index.principalSessions).toBe("sess:v2:idx:principal_sessions");
    expect(parseIndexMember(encodeIndexMember("artifact", "artifact:1"))).toEqual({
      kind: "artifact",
      id: "artifact:1",
    });
  });

  test("uses current lookup first and previous lookup fallback without storing bearer plaintext", async () => {
    const redis = new KernelFakeRedis();
    const previousConfig = createConfig(redis, {
      lookupHmacKeys: { current: { id: "previous", secret: "p".repeat(32) } },
    });
    const oldKernel = createSessionKernel({ redis, config: previousConfig });
    const created = await oldKernel.createPrincipalSession(principal.subjectId);
    expect(created.status).toBe("created");
    if (created.status !== "created" || !created.externalToken)
      return;

    const currentConfig = createConfig(redis, {
      lookupHmacKeys: {
        current: { id: "current", secret: "c".repeat(32) },
        previous: { id: "previous", secret: "p".repeat(32) },
      },
    });
    const kernel = createSessionKernel({ redis, config: currentConfig });
    const resolved = await kernel.resolvePrincipalSession(created.externalToken);

    expect(resolved.status).toBe("resolved");
    if (resolved.status === "resolved")
      expect(resolved.lookupKeyId).toBe("previous");
    expect(redis.allStoredText()).not.toContain(created.externalToken);
  });

  test("evaluates freshness requirements", async () => {
    const { redis, kernel } = createKernel();
    const created = await kernel.createPrincipalSession(principal.subjectId, {
      amr: ["pwd", "mfa"],
      acr: "2",
    });
    expect(created.status).toBe("created");
    if (created.status !== "created")
      return;

    expect(evaluateFreshness(created.value, {
      maxAgeSeconds: 60,
      requiredAmr: ["mfa"],
      minimumAcr: "2",
    }, redis.now)).toEqual({ satisfied: true });
    expect(evaluateFreshness(created.value, {
      forceReauthentication: true,
      requiredAmr: ["webauthn"],
      minimumAcr: "3",
    }, redis.now)).toEqual({
      satisfied: false,
      reasons: ["force_reauthentication", "amr_missing", "acr_too_low"],
    });
  });
});

describe("session kernel lifecycle", () => {
  test("creates a Principal Session from only a Subject Identifier and authentication context", async () => {
    const { redis, kernel } = createKernel();
    const subjectIdentifier = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";

    const created = await kernel.createPrincipalSession(subjectIdentifier, {
      amr: ["pwd"],
      origin: {
        ip: "203.0.113.10",
        userAgent: "browser/1.0",
      },
    });

    expect(created).toMatchObject({
      status: "created",
      value: {
        principal: {
          principalType: "user",
          subjectId: subjectIdentifier,
        },
        amr: ["pwd"],
      },
    });
    if (created.status !== "created")
      return;
    expect(created.value.principal).toEqual({
      principalType: "user",
      subjectId: subjectIdentifier,
    });
    expect(created.value).not.toHaveProperty("snapshot");
    const serializedArtifact = redis.allStoredText();
    expect(serializedArtifact).not.toContain("username");
    expect(serializedArtifact).not.toContain("displayName");
    expect(serializedArtifact).not.toContain("userDetail");
    expect(serializedArtifact).not.toContain("projection");
  });

  test("rejects the removed generic Principal Snapshot instead of normalizing it", () => {
    const parsed = parseLifecycleObject("principal_session", JSON.stringify({
      version: 1,
      sessionKind: "browser_user",
      principalSessionId: "ps-legacy-snapshot",
      externalTokenLookupHash: "lookup-hash",
      lookupKeyId: "lookup-key",
      principal: {
        principalType: "user",
        subjectId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
      },
      authTime: 1,
      lastActiveAt: 1,
      expiresAt: 2,
      absoluteExpiresAt: 2,
      amr: ["pwd"],
      cleanupRefs: [],
      snapshot: {
        subjectId: "57b0e34d-bf33-4671-87ea-4ed2f1b0e420",
        username: "legacy",
        displayName: "Legacy User",
      },
    }));

    expect(parsed.success).toBe(false);
  });

  test("rejects a numeric database user ID at the Subject Identifier boundary", async () => {
    const { kernel } = createKernel();

    await expect(kernel.createPrincipalSession("1001")).resolves.toMatchObject({
      status: "fail_closed",
    });
  });

  test("stores bounded Session Origin while keeping origin-less Principal Sessions compatible", async () => {
    const { kernel } = createKernel();
    const longUserAgent = `browser/${"x".repeat(600)}`;
    const withOrigin = await kernel.createPrincipalSession(principal.subjectId, {
      origin: {
        ip: "203.0.113.10",
        userAgent: longUserAgent,
      },
    });
    expect(withOrigin.status).toBe("created");
    if (withOrigin.status !== "created")
      return;

    const resolvedWithOrigin = await kernel.resolvePrincipalSession(withOrigin.externalToken!);
    expect(resolvedWithOrigin).toMatchObject({
      status: "resolved",
      value: {
        origin: {
          ip: "203.0.113.10",
          userAgent: longUserAgent.slice(0, 512),
        },
      },
    });

    const withoutOrigin = await kernel.createPrincipalSession(principal.subjectId);
    expect(withoutOrigin.status).toBe("created");
    if (withoutOrigin.status !== "created")
      return;
    await expect(kernel.resolvePrincipalSession(withoutOrigin.externalToken!)).resolves.toMatchObject({
      status: "resolved",
      value: {
        principalSessionId: withoutOrigin.value.principalSessionId,
      },
    });
    expect(withoutOrigin.value.origin).toBeUndefined();
  });

  test("lists only indexed user Principal Sessions by expiry without promising activity", async () => {
    const { redis, kernel } = createKernel();
    const older = await kernel.createPrincipalSession(principal.subjectId, {
      origin: { ip: "203.0.113.10", userAgent: "older-browser" },
    });
    redis.advance(1_000);
    const newer = await kernel.createPrincipalSession(subjectIdentifierFor(2));
    expect(older.status).toBe("created");
    expect(newer.status).toBe("created");
    if (older.status !== "created" || newer.status !== "created")
      return;

    const inventory = await kernel.listPrincipalSessions({ offset: 0, limit: 10 });

    expect(inventory.total).toBe(2);
    expect(inventory.items.map(item => item.principalSessionId)).toEqual([
      newer.value.principalSessionId,
      older.value.principalSessionId,
    ]);
    expect(inventory.items[1]?.origin).toEqual({
      ip: "203.0.113.10",
      userAgent: "older-browser",
    });
    expect("lastActiveAt" in inventory.items[0]!).toBe(false);
  });

  test("fills a page across dirty inventory chunks with deterministic equal-expiry ordering", async () => {
    const redis = new KernelFakeRedis();
    let nextId = 0;
    const kernel = createSessionKernel({
      redis,
      config: createConfig(redis),
      random: {
        uuid: () => `ps-${String(nextId++).padStart(3, "0")}`,
      },
    });
    for (let index = 0; index < 105; index += 1) {
      const created = await kernel.createPrincipalSession(subjectIdentifierFor(index));
      expect(created.status).toBe("created");
    }
    await redis.zadd(
      kernel.keys.index.principalSessions,
      redis.now + 100_000,
      encodeIndexMember("principal_session", "missing-session"),
    );

    const expectedIds = ["ps-005", "ps-004", "ps-003", "ps-002", "ps-001"];
    const firstRead = await kernel.listPrincipalSessions({ offset: 99, limit: 5 });
    const secondRead = await kernel.listPrincipalSessions({ offset: 99, limit: 5 });

    expect(firstRead).toEqual({
      items: expectedIds.map(principalSessionId => expect.objectContaining({ principalSessionId })),
      total: 105,
    });
    expect(secondRead.items.map(item => item.principalSessionId)).toEqual(expectedIds);
    expect(new Set(secondRead.items.map(item => item.principalSessionId)).size).toBe(5);
  });

  test("uses the user index without backfilling legacy sessions until renewal and removes revoked sessions", async () => {
    const { redis, kernel } = createKernel();
    const legacy = await kernel.createPrincipalSession(principal.subjectId);
    const other = await kernel.createPrincipalSession(subjectIdentifierFor(2));
    expect(legacy.status).toBe("created");
    expect(other.status).toBe("created");
    if (legacy.status !== "created" || other.status !== "created")
      return;
    await redis.zrem(
      kernel.keys.index.principalSessions,
      encodeIndexMember("principal_session", legacy.value.principalSessionId),
    );

    const filtered = await kernel.listPrincipalSessions({
      offset: 0,
      limit: 10,
      subjectIdentifier: subjectIdentifierFor(1),
    });
    expect(filtered).toMatchObject({
      items: [{ principalSessionId: legacy.value.principalSessionId }],
      total: 1,
    });
    expect(await kernel.listPrincipalSessions({
      offset: 1,
      limit: 10,
      subjectIdentifier: subjectIdentifierFor(1),
    })).toMatchObject({
      items: [],
      total: 1,
    });
    expect((await kernel.listPrincipalSessions({ offset: 0, limit: 10 })).items).toHaveLength(1);

    await expect(kernel.renewPrincipalSession(legacy.value.principalSessionId)).resolves.toMatchObject({
      status: "resolved",
    });
    expect((await kernel.listPrincipalSessions({ offset: 0, limit: 10 })).total).toBe(2);

    const revoked = await kernel.revokePrincipalSession(legacy.value.principalSessionId, "admin_revoke");
    expect(revoked.principalSessions.revoked).toBe(1);
    expect(await kernel.listPrincipalSessions({ offset: 0, limit: 10 })).toMatchObject({
      items: [{ principalSessionId: other.value.principalSessionId }],
      total: 1,
    });
  });

  test("removes naturally expired inventory members before counting and filling the page", async () => {
    const { redis, kernel } = createKernel();
    const expired = await kernel.createPrincipalSession(principal.subjectId);
    expect(expired.status).toBe("created");
    redis.advance(59_000);
    const valid = await kernel.createPrincipalSession(subjectIdentifierFor(2));
    expect(valid.status).toBe("created");
    if (expired.status !== "created" || valid.status !== "created")
      return;
    redis.advance(1_000);

    expect(await kernel.listPrincipalSessions({ offset: 0, limit: 10 })).toMatchObject({
      items: [{ principalSessionId: valid.value.principalSessionId }],
      total: 1,
    });
    expect(await redis.get(
      kernel.keys.tombstone("principal_session", expired.value.principalSessionId),
    )).toBeNull();
  });

  test("creates, resolves, and renews principal sessions with extendable children", async () => {
    const { redis, kernel } = createKernel();
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    const resolved = await kernel.resolvePrincipalSession(session.externalToken!);
    expect(resolved.status).toBe("resolved");
    const binding = await kernel.createClientBinding({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      renewalPolicy: "extend_with_principal",
      ttlMs: 10_000,
    });
    expect(binding.status).toBe("created");
    if (binding.status !== "created")
      return;
    const credential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      bindingId: binding.value.bindingId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      renewalPolicy: "extend_with_principal",
      ttlMs: 10_000,
    });
    expect(credential.status).toBe("created");
    if (credential.status !== "created")
      return;
    const directCredential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_session",
      renewalPolicy: "extend_with_principal",
      ttlMs: 10_000,
    });
    expect(directCredential.status).toBe("created");
    if (directCredential.status !== "created")
      return;
    expect(directCredential.value.bindingId).toBeUndefined();

    redis.advance(5_000);
    const renewed = await kernel.renewPrincipalSession(session.value.principalSessionId);
    expect(renewed.status).toBe("resolved");
    if (renewed.status !== "resolved")
      return;
    expect(renewed.value.authTime).toBe(session.value.authTime);
    expect(renewed.value.lastActiveAt).toBe(redis.now);
    expect(renewed.value.expiresAt).toBe(redis.now + 60_000);

    const renewedCredential = await kernel.resolveCredential(credential.externalToken!);
    expect(renewedCredential.status).toBe("resolved");
    if (renewedCredential.status === "resolved")
      expect(renewedCredential.value.expiresAt).toBe(renewed.value.expiresAt);
    const renewedDirectCredential = await kernel.resolveCredential(
      directCredential.externalToken!,
    );
    expect(renewedDirectCredential.status).toBe("resolved");
    if (renewedDirectCredential.status === "resolved")
      expect(renewedDirectCredential.value.expiresAt).toBe(renewed.value.expiresAt);
  });

  test("issues, resolves, and idempotently revokes credentials", async () => {
    const { kernel } = createKernel();
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;
    const credential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 30_000,
    });
    expect(credential.status).toBe("created");
    if (credential.status !== "created")
      return;

    await expect(kernel.resolveCredential(credential.externalToken!)).resolves.toMatchObject({ status: "resolved" });
    const revoked = await kernel.revokeCredential(credential.value.credentialId, "logout");
    expect(revoked.credentials.revoked).toBe(1);
    await expect(kernel.resolveCredential(credential.externalToken!)).resolves.toMatchObject({ status: "revoked" });
    const second = await kernel.revokeCredential(credential.value.credentialId, "admin_revoke");
    expect(second.credentials.alreadyRevoked).toBe(1);
  });

  test("issues a credential with a caller-known identity without changing its bearer token", async () => {
    const { kernel } = createKernel();
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    const credentialId = "30000000-0000-4000-8000-000000000001";
    const credential = await kernel.issueCredential({
      credentialId,
      principalSessionId: session.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 30_000,
    });

    expect(credential.status).toBe("created");
    if (credential.status !== "created")
      return;
    expect(credential.value.credentialId).toBe(credentialId);
    expect(credential.externalToken).not.toBe(credentialId);
    await expect(kernel.resolveCredential(credential.externalToken!)).resolves.toMatchObject({
      status: "resolved",
      value: { credentialId },
    });
  });

  test("consumes protocol artifacts once and reports replay through consumed tombstone", async () => {
    const { redis, kernel } = createKernel();
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;
    const artifact = await kernel.createProtocolArtifact({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      artifactType: "return_handle",
      ttlMs: 5_000,
    });
    expect(artifact.status).toBe("created");
    if (artifact.status !== "created")
      return;

    const concurrentResults = await Promise.all([
      kernel.consumeProtocolArtifact(artifact.externalToken!),
      kernel.consumeProtocolArtifact(artifact.externalToken!),
    ]);
    expect(concurrentResults.map(result => result.status).sort()).toEqual([
      "consumed_replay",
      "resolved",
    ]);
    await expect(kernel.consumeProtocolArtifact(artifact.externalToken!)).resolves.toMatchObject({
      status: "consumed_replay",
    });

    const expired = await kernel.createProtocolArtifact({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      artifactType: "return_handle",
      ttlMs: 1_000,
    });
    expect(expired.status).toBe("created");
    if (expired.status !== "created")
      return;
    redis.advance(1_001);
    await expect(kernel.resolveProtocolArtifact(expired.externalToken!)).resolves.toMatchObject({
      status: "missing_or_expired",
    });
    expect(await redis.get(kernel.keys.lookupTombstone("artifact", expired.value.lookupHash))).toBeNull();
  });

  test("does not consume an artifact whose stored payload changes after resolution", async () => {
    const redis = new KernelFakeRedis();
    const config = createConfig(redis);
    let activeArtifactKey: string | undefined;
    let corruptBeforeConsume = false;
    const kernel = createSessionKernel({
      redis,
      config,
      validationHooks: {
        validateClient: () => {
          if (corruptBeforeConsume && activeArtifactKey !== undefined) {
            const serialized = redis.values.get(activeArtifactKey);
            if (serialized) {
              redis.values.set(activeArtifactKey, JSON.stringify({
                ...JSON.parse(serialized) as Record<string, unknown>,
                artifactType: "replaced_authorization_code",
              }));
            }
          }
          return { ok: true };
        },
      },
    });
    const artifact = await kernel.createProtocolArtifact({
      protocol: "oidc",
      clientCode: "portal",
      artifactType: "authorization_code",
      ttlMs: 5_000,
    });
    expect(artifact.status).toBe("created");
    if (artifact.status !== "created")
      return;

    activeArtifactKey = kernel.keys.active(
      "artifact",
      artifact.value.artifactId,
    );
    corruptBeforeConsume = true;

    await expect(
      kernel.consumeProtocolArtifact(artifact.externalToken!),
    ).resolves.toMatchObject({ status: "missing_or_expired" });
  });
});

describe("session kernel tombstone, cleanup, validation, and fail closed behavior", () => {
  test("logs schema corruption without external bearer or Redis key material", async () => {
    const redis = new KernelFakeRedis();
    const config = createConfig(redis);
    const { logger, entries } = createKernelLogCapture();
    const kernel = createSessionKernel({ redis, config, logger, sourceApp: "test-kernel" });
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    redis.values.set(kernel.keys.active("principal_session", session.value.principalSessionId), "{not-json");
    await expect(kernel.resolvePrincipalSession(session.externalToken!)).resolves.toMatchObject({
      status: "schema_invalid",
    });

    const output = JSON.stringify(entries);
    expect(output).toContain(SessionKernelLogEvent.SchemaCorrupted);
    expect(output).toContain("test-kernel");
    expect(output).not.toContain(session.externalToken!);
    expect(output).not.toContain(kernel.keys.active("principal_session", session.value.principalSessionId));
  });

  test("logs tombstone replay with protocol summary and without replayed token", async () => {
    const redis = new KernelFakeRedis();
    const config = createConfig(redis);
    const { logger, entries } = createKernelLogCapture();
    const kernel = createSessionKernel({ redis, config, logger, sourceApp: "test-kernel" });
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;
    const replayedCode = "authorization-code-secret-12345678901234567890";
    const artifact = await kernel.createProtocolArtifact({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      artifactType: "authorization_code",
      ttlMs: 5_000,
      externalToken: replayedCode,
    });
    expect(artifact.status).toBe("created");
    if (artifact.status !== "created")
      return;

    await kernel.consumeProtocolArtifact(replayedCode);
    entries.length = 0;
    await expect(kernel.consumeProtocolArtifact(replayedCode)).resolves.toMatchObject({
      status: "consumed_replay",
    });

    const output = JSON.stringify(entries);
    expect(output).toContain(SessionKernelLogEvent.TombstoneReplayDetected);
    expect(output).toContain("authorization_code");
    expect(output).toContain("portal");
    expect(output).not.toContain(replayedCode);
  });

  test("keeps tombstone-first revocation and records cleanup success and failure", async () => {
    const redis = new KernelFakeRedis();
    const config = createConfig(redis);
    const { logger, entries } = createKernelLogCapture();
    const kernel = createSessionKernel({
      redis,
      config,
      cleanupAdapters: [
        { protocol: "oidc", kind: "payload", cleanup: async () => {} },
        {
          protocol: "oidc",
          kind: "notify",
          cleanup: async () => {
            throw new Error("notify failed for token-secret-12345678901234567890");
          },
        },
      ],
      logger,
      sourceApp: "test-kernel",
    });
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;
    const credential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      ttlMs: 60_000,
      cleanupRefs: [
        { protocol: "oidc", kind: "payload", ref: "payload:1" },
        { protocol: "oidc", kind: "notify", ref: "client:portal" },
      ],
    });
    expect(credential.status).toBe("created");
    if (credential.status !== "created")
      return;

    const revoked = await kernel.revokeCredential(credential.value.credentialId, "admin_revoke");
    expect(revoked.credentials.revoked).toBe(1);
    expect(revoked.cleanup).toMatchObject({ attempted: 2, succeeded: 1, failed: 1 });
    const output = JSON.stringify(entries);
    expect(output).toContain(SessionKernelLogEvent.RevokeCleanupFailed);
    expect(output).toContain("\"failureCount\":1");
    expect(output).not.toContain("client:portal");
    expect(output).not.toContain("token-secret-12345678901234567890");
    expect(await kernel.resolveCredential(credential.externalToken!)).toMatchObject({ status: "revoked" });
    expect(redis.expiresAt.get(
      kernel.keys.lookupTombstone("credential", credential.value.lookupHash),
    )).toBeUndefined();
    await expect(kernel.inventoryClientProtocol("portal", "oidc")).resolves.toMatchObject({
      counts: { cleanupPending: 1, total: 1 },
    });
  });

  test("revokes user sessions with an excluded PrincipalSession while cascading its child objects", async () => {
    const { kernel } = createKernel();
    const keptSession = await kernel.createPrincipalSession(principal.subjectId);
    const revokedSession = await kernel.createPrincipalSession(principal.subjectId);
    expect(keptSession.status).toBe("created");
    expect(revokedSession.status).toBe("created");
    if (keptSession.status !== "created" || revokedSession.status !== "created")
      return;

    const keptBinding = await kernel.createClientBinding({
      principalSessionId: keptSession.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      ttlMs: 30_000,
    });
    const keptCredential = await kernel.issueCredential({
      principalSessionId: keptSession.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      ttlMs: 30_000,
    });
    const revokedCredential = await kernel.issueCredential({
      principalSessionId: revokedSession.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_session",
      ttlMs: 30_000,
    });
    expect(keptBinding.status).toBe("created");
    expect(keptCredential.status).toBe("created");
    expect(revokedCredential.status).toBe("created");
    if (
      keptBinding.status !== "created"
      || keptCredential.status !== "created"
      || revokedCredential.status !== "created"
    ) {
      return;
    }

    const summary = await kernel.revokeUserSessions(principal, "admin_revoke", {
      exceptPrincipalSessionId: keptSession.value.principalSessionId,
    });

    expect(summary.principalSessions).toMatchObject({ revoked: 1, excluded: 1 });
    expect(summary.bindings.revoked).toBe(1);
    expect(summary.credentials.revoked).toBe(2);
    await expect(kernel.resolvePrincipalSession(keptSession.externalToken!)).resolves.toMatchObject({
      status: "resolved",
    });
    await expect(kernel.resolvePrincipalSession(revokedSession.externalToken!)).resolves.toMatchObject({
      status: "revoked",
    });
    await expect(kernel.resolveClientBindingById(keptBinding.value.bindingId)).resolves.toMatchObject({
      status: "revoked",
    });
    await expect(kernel.resolveCredential(keptCredential.externalToken!)).resolves.toMatchObject({ status: "revoked" });
  });

  test("revokes client protocol and all protocols with cleanup adapter missing summary", async () => {
    const { kernel } = createKernel();
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    const oidcBinding = await kernel.createClientBinding({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      ttlMs: 30_000,
    });
    const oidcCredential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      ttlMs: 30_000,
      cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "payload:1" }],
    });
    const customCredential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      credentialType: "local_sid",
      ttlMs: 30_000,
    });
    expect(oidcBinding.status).toBe("created");
    expect(oidcCredential.status).toBe("created");
    expect(customCredential.status).toBe("created");
    if (
      oidcBinding.status !== "created"
      || oidcCredential.status !== "created"
      || customCredential.status !== "created"
    ) {
      return;
    }

    await expect(kernel.inventoryClientProtocol("portal", "oidc")).resolves.toEqual({
      clientCode: "portal",
      protocol: "oidc",
      counts: {
        bindings: 1,
        credentials: 1,
        artifacts: 0,
        cleanupPending: 0,
        invalid: 0,
        stale: 0,
        total: 2,
      },
    });

    const protocolSummary = await kernel.revokeClientProtocol("portal", "oidc", "client_config_changed");

    expect(protocolSummary.bindings.revoked).toBe(1);
    expect(protocolSummary.credentials.revoked).toBe(1);
    expect(protocolSummary.cleanup).toMatchObject({ attempted: 1, succeeded: 0, failed: 1 });
    expect(protocolSummary.cleanup.failures).toEqual([{
      protocol: "oidc",
      kind: "payload",
      ref: "payload:1",
      error: "cleanup adapter not configured",
    }]);
    await expect(kernel.inventoryClientProtocol("portal", "oidc")).resolves.toEqual({
      clientCode: "portal",
      protocol: "oidc",
      counts: {
        bindings: 0,
        credentials: 0,
        artifacts: 0,
        cleanupPending: 1,
        invalid: 0,
        stale: 0,
        total: 1,
      },
    });
    await expect(kernel.resolvePrincipalSession(session.externalToken!)).resolves.toMatchObject({
      status: "resolved",
    });
    await expect(kernel.resolveCredential(customCredential.externalToken!)).resolves.toMatchObject({
      status: "resolved",
    });

    const allProtocolsSummary = await kernel.revokeClient("portal", "client_deleted");

    expect(allProtocolsSummary.bindings.revoked).toBe(0);
    expect(allProtocolsSummary.credentials.revoked).toBe(1);
    await expect(kernel.resolveCredential(customCredential.externalToken!)).resolves.toMatchObject({
      status: "revoked",
    });
  });

  test("keeps failed cleanup discoverable and completes it on a forward retry", async () => {
    let cleanupShouldFail = true;
    const redis = new KernelFakeRedis();
    const kernel = createSessionKernel({
      redis,
      config: createConfig(redis),
      cleanupAdapters: [{
        protocol: "oidc",
        kind: "payload",
        cleanup: async () => {
          if (cleanupShouldFail)
            throw new Error("payload cleanup unavailable");
        },
      }],
    });
    const principalSession = await kernel.createPrincipalSession(principal.subjectId);
    if (principalSession.status !== "created")
      throw new Error("expected Principal Session fixture");
    const credential = await kernel.issueCredential({
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      ttlMs: 30_000,
      cleanupRefs: [{ protocol: "oidc", kind: "payload", ref: "payload:retry" }],
    });
    if (credential.status !== "created")
      throw new Error("expected credential fixture");

    const failed = await kernel.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );
    expect(failed.cleanup.failed).toBe(1);
    await expect(kernel.inventoryClientProtocol("portal", "oidc")).resolves.toMatchObject({
      counts: { cleanupPending: 1, total: 1 },
    });

    cleanupShouldFail = false;
    const retried = await kernel.revokeClientProtocol(
      "portal",
      "oidc",
      "client_config_changed",
    );
    expect(retried.cleanup).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    await expect(kernel.inventoryClientProtocol("portal", "oidc")).resolves.toMatchObject({
      counts: { cleanupPending: 0, total: 0 },
    });
  });

  test("lazy-cleans expired zset members and does not write tombstones for natural expiry", async () => {
    const { redis, kernel } = createKernel();
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;
    redis.advance(60_001);

    const summary = await kernel.revokeUserSessions(principal);
    expect(summary.principalSessions.revoked).toBe(0);
    expect(summary.principalSessions.missing).toBe(0);
    const lookupHash = createLookupHash(session.externalToken!, createConfig(redis).lookupHmacKeys.current);
    expect(await redis.get(kernel.keys.lookupTombstone("principal_session", lookupHash))).toBeNull();
  });

  test("validation hooks fail closed and lazy revoke affected sessions", async () => {
    const redis = new KernelFakeRedis();
    const config = createConfig(redis);
    let disabled = false;
    const kernel = createSessionKernel({
      redis,
      config,
      validationHooks: {
        validatePrincipal: async () => disabled
          ? { ok: false, reason: "user_disabled" }
          : { ok: true },
      },
    });
    const session = await kernel.createPrincipalSession(principal.subjectId);
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;
    const credential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: "oidc",
      clientCode: "portal",
      credentialType: "access_token",
      ttlMs: 30_000,
    });
    expect(credential.status).toBe("created");
    if (credential.status !== "created")
      return;

    disabled = true;
    const resolved = await kernel.resolveCredential(credential.externalToken!);
    expect(resolved.status).toBe("validation_failed");
    if (resolved.status === "validation_failed")
      expect(resolved.revokeSummary?.principalSessions.revoked).toBe(1);
    await expect(kernel.resolvePrincipalSession(session.externalToken!)).resolves.toMatchObject({ status: "revoked" });
  });

  test("stops lifecycle validation at user_disabled before later validators can replace it", async () => {
    for (const objectKind of ["credential", "binding"] as const) {
      const redis = new KernelFakeRedis();
      const config = createConfig(redis);
      let rejectPrincipal = false;
      let laterValidatorCalls = 0;
      const kernel = createSessionKernel({
        redis,
        config,
        validationHooks: {
          validatePrincipal: async () => rejectPrincipal
            ? { ok: false, reason: "user_disabled" }
            : { ok: true },
          validateClient: async () => {
            laterValidatorCalls += 1;
            throw new Error("later client validator must not replace user_disabled");
          },
        },
      });
      const session = await kernel.createPrincipalSession(principal.subjectId);
      expect(session.status).toBe("created");
      if (session.status !== "created")
        continue;
      const binding = await kernel.createClientBinding({
        principalSessionId: session.value.principalSessionId,
        protocol: "oidc",
        clientCode: "portal",
      });
      expect(binding.status).toBe("created");
      if (binding.status !== "created")
        continue;
      const credential = objectKind === "credential"
        ? await kernel.issueCredential({
            principalSessionId: session.value.principalSessionId,
            bindingId: binding.value.bindingId,
            protocol: "oidc",
            clientCode: "portal",
            credentialType: "access_token",
            ttlMs: 30_000,
          })
        : undefined;
      if (credential !== undefined)
        expect(credential.status).toBe("created");

      rejectPrincipal = true;
      const resolved = objectKind === "credential" && credential?.status === "created"
        ? await kernel.resolveCredential(credential.externalToken!)
        : await kernel.resolveClientBindingById(binding.value.bindingId);

      expect(resolved).toMatchObject({
        status: "validation_failed",
        reason: "user_disabled",
        revokeSummary: {
          principalSessions: { revoked: 1 },
        },
      });
      expect(laterValidatorCalls).toBe(0);
      await expect(kernel.resolvePrincipalSession(session.externalToken!))
        .resolves
        .toMatchObject({ status: "revoked" });
    }
  });

  test("keeps lazy validation cleanup best-effort after the failure classification is known", async () => {
    for (const reason of ["session_generation_stale", "user_disabled"] as const) {
      for (const objectKind of ["principal_session", "credential", "artifact"] as const) {
        const redis = new FailNextTransactionRedis();
        const config = createConfig(redis);
        const logs = createKernelLogCapture();
        let rejectPrincipal = false;
        const kernel = createSessionKernel({
          redis,
          config,
          logger: logs.logger,
          validationHooks: {
            validatePrincipal: async () => rejectPrincipal
              ? { ok: false, reason }
              : { ok: true },
          },
        });
        const session = await kernel.createPrincipalSession(principal.subjectId);
        expect(session.status).toBe("created");
        if (session.status !== "created")
          continue;
        const derived = objectKind === "principal_session"
          ? undefined
          : await createDerivedObject(
              kernel,
              objectKind,
              session.value.principalSessionId,
            );
        if (derived !== undefined)
          expect(derived.status).toBe("created");

        rejectPrincipal = true;
        redis.failNextTransaction = true;
        const resolved = objectKind === "principal_session"
          ? await kernel.resolvePrincipalSession(session.externalToken!)
          : objectKind === "credential" && derived?.status === "created"
            ? await kernel.resolveCredential(derived.externalToken!)
            : derived?.status === "created"
              ? await kernel.resolveProtocolArtifact(derived.externalToken!)
              : undefined;

        expect(resolved).toMatchObject({
          status: "validation_failed",
          reason,
          revokeSummary: createEmptyRevokeSummaryForExpectation(),
        });
        expect(logs.entries).toContainEqual({
          data: expect.objectContaining({
            event: SessionKernelLogEvent.RevokeCleanupFailed,
            kind: "validation_cleanup",
            reason,
          }),
          level: "warn",
          message: "session kernel validation cleanup failed",
        });
      }
    }
  });

  test("returns fail_closed when atomic create writes fail", async () => {
    const redis = new FailingRedis();
    const kernel = createSessionKernel({ redis, config: createConfig(redis) });
    await expect(kernel.createPrincipalSession(principal.subjectId)).resolves.toMatchObject({
      status: "fail_closed",
    });
    await expect(kernel.listPrincipalSessions({ offset: 0, limit: 10 })).resolves.toEqual({
      items: [],
      total: 0,
    });
  });

  test("keeps Principal Session state and inventory together when renew or revoke writes fail", async () => {
    const redis = new FailNextTransactionRedis();
    const kernel = createSessionKernel({ redis, config: createConfig(redis) });
    const created = await kernel.createPrincipalSession(principal.subjectId);
    expect(created.status).toBe("created");
    if (created.status !== "created")
      return;
    redis.advance(1_000);

    redis.failNextTransaction = true;
    await expect(kernel.renewPrincipalSession(created.value.principalSessionId)).resolves.toMatchObject({
      status: "fail_closed",
    });
    await expect(kernel.listPrincipalSessions({ offset: 0, limit: 10 })).resolves.toMatchObject({
      items: [{
        expiresAt: created.value.expiresAt,
        principalSessionId: created.value.principalSessionId,
      }],
      total: 1,
    });

    redis.failNextTransaction = true;
    await expect(kernel.revokePrincipalSession(created.value.principalSessionId, "admin_revoke"))
      .rejects
      .toThrow("redis transaction failed");
    await expect(kernel.listPrincipalSessions({ offset: 0, limit: 10 })).resolves.toMatchObject({
      items: [{ principalSessionId: created.value.principalSessionId }],
      total: 1,
    });
  });
});
