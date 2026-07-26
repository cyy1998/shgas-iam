import type { SessionKernelRedis, SessionKernelRedisTransaction } from "../kernel";
import { SystemLogEvent } from "@iam/api-core/logger";
import {
  createLookupHash,
  createSessionKernel,
  createSessionKernelConfig,
  createSessionKernelKeyBuilder,
  encodeIndexMember,
  evaluateFreshness,
  generateKernelToken,
  parseIndexMember,
} from "@iam/api-core/session/kernel";
import { describe, expect, test } from "bun:test";

type RedisResult = [Error | null, unknown];

class KernelFakeRedis implements SessionKernelRedis {
  readonly values = new Map<string, string>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly expiresAt = new Map<string, number>();

  now = 1_000_000;

  advance(milliseconds: number) {
    this.now += milliseconds;
  }

  async get(key: string) {
    this.purgeExpired(key);
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
    return "OK";
  }

  async del(...keys: string[]) {
    let deleted = 0;
    for (const key of keys) {
      const didDelete = this.values.delete(key) || this.zsets.delete(key);
      this.expiresAt.delete(key);
      if (didDelete)
        deleted += 1;
    }
    return deleted;
  }

  async pexpireat(key: string, expiresAt: number) {
    if (!this.values.has(key) && !this.zsets.has(key))
      return 0;
    this.expiresAt.set(key, expiresAt);
    return 1;
  }

  async ttl(key: string) {
    this.purgeExpired(key);
    if (!this.values.has(key) && !this.zsets.has(key))
      return -2;
    const expiresAt = this.expiresAt.get(key);
    return expiresAt === undefined ? -1 : Math.ceil((expiresAt - this.now) / 1000);
  }

  async expire(key: string, seconds: number) {
    this.purgeExpired(key);
    if (!this.values.has(key) && !this.zsets.has(key))
      return 0;
    this.expiresAt.set(key, this.now + seconds * 1000);
    return 1;
  }

  async zadd(key: string, score: number, member: string) {
    const set = this.zsets.get(key) ?? new Map<string, number>();
    set.set(member, score);
    this.zsets.set(key, set);
    return 1;
  }

  async zrange(key: string, start: number, stop: number) {
    this.purgeExpired(key);
    const sorted = [...(this.zsets.get(key)?.entries() ?? [])]
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
    const normalizedStop = stop < 0 ? sorted.length + stop : stop;
    return sorted.slice(start, normalizedStop + 1);
  }

  async zrem(key: string, member: string) {
    const set = this.zsets.get(key);
    if (!set)
      return 0;
    const deleted = set.delete(member);
    return deleted ? 1 : 0;
  }

  async zremrangebyscore(key: string, min: string | number, max: string | number) {
    const set = this.zsets.get(key);
    if (!set)
      return 0;
    const lower = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const upper = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
    let removed = 0;
    for (const [member, score] of set) {
      if (score >= lower && score <= upper) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  async eval(_script: string, _keyCount: number) {
    return 1;
  }

  multi() {
    const operations: Array<() => Promise<unknown> | unknown> = [];
    const transaction: SessionKernelRedisTransaction = {
      set: (key, value) => {
        operations.push(() => this.set(key, value));
        return transaction;
      },
      pexpireat: (key, expiresAt) => {
        operations.push(() => this.pexpireat(key, expiresAt));
        return transaction;
      },
      del: (...keys) => {
        operations.push(() => this.del(...keys));
        return transaction;
      },
      zadd: (key, score, member) => {
        operations.push(() => this.zadd(key, score, member));
        return transaction;
      },
      zrem: (key, member) => {
        operations.push(() => this.zrem(key, member));
        return transaction;
      },
      exec: async () => await Promise.all(operations.map(async (operation): Promise<RedisResult> => {
        try {
          return [null, await operation()];
        }
        catch (error) {
          return [error instanceof Error ? error : new Error(String(error)), null];
        }
      })),
    };
    return transaction;
  }

  allStoredText() {
    return [...this.values.keys(), ...this.values.values(), ...this.zsets.keys(), ...[...this.zsets.values()]
      .flatMap(set => [...set.keys()])].join("\n");
  }

  private purgeExpired(key: string) {
    if ((this.expiresAt.get(key) ?? Number.POSITIVE_INFINITY) > this.now)
      return;
    this.values.delete(key);
    this.zsets.delete(key);
    this.expiresAt.delete(key);
  }
}

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

const principal = { principalType: "user", subjectId: "u-1", displayName: "Alice" };
const snapshot = { subjectId: "u-1", username: "alice", displayName: "Alice" };

describe("session kernel module boundaries", () => {
  test("generates a PrincipalSession token through the Kernel entry", () => {
    const redis = new KernelFakeRedis();
    const token = generateKernelToken(createConfig(redis), "principalSession");
    expect(token.startsWith("iam_ps_")).toBe(true);
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
    expect(parseIndexMember(encodeIndexMember("artifact", "artifact:1"))).toEqual({
      kind: "artifact",
      id: "artifact:1",
    });
  });

  test("uses current lookup first and previous lookup fallback without storing bearer plaintext", async () => {
    const redis = new KernelFakeRedis();
    const externalToken = "plain-bearer-token";
    const previousConfig = createConfig(redis, {
      lookupHmacKeys: { current: { id: "previous", secret: "p".repeat(32) } },
    });
    const oldKernel = createSessionKernel({ redis, config: previousConfig });
    const created = await oldKernel.createPrincipalSession({ principal, snapshot, externalToken });
    expect(created.status).toBe("created");

    const currentConfig = createConfig(redis, {
      lookupHmacKeys: {
        current: { id: "current", secret: "c".repeat(32) },
        previous: { id: "previous", secret: "p".repeat(32) },
      },
    });
    const kernel = createSessionKernel({ redis, config: currentConfig });
    const resolved = await kernel.resolvePrincipalSession(externalToken);

    expect(resolved.status).toBe("resolved");
    if (resolved.status === "resolved")
      expect(resolved.lookupKeyId).toBe("previous");
    expect(redis.allStoredText()).not.toContain(externalToken);
  });

  test("evaluates freshness requirements", async () => {
    const { redis, kernel } = createKernel();
    const created = await kernel.createPrincipalSession({
      principal,
      snapshot,
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
  test("creates, resolves, and renews principal sessions with extendable children", async () => {
    const { redis, kernel } = createKernel();
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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
  });

  test("issues, resolves, and idempotently revokes credentials", async () => {
    const { kernel } = createKernel();
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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

  test("consumes protocol artifacts once and reports replay through consumed tombstone", async () => {
    const { redis, kernel } = createKernel();
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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

    await expect(kernel.consumeProtocolArtifact(artifact.externalToken!)).resolves.toMatchObject({ status: "resolved" });
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
});

describe("session kernel tombstone, cleanup, validation, and fail closed behavior", () => {
  test("logs schema corruption without external bearer or Redis key material", async () => {
    const redis = new KernelFakeRedis();
    const config = createConfig(redis);
    const { logger, entries } = createKernelLogCapture();
    const kernel = createSessionKernel({ redis, config, logger, sourceApp: "test-kernel" });
    const session = await kernel.createPrincipalSession({ principal, snapshot });
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    redis.values.set(kernel.keys.active("principal_session", session.value.principalSessionId), "{not-json");
    await expect(kernel.resolvePrincipalSession(session.externalToken!)).resolves.toMatchObject({
      status: "schema_invalid",
    });

    const output = JSON.stringify(entries);
    expect(output).toContain(SystemLogEvent.SessionKernelSchemaCorrupted);
    expect(output).toContain("test-kernel");
    expect(output).not.toContain(session.externalToken!);
    expect(output).not.toContain(kernel.keys.active("principal_session", session.value.principalSessionId));
  });

  test("logs tombstone replay with protocol summary and without replayed token", async () => {
    const redis = new KernelFakeRedis();
    const config = createConfig(redis);
    const { logger, entries } = createKernelLogCapture();
    const kernel = createSessionKernel({ redis, config, logger, sourceApp: "test-kernel" });
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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
    expect(output).toContain(SystemLogEvent.SessionKernelTombstoneReplayDetected);
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
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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
    expect(output).toContain(SystemLogEvent.SessionKernelRevokeCleanupFailed);
    expect(output).toContain("\"failureCount\":1");
    expect(output).not.toContain("client:portal");
    expect(output).not.toContain("token-secret-12345678901234567890");
    expect(await kernel.resolveCredential(credential.externalToken!)).toMatchObject({ status: "revoked" });
    expect(redis.expiresAt.get(kernel.keys.lookupTombstone("credential", credential.value.lookupHash))).toBe(
      credential.value.expiresAt + 5_000,
    );
  });

  test("revokes user sessions with an excluded PrincipalSession while cascading its child objects", async () => {
    const { kernel } = createKernel();
    const keptSession = await kernel.createPrincipalSession({ principal, snapshot });
    const revokedSession = await kernel.createPrincipalSession({ principal, snapshot });
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
    const revokedBinding = await kernel.createClientBinding({
      principalSessionId: revokedSession.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      ttlMs: 30_000,
    });
    expect(keptBinding.status).toBe("created");
    expect(keptCredential.status).toBe("created");
    expect(revokedBinding.status).toBe("created");
    if (keptBinding.status !== "created" || keptCredential.status !== "created" || revokedBinding.status !== "created")
      return;

    const summary = await kernel.revokeUserSessions(principal, "admin_revoke", {
      exceptPrincipalSessionId: keptSession.value.principalSessionId,
    });

    expect(summary.principalSessions).toMatchObject({ revoked: 1, excluded: 1 });
    expect(summary.bindings.revoked).toBe(2);
    expect(summary.credentials.revoked).toBe(1);
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
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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
    const customBinding = await kernel.createClientBinding({
      principalSessionId: session.value.principalSessionId,
      protocol: "custom-sso",
      clientCode: "portal",
      ttlMs: 30_000,
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
    expect(customBinding.status).toBe("created");
    expect(customCredential.status).toBe("created");
    if (
      oidcBinding.status !== "created"
      || oidcCredential.status !== "created"
      || customBinding.status !== "created"
      || customCredential.status !== "created"
    ) {
      return;
    }

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
    await expect(kernel.resolveClientBindingById(customBinding.value.bindingId)).resolves.toMatchObject({
      status: "resolved",
    });

    const allProtocolsSummary = await kernel.revokeClient("portal", "client_deleted");

    expect(allProtocolsSummary.bindings.revoked).toBe(1);
    expect(allProtocolsSummary.credentials.revoked).toBe(1);
    await expect(kernel.resolveCredential(customCredential.externalToken!)).resolves.toMatchObject({
      status: "revoked",
    });
  });

  test("lazy-cleans expired zset members and does not write tombstones for natural expiry", async () => {
    const { redis, kernel } = createKernel();
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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
    const kernel = createSessionKernel({
      redis,
      config,
      validationHooks: {
        validatePrincipal: async () => ({ ok: false, reason: "user_disabled" }),
      },
    });
    const session = await kernel.createPrincipalSession({ principal, snapshot });
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

    const resolved = await kernel.resolveCredential(credential.externalToken!);
    expect(resolved.status).toBe("validation_failed");
    if (resolved.status === "validation_failed")
      expect(resolved.revokeSummary?.principalSessions.revoked).toBe(1);
    await expect(kernel.resolvePrincipalSession(session.externalToken!)).resolves.toMatchObject({ status: "revoked" });
  });

  test("returns fail_closed when atomic create writes fail", async () => {
    const redis = new FailingRedis();
    const kernel = createSessionKernel({ redis, config: createConfig(redis) });
    await expect(kernel.createPrincipalSession({ principal, snapshot })).resolves.toMatchObject({
      status: "fail_closed",
    });
  });
});
