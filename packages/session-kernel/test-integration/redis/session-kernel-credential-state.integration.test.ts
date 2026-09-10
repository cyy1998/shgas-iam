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
const purpose = { protocol: "test", credentialType: "access", clientCode: "client" };
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

async function credential() {
  const root = await scope.writer.createPrincipalSession(randomUUID(), { subjectContext: "generation" });
  if (root.status !== "created" || !root.externalToken)
    throw new Error("expected root");
  const issued = await scope.writer.issueCredential({ ...purpose, principalSessionId: root.value.principalSessionId, ttlMs: 30_000 });
  if (issued.status !== "created" || !issued.externalToken)
    throw new Error("expected Credential");
  return { ...issued, externalToken: issued.externalToken, root };
}

test("Credential token observes one SHA state and Redis time, with independent ID and purpose", async () => {
  const issued = await credential();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const hash = tokenDigest(issued.externalToken);
  commands.length = 0;
  const resolved = await scope.writer.resolveCredential(issued.externalToken, purpose);
  expect(resolved).toMatchObject({ status: "resolved", value: { credentialId: issued.value.credentialId, lookupHash: hash } });
  expect(commands).toEqual(["eval"]);
  const raw = await redis.get(keys.state("credential", hash));
  const id = await redis.get(keys.identity("credential", issued.value.credentialId));
  expect(JSON.parse(raw!)).toEqual(JSON.parse(JSON.stringify(issued.value)));
  expect(id).toBe(hash);
  for (const key of [keys.state("credential", hash), keys.identity("credential", issued.value.credentialId)]) {
    const expiry = await redis.pexpiretime(key);
    expect(expiry).toBe(issued.value.expiresAt);
  }
  for (const token of [hash, issued.value.credentialId, issued.root.externalToken!, "unknown"]) {
    const rejected = await scope.writer.resolveCredential(token, purpose);
    expect(rejected.status).toBe("missing_or_expired");
  }
  for (const wrong of [{ ...purpose, protocol: "other" }, { ...purpose, credentialType: "other" }, { ...purpose, clientCode: "other" }]) {
    const rejected = await scope.writer.resolveCredential(issued.externalToken, wrong);
    expect(rejected.status).toBe("purpose_mismatch");
  }
  const artifact = await scope.writer.resolveProtocolArtifact(issued.externalToken, { protocol: "test", artifactType: "code" });
  expect(artifact.status).toBe("missing_or_expired");
  for (const bearer of [hash, issued.externalToken]) {
    const wrongId = await scope.writer.revokeCredential(bearer);
    expect(wrongId.credentials.missing).toBe(1);
  }
  const revoked = await scope.writer.revokeCredential(issued.value.credentialId, "logout");
  expect(revoked.credentials.revoked).toBe(1);
  commands.length = 0;
  const terminal = await scope.writer.resolveCredential(issued.externalToken, purpose);
  expect(terminal).toMatchObject({ status: "revoked", tombstone: { objectId: issued.value.credentialId, lookupHash: hash, reason: "logout", protocol: purpose.protocol, clientCode: purpose.clientCode, metadata: { credentialType: purpose.credentialType } } });
  expect(commands).toEqual(["eval"]);
});

for (const corrupted of ["state", "identity"] as const) {
  test(`Credential empty ${corrupted} fails as corruption and cannot be replaced by revocation`, async () => {
    const issued = await credential();
    const keys = createSessionKernelKeyBuilder(scope.namespace);
    const key = corrupted === "state" ? keys.state("credential", issued.value.lookupHash) : keys.identity("credential", issued.value.credentialId);
    await redis.set(key, "", "KEEPTTL");
    const read = await scope.writer.resolveCredential(issued.externalToken, purpose);
    expect(read.status).toBe(corrupted === "state" ? "schema_invalid" : "resolved");
    for (const revoke of [() => scope.writer.revokeCredential(issued.value.credentialId), () => scope.writer.revokeObservedObject(issued.value, "admin_revoke")]) {
      let failure: unknown;
      try {
        await revoke();
      }
      catch (cause) { failure = cause; }
      expect(failure).toBeInstanceOf(Error);
      const preserved = await redis.get(key);
      expect(preserved).toBe("");
    }
  });
}

test("Credential malformed state, digest mismatch and Redis faults remain distinct from missing", async () => {
  const issued = await credential();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const key = keys.state("credential", issued.value.lookupHash);
  for (const bad of ["{broken", JSON.stringify({ ...issued.value, lookupHash: "other" }), JSON.stringify({ ...issued.value, state: "active" })]) {
    await redis.set(key, bad, "KEEPTTL");
    const result = await scope.writer.resolveCredential(issued.externalToken, purpose);
    expect(result.status).toBe("schema_invalid");
  }
  await redis.del(key);
  await redis.lpush(key, "wrong-type");
  let failure: unknown;
  try {
    await scope.writer.resolveCredential(issued.externalToken, purpose);
  }
  catch (cause) { failure = cause; }
  expect(failure).toBeInstanceOf(Error);
  await redis.del(key);
  const missing = await scope.writer.resolveCredential(issued.externalToken, purpose);
  expect(missing.status).toBe("missing_or_expired");
});

test("late Credential observation revocation preserves replacement and cannot revive revoked state", async () => {
  const issued = await credential();
  const acquired = await scope.writer.resolveCredential(issued.externalToken, purpose);
  if (acquired.status !== "resolved")
    throw new Error("expected observation");
  scope.replaceObjectBeforeNextRevoke();
  const stale = await scope.writer.revokeObservedObject(acquired.value, "admin_revoke");
  expect(stale.credentials).toMatchObject({ revoked: 0, excluded: 1 });
  const newer = await scope.observer.resolveCredential(issued.externalToken, purpose);
  expect(newer).toMatchObject({ status: "resolved", value: { metadata: { concurrentReplacement: true } } });
  const revoked = await scope.observer.revokeCredential(issued.value.credentialId);
  const late = await scope.writer.revokeObservedObject(acquired.value, "admin_revoke");
  expect(revoked.credentials.revoked).toBe(1);
  expect(late.credentials).toMatchObject({ revoked: 0, alreadyRevoked: 1 });
  expect(acquired.value.credentialId).toBe(issued.value.credentialId);
  const denied = await scope.writer.resolveCredential(issued.externalToken, purpose);
  expect(denied.status).toBe("revoked");
});

test("a delayed renewable Credential update cannot overwrite a concurrent terminal state", async () => {
  const issued = await credential();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const stateKey = keys.state("credential", issued.value.lookupHash);
  await redis.set(stateKey, JSON.stringify({ ...issued.value, renewalPolicy: "extend_with_principal" }), "KEEPTTL");
  let reached!: () => void;
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const resumed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayedRedis = new Proxy(redis, { get(target, property) {
    if (property === "eval") {
      return async (...args: Parameters<NonNullable<SessionKernelRedis["eval"]>>) => {
        if (args[0].includes("session-kernel-direct-update-v1") && args[2] === stateKey) {
          reached();
          await resumed;
        }
        return await target.eval(...args);
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } }) as SessionKernelRedis;
  const kernel = createSessionKernel({ redis: delayedRedis, config: scope.writer.config });
  const updating = kernel.renewPrincipalSession(issued.root.value.principalSessionId);
  try {
    await paused;
    const revoked = await scope.observer.revokeCredential(issued.value.credentialId);
    expect(revoked.credentials.revoked).toBe(1);
  }
  finally { release(); }
  const renewed = await updating;
  expect(renewed.status).toBe("resolved");
  const after = await scope.writer.resolveCredential(issued.externalToken, purpose);
  expect(after.status).toBe("revoked");
  const member = await redis.zscore(keys.index.principal(issued.root.value.principalSessionId), encodeIndexMember("credential", issued.value.credentialId));
  expect(member).toBeNull();
});

for (const deadlinePassed of [false, true]) {
  test(`Credential pending keeps state and ID until cleanup restores original retention; passed=${deadlinePassed}`, async () => {
    const issued = await credential();
    const keys = createSessionKernelKeyBuilder(scope.namespace);
    const stateKey = keys.state("credential", issued.value.lookupHash);
    const idKey = keys.identity("credential", issued.value.credentialId);
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
    await redis.set(stateKey, JSON.stringify({ ...issued.value, expiresAt, cleanupRefs: [{ protocol: "test", kind: "payload", ref: "credential" }] }), "KEEPTTL");
    await redis.set(payloadKey, "original");
    const revoked = await kernel.revokeCredential(issued.value.credentialId);
    expect(revoked).toMatchObject({ credentials: { revoked: 1 }, cleanup: { failed: 1 } });
    const terminal = await redis.get(stateKey);
    const retainedUntil = JSON.parse(terminal!).expiresAt;
    for (const key of [stateKey, idKey]) {
      const ttl = await redis.pttl(key);
      expect(ttl).toBe(-1);
    }
    if (deadlinePassed)
      await waitForRedisCondition(async () => await scope.redisNow() > retainedUntil, "retention deadline not reached");
    const denied = await kernel.resolveCredential(issued.externalToken, purpose);
    expect(denied.status).toBe("revoked");
    const inventory = await kernel.inventoryClientProtocol(purpose.clientCode, purpose.protocol);
    expect(inventory.counts.cleanupPending).toBe(1);
    fail = false;
    const cleanup = await kernel.revokeClientProtocol(purpose.clientCode, purpose.protocol);
    expect(cleanup.cleanup).toMatchObject({ failed: 0, succeeded: 1 });
    for (const key of [stateKey, idKey]) {
      const expiry = await redis.pexpiretime(key);
      expect(expiry).toBe(deadlinePassed ? -2 : retainedUntil);
    }
    const payload = await redis.get(payloadKey);
    expect(payload).toBeNull();
    await redis.set(stateKey, JSON.stringify(issued.value));
    await redis.set(idKey, issued.value.lookupHash);
    await redis.set(payloadKey, "new-owner");
    await captured!.deleteOwnedKeys([payloadKey]);
    const newer = await redis.get(payloadKey);
    expect(newer).toBe("new-owner");
  });
}

test("Credential create rejects invalid index types before establishing either authority key", async () => {
  const issued = await credential();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const id = randomUUID();
  const token = randomUUID();
  const index = keys.index.client("broken");
  await redis.set(index, "wrong-type");
  const attempt = await scope.writer.issueCredential({ ...purpose, principalSessionId: issued.root.value.principalSessionId, credentialId: id, externalToken: token, clientCode: "broken" });
  expect(attempt.status).toBe("fail_closed");
  const state = await redis.get(keys.state("credential", tokenDigest(token)));
  const identity = await redis.get(keys.identity("credential", id));
  const membership = await redis.zscore(keys.index.principal(issued.root.value.principalSessionId), encodeIndexMember("credential", id));
  expect({ state, identity, membership }).toEqual({ state: null, identity: null, membership: null });
});
