import type { CleanupExecution, SessionKernelRedis } from "../../src/index";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import Redis from "ioredis";
import { createSessionKernel } from "../../src/index";
import { tokenDigest } from "../../src/security/digest";
import { createSessionKernelKeyBuilder, encodeIndexMember } from "../../src/storage/keys";
import { createSessionKernelRedisTestHarness, waitForRedisCondition } from "../../src/testing";

let harness: Awaited<ReturnType<typeof createSessionKernelRedisTestHarness>>;
let scope: Awaited<ReturnType<typeof harness.createSessionKernelScope>>;
let redis: Redis;
let commands: string[];
beforeAll(async () => {
  const url = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL required");
  harness = await createSessionKernelRedisTestHarness(url);
  redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
  await redis.connect();
});
beforeEach(async () => {
  commands = [];
  scope = await harness.createSessionKernelScope({ observeWriterCommand: value => commands.push(value.name) });
});
afterEach(async () => {
  await scope.close();
});
afterAll(async () => {
  await redis.quit();
  await harness.close();
});

async function root() {
  const value = await scope.writer.createPrincipalSession(randomUUID(), { subjectContext: "generation" });
  if (value.status !== "created" || !value.externalToken)
    throw new Error("expected created Principal");
  return { ...value, externalToken: value.externalToken };
}

test("token observes one SHA-256 state and time; ID and digest are not bearers", async () => {
  const created = await root();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const hash = tokenDigest(created.externalToken);
  commands.length = 0;
  const resolved = await scope.writer.resolvePrincipalSession(created.externalToken);
  expect(resolved.status).toBe("resolved");
  expect(commands).toEqual(["eval"]);
  expect(created.value.externalTokenLookupHash).toBe(hash);
  const idValue = await redis.get(keys.identity("principal_session", created.value.principalSessionId));
  expect(idValue).toBe(hash);
  const stored = await redis.get(keys.state("principal_session", hash));
  expect(JSON.parse(stored!)).toEqual(created.value);
  for (const token of [hash, created.value.principalSessionId, "unknown"]) {
    const rejected = await scope.writer.resolvePrincipalSession(token);
    expect(rejected.status).toBe("missing_or_expired");
  }
  const wrongKind = await scope.writer.resolveCredential(created.externalToken, { protocol: "test", credentialType: "access" });
  expect(wrongKind.status).toBe("missing_or_expired");
  const byId = await scope.writer.resolvePrincipalSessionById(created.value.principalSessionId);
  expect(byId).toMatchObject({ status: "resolved", value: JSON.parse(JSON.stringify(created.value)) });
});

test("renewal keeps identity, authentication time and absolute limit, updates both deadlines and index scores", async () => {
  const created = await root();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const renewed = await scope.writer.renewPrincipalSession(created.value.principalSessionId);
  expect(renewed.status).toBe("resolved");
  if (renewed.status !== "resolved")
    throw new Error("renew failed");
  expect(renewed.value).toMatchObject({ principalSessionId: created.value.principalSessionId, externalTokenLookupHash: created.value.externalTokenLookupHash, authTime: created.value.authTime, absoluteExpiresAt: created.value.absoluteExpiresAt });
  expect(renewed.value.expiresAt).toBeLessThanOrEqual(created.value.absoluteExpiresAt);
  for (const key of [keys.identity("principal_session", created.value.principalSessionId), keys.state("principal_session", created.value.externalTokenLookupHash)]) {
    const deadline = await redis.pexpiretime(key);
    expect(deadline).toBe(renewed.value.expiresAt);
  }
  for (const key of [keys.index.principalSessions, keys.index.user(created.value.principal)]) {
    const score = await redis.zscore(key, encodeIndexMember("principal_session", created.value.principalSessionId));
    expect(Number(score)).toBe(renewed.value.expiresAt);
  }
  const tokenRead = await scope.writer.resolvePrincipalSession(created.externalToken);
  expect(tokenRead).toMatchObject({ status: "resolved", value: renewed.value });
  const revoked = await scope.writer.revokeObservedObject(renewed.value, "logout");
  expect(revoked.principalSessions.revoked).toBe(1);
});

test("acquired root remains usable in flight, later reads and racing renewal reject revoked state", async () => {
  const created = await root();
  const pause = scope.pauseNextLifecycleObservation();
  const renewal = scope.writer.renewPrincipalSession(created.value.principalSessionId);
  await pause.reached;
  const acquired = await scope.observer.resolvePrincipalSession(created.externalToken);
  const revoked = await scope.observer.revokePrincipalSession(created.value.principalSessionId);
  pause.release();
  const renewalResult = await renewal;
  expect(acquired).toMatchObject({ status: "resolved", value: JSON.parse(JSON.stringify(created.value)) });
  expect(revoked.principalSessions.revoked).toBe(1);
  expect(renewalResult.status).toBe("revoked");
  commands.length = 0;
  const later = await scope.writer.resolvePrincipalSession(created.externalToken);
  expect(later.status).toBe("revoked");
  expect(commands).toEqual(["eval"]);
  const again = await scope.writer.revokePrincipalSession(created.value.principalSessionId);
  expect(again.principalSessions).toMatchObject({ revoked: 0, alreadyRevoked: 1 });
});

test("observed revocation cannot overwrite a renewed or replacement root", async () => {
  const created = await root();
  const observed = await scope.writer.resolvePrincipalSession(created.externalToken);
  if (observed.status !== "resolved")
    throw new Error("expected observation");
  scope.replaceObjectBeforeNextRevoke();
  let error: unknown;
  try {
    await scope.writer.revokeObservedObject(observed.value, "admin_revoke");
  }
  catch (cause) { error = cause; }
  expect(error).toBeInstanceOf(Error);
  const replacement = await scope.observer.resolvePrincipalSession(created.externalToken);
  expect(replacement).toMatchObject({ status: "resolved", value: { metadata: { concurrentReplacement: true } } });
});

test("create rejects retained active/revoked IDs and occupied token states without partial indexes", async () => {
  const created = await root();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const kernel = createSessionKernel({ redis, random: { uuid: () => created.value.principalSessionId }, config: {
    namespace: scope.namespace,
    principalIdleTtlMs: 30_000,
    principalAbsoluteTtlMs: 60_000,
  } });
  for (const state of ["active", "revoked"]) {
    if (state === "revoked")
      await scope.writer.revokePrincipalSession(created.value.principalSessionId);
    const before = await redis.get(keys.state("principal_session", created.value.externalTokenLookupHash));
    const conflict = await kernel.createPrincipalSession(randomUUID(), { subjectContext: "other" });
    const after = await redis.get(keys.state("principal_session", created.value.externalTokenLookupHash));
    expect(conflict.status).toBe("fail_closed");
    expect(after).toBe(before);
  }
  let occupied = "";
  const tokenRedis = new Proxy(redis, { get(target, property) {
    if (property === "eval") {
      return async (...args: Parameters<NonNullable<SessionKernelRedis["eval"]>>) => {
        if (args[0].includes("session-kernel-direct-create-v1")) {
          occupied = String(args[2]);
          await target.set(occupied, "retained-owner");
        }
        return await target.eval(...args);
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as SessionKernelRedis;
  const tokenConflict = await createSessionKernel({ redis: tokenRedis, config: {
    namespace: scope.namespace,
    principalIdleTtlMs: 30_000,
    principalAbsoluteTtlMs: 60_000,
  } }).createPrincipalSession(randomUUID(), { subjectContext: "other" });
  const preserved = await redis.get(occupied);
  expect(tokenConflict.status).toBe("fail_closed");
  expect(preserved).toBe("retained-owner");
  const inventory = await scope.writer.listPrincipalSessions({ offset: 0, limit: 10 });
  expect(inventory.items).toEqual([]);
});

test("corrupt state and reverse identity are distinct from a missing root", async () => {
  const created = await root();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const stateKey = keys.state("principal_session", created.value.externalTokenLookupHash);
  for (const bad of ["{broken", JSON.stringify({ ...created.value, externalTokenLookupHash: "other" }), JSON.stringify({ ...created.value, state: "active" })]) {
    await redis.set(stateKey, bad, "KEEPTTL");
    const result = await scope.writer.resolvePrincipalSession(created.externalToken);
    expect(result.status).toBe("schema_invalid");
  }
  await redis.set(stateKey, JSON.stringify(created.value), "KEEPTTL");
  await redis.set(keys.identity("principal_session", created.value.principalSessionId), "invalid-digest", "KEEPTTL");
  const invalidId = await scope.writer.resolvePrincipalSessionById(created.value.principalSessionId);
  expect(invalidId.status).toBe("schema_invalid");
  const tokenRead = await scope.writer.resolvePrincipalSession(created.externalToken);
  expect(tokenRead.status).toBe("resolved");
});

for (const corrupted of ["state", "identity"] as const) {
  test(`empty ${corrupted} is corruption for Principal reads and management, not missing`, async () => {
    const created = await root();
    const keys = createSessionKernelKeyBuilder(scope.namespace);
    const stateKey = keys.state("principal_session", created.value.externalTokenLookupHash);
    const idKey = keys.identity("principal_session", created.value.principalSessionId);
    const corruptKey = corrupted === "state" ? stateKey : idKey;
    await redis.set(corruptKey, "", "KEEPTTL");
    const token = await scope.writer.resolvePrincipalSession(created.externalToken);
    const byId = await scope.writer.resolvePrincipalSessionById(created.value.principalSessionId);
    const renewed = await scope.writer.renewPrincipalSession(created.value.principalSessionId);
    expect(token.status).toBe(corrupted === "state" ? "schema_invalid" : "resolved");
    expect(byId.status).toBe("schema_invalid");
    expect(renewed.status).toBe("schema_invalid");
    for (const revoke of [
      () => scope.writer.revokePrincipalSession(created.value.principalSessionId),
      () => scope.writer.revokeObservedObject(created.value, "admin_revoke"),
    ]) {
      let failure: unknown;
      try {
        await revoke();
      }
      catch (cause) { failure = cause; }
      expect(failure).toBeInstanceOf(Error);
      const retained = await redis.get(corruptKey);
      expect(retained).toBe("");
    }
  });
}

for (const deadlinePassed of [false, true]) {
  test(`pending root retains reverse identity and original retention deadline; passed=${deadlinePassed}`, async () => {
    const created = await root();
    const keys = createSessionKernelKeyBuilder(scope.namespace);
    const stateKey = keys.state("principal_session", created.value.externalTokenLookupHash);
    const idKey = keys.identity("principal_session", created.value.principalSessionId);
    const payloadKey = `${scope.namespace}payload`;
    let fail = true;
    let captured: CleanupExecution | undefined;
    const kernel = createSessionKernel({ redis, config: {
      namespace: scope.namespace,
      principalIdleTtlMs: 30_000,
      principalAbsoluteTtlMs: 60_000,
      tombstoneTtlMs: 30,
      tombstoneGraceMs: 0,
    }, cleanupAdapters: [{ protocol: "test", kind: "payload", async cleanup(_ref, execution) {
      captured = execution;
      if (fail)
        throw new Error("cleanup unavailable");
      await execution.deleteOwnedKeys([payloadKey]);
    } }] });
    const expiresAt = (await scope.redisNow()) + (deadlinePassed ? 100 : 30_000);
    await redis.set(stateKey, JSON.stringify({ ...created.value, expiresAt, cleanupRefs: [{ protocol: "test", kind: "payload", ref: "root" }] }), "KEEPTTL");
    await redis.set(payloadKey, "old-owner");
    const failed = await kernel.revokePrincipalSession(created.value.principalSessionId);
    expect(failed.principalSessions.revoked).toBe(1);
    expect(failed.cleanup.failed).toBe(1);
    const original = await kernel.resolvePrincipalSessionById(created.value.principalSessionId);
    expect(original.status).toBe("revoked");
    if (original.status !== "revoked")
      throw new Error("expected tombstone");
    for (const key of [stateKey, idKey]) {
      const ttl = await redis.pttl(key);
      expect(ttl).toBe(-1);
    }
    if (deadlinePassed)
      await waitForRedisCondition(async () => await scope.redisNow() > original.tombstone.expiresAt, "retention deadline");
    fail = false;
    const retried = await kernel.revokePrincipalSession(created.value.principalSessionId);
    expect(retried.cleanup).toMatchObject({ succeeded: 1, failed: 0 });
    for (const key of [stateKey, idKey]) {
      const expiry = await redis.pexpiretime(key);
      expect(expiry).toBe(deadlinePassed ? -2 : original.tombstone.expiresAt);
    }
    // A delayed capability for the old tombstone cannot delete a replacement owner's payload.
    await redis.set(stateKey, JSON.stringify(created.value));
    await redis.set(idKey, created.value.externalTokenLookupHash);
    await redis.set(payloadKey, "new-owner");
    await captured!.deleteOwnedKeys([payloadKey]);
    const retained = await redis.get(payloadKey);
    expect(retained).toBe("new-owner");
  });
}
