import type { CleanupExecution } from "../../src/index";
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
const purpose = { protocol: "test", artifactType: "access", clientCode: "client" };
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

async function artifact() {
  const root = await scope.writer.createPrincipalSession(randomUUID(), { subjectContext: "generation" });
  if (root.status !== "created" || !root.externalToken)
    throw new Error("expected root");
  const issued = await scope.writer.createProtocolArtifact({ ...purpose, principalSessionId: root.value.principalSessionId, ttlMs: 30_000 });
  if (issued.status !== "created" || !issued.externalToken)
    throw new Error("expected Artifact");
  return { ...issued, externalToken: issued.externalToken, root };
}

test("consumed Artifact naturally expires with its ID and stops reporting replay", async () => {
  const kernel = createSessionKernel({ redis, config: {
    namespace: scope.namespace,
    principalIdleTtlMs: 30_000,
    principalAbsoluteTtlMs: 60_000,
    tombstoneTtlMs: 100,
    tombstoneGraceMs: 0,
  } });
  const issued = await kernel.createProtocolArtifact({ ...purpose, ttlMs: 300 });
  if (issued.status !== "created" || !issued.externalToken)
    throw new Error("Expected Artifact");
  const consumed = await kernel.consumeProtocolArtifact(issued.externalToken, purpose, issued.value);
  expect(consumed.status).toBe("resolved");
  const replay = await kernel.resolveProtocolArtifact(issued.externalToken, purpose);
  if (replay.status !== "consumed_replay")
    throw new Error("Expected retained consumed terminal");
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const stateKey = keys.state("artifact", issued.value.lookupHash);
  const idKey = keys.identity("artifact", issued.value.artifactId);
  for (const key of [stateKey, idKey]) {
    const expiresAt = await redis.pexpiretime(key);
    expect(expiresAt).toBe(replay.tombstone.expiresAt);
  }
  await waitForRedisCondition(async () => (await scope.redisNow()) > replay.tombstone.expiresAt, "Artifact terminal did not expire");
  const missing = await kernel.resolveProtocolArtifact(issued.externalToken, purpose);
  const lateConsume = await kernel.consumeProtocolArtifact(issued.externalToken, purpose, issued.value);
  const remaining = await redis.mget(stateKey, idKey);
  expect(missing.status).toBe("missing_or_expired");
  expect(lateConsume.status).toBe("missing_or_expired");
  expect(remaining).toEqual([null, null]);
});

test("Artifact token observes one SHA state and Redis time, with independent ID and purpose", async () => {
  const issued = await artifact();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const hash = tokenDigest(issued.externalToken);
  commands.length = 0;
  const resolved = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  expect(resolved).toMatchObject({ status: "resolved", value: { artifactId: issued.value.artifactId, lookupHash: hash } });
  expect(commands).toEqual(["eval"]);
  const raw = await redis.get(keys.state("artifact", hash));
  const id = await redis.get(keys.identity("artifact", issued.value.artifactId));
  expect(JSON.parse(raw!)).toEqual(JSON.parse(JSON.stringify(issued.value)));
  expect(id).toBe(hash);
  for (const key of [keys.state("artifact", hash), keys.identity("artifact", issued.value.artifactId)]) {
    const expiry = await redis.pexpiretime(key);
    expect(expiry).toBe(issued.value.expiresAt);
  }
  for (const token of [hash, issued.value.artifactId, issued.root.externalToken!, "unknown"]) {
    const rejected = await scope.writer.resolveProtocolArtifact(token, purpose);
    expect(rejected.status).toBe("missing_or_expired");
  }
  for (const wrong of [{ ...purpose, protocol: "other" }, { ...purpose, artifactType: "other" }, { ...purpose, clientCode: "other" }]) {
    const rejected = await scope.writer.resolveProtocolArtifact(issued.externalToken, wrong);
    expect(rejected.status).toBe("purpose_mismatch");
  }
  const otherType = await scope.writer.resolveCredential(issued.externalToken, { protocol: "test", credentialType: "access", clientCode: "client" });
  expect(otherType.status).toBe("missing_or_expired");
  for (const bearer of [hash, issued.externalToken]) {
    const wrongId = await scope.writer.revokeArtifact(bearer);
    expect(wrongId.artifacts.missing).toBe(1);
  }
  const revoked = await scope.writer.revokeArtifact(issued.value.artifactId, "logout");
  expect(revoked.artifacts.revoked).toBe(1);
  commands.length = 0;
  const terminal = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  expect(terminal).toMatchObject({ status: "revoked", tombstone: { objectId: issued.value.artifactId, lookupHash: hash, reason: "logout", protocol: purpose.protocol, clientCode: purpose.clientCode, metadata: { artifactType: purpose.artifactType } } });
  expect(commands).toEqual(["eval"]);
});

for (const corrupted of ["state", "identity"] as const) {
  test(`Artifact empty ${corrupted} fails as corruption and cannot be replaced by revocation`, async () => {
    const issued = await artifact();
    const keys = createSessionKernelKeyBuilder(scope.namespace);
    const key = corrupted === "state" ? keys.state("artifact", issued.value.lookupHash) : keys.identity("artifact", issued.value.artifactId);
    await redis.set(key, "", "KEEPTTL");
    const read = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
    expect(read.status).toBe(corrupted === "state" ? "schema_invalid" : "resolved");
    for (const revoke of [() => scope.writer.revokeArtifact(issued.value.artifactId), () => scope.writer.revokeObservedObject(issued.value, "admin_revoke")]) {
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

test("Artifact malformed state, digest mismatch and Redis faults remain distinct from missing", async () => {
  const issued = await artifact();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const key = keys.state("artifact", issued.value.lookupHash);
  for (const bad of ["{broken", JSON.stringify({ ...issued.value, lookupHash: "other" }), JSON.stringify({ ...issued.value, state: "active" })]) {
    await redis.set(key, bad, "KEEPTTL");
    const result = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
    expect(result.status).toBe("schema_invalid");
  }
  await redis.del(key);
  await redis.lpush(key, "wrong-type");
  let failure: unknown;
  try {
    await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  }
  catch (cause) { failure = cause; }
  expect(failure).toBeInstanceOf(Error);
  await redis.del(key);
  const missing = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  expect(missing.status).toBe("missing_or_expired");
});

test("late Artifact observation revocation preserves replacement and cannot revive revoked state", async () => {
  const issued = await artifact();
  const acquired = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  if (acquired.status !== "resolved")
    throw new Error("expected observation");
  scope.replaceObjectBeforeNextRevoke();
  const stale = await scope.writer.revokeObservedObject(acquired.value, "admin_revoke");
  expect(stale.artifacts).toMatchObject({ revoked: 0, excluded: 1 });
  const newer = await scope.observer.resolveProtocolArtifact(issued.externalToken, purpose);
  expect(newer).toMatchObject({ status: "resolved", value: { metadata: { concurrentReplacement: true } } });
  const revoked = await scope.observer.revokeArtifact(issued.value.artifactId);
  const late = await scope.writer.revokeObservedObject(acquired.value, "admin_revoke");
  expect(revoked.artifacts.revoked).toBe(1);
  expect(late.artifacts).toMatchObject({ revoked: 0, alreadyRevoked: 1 });
  expect(acquired.value.artifactId).toBe(issued.value.artifactId);
  const denied = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  expect(denied.status).toBe("revoked");
});

for (const deadlinePassed of [false, true]) {
  test(`Artifact pending keeps state and ID until cleanup restores original retention; passed=${deadlinePassed}`, async () => {
    const issued = await artifact();
    const keys = createSessionKernelKeyBuilder(scope.namespace);
    const stateKey = keys.state("artifact", issued.value.lookupHash);
    const idKey = keys.identity("artifact", issued.value.artifactId);
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
    await redis.set(stateKey, JSON.stringify({ ...issued.value, expiresAt, cleanupRefs: [{ protocol: "test", kind: "payload", ref: "artifact" }] }), "KEEPTTL");
    await redis.set(payloadKey, "original");
    const revoked = await kernel.revokeArtifact(issued.value.artifactId);
    expect(revoked).toMatchObject({ artifacts: { revoked: 1 }, cleanup: { failed: 1 } });
    const terminal = await redis.get(stateKey);
    const retainedUntil = JSON.parse(terminal!).expiresAt;
    for (const key of [stateKey, idKey]) {
      const ttl = await redis.pttl(key);
      expect(ttl).toBe(-1);
    }
    if (deadlinePassed)
      await waitForRedisCondition(async () => await scope.redisNow() > retainedUntil, "retention deadline not reached");
    const denied = await kernel.resolveProtocolArtifact(issued.externalToken, purpose);
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

test("Artifact create rejects invalid index types before establishing either authority key", async () => {
  const issued = await artifact();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const id = randomUUID();
  const token = randomUUID();
  const index = keys.index.client("broken");
  await redis.set(index, "wrong-type");
  const attempt = await scope.writer.createProtocolArtifact({ ...purpose, principalSessionId: issued.root.value.principalSessionId, artifactId: id, externalToken: token, clientCode: "broken", ttlMs: 30_000 });
  expect(attempt.status).toBe("fail_closed");
  const state = await redis.get(keys.state("artifact", tokenDigest(token)));
  const identity = await redis.get(keys.identity("artifact", id));
  const membership = await redis.zscore(keys.index.principal(issued.root.value.principalSessionId), encodeIndexMember("artifact", id));
  expect({ state, identity, membership }).toEqual({ state: null, identity: null, membership: null });
});

test("Artifact creation cannot overwrite active or consumed token and identity owners", async () => {
  const issued = await artifact();
  for (const terminal of [false, true]) {
    if (terminal) {
      const consumed = await scope.writer.consumeProtocolArtifact(issued.externalToken, purpose, issued.value);
      expect(consumed.status).toBe("resolved");
    }
    for (const owner of [{ artifactId: issued.value.artifactId }, { externalToken: issued.externalToken }]) {
      const attempt = await scope.writer.createProtocolArtifact({ ...purpose, ...owner, ttlMs: 30_000 });
      expect(attempt.status).toBe("fail_closed");
    }
    const preserved = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
    expect(preserved.status).toBe(terminal ? "consumed_replay" : "resolved");
  }
});

test("Artifact atomic consumption preserves one state, owner, index and deadline with one winner", async () => {
  const issued = await artifact();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const a = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  const b = await scope.observer.resolveProtocolArtifact(issued.externalToken, purpose);
  if (a.status !== "resolved" || b.status !== "resolved")
    throw new Error("expected two observations");
  for (const token of [issued.value.artifactId, issued.value.lookupHash, "other"]) {
    const mismatch = await scope.writer.consumeProtocolArtifact(token, purpose, a.value);
    expect(mismatch.status).toBe("fail_closed");
  }
  const forged = await scope.writer.consumeProtocolArtifact(issued.externalToken, purpose, { ...a.value });
  expect(forged.status).toBe("fail_closed");
  const results = await Promise.all([
    scope.writer.consumeProtocolArtifact(issued.externalToken, purpose, a.value),
    scope.observer.consumeProtocolArtifact(issued.externalToken, purpose, b.value),
  ]);
  expect(results.map(value => value.status).sort()).toEqual(["consumed_replay", "resolved"]);
  const stateKey = keys.state("artifact", issued.value.lookupHash);
  const idKey = keys.identity("artifact", issued.value.artifactId);
  const raw = await redis.get(stateKey);
  const terminal = JSON.parse(raw!);
  expect(terminal).toMatchObject({ state: "revoked", reason: "consumed", objectId: issued.value.artifactId, lookupHash: issued.value.lookupHash });
  const identity = await redis.get(idKey);
  expect(identity).toBe(issued.value.lookupHash);
  for (const key of [stateKey, idKey]) {
    const expiry = await redis.pexpiretime(key);
    expect(expiry).toBe(terminal.expiresAt);
  }
  const index = await redis.zscore(keys.index.protocol(purpose.protocol), encodeIndexMember("artifact", issued.value.artifactId));
  expect(index).toBeNull();
  const revoked = await scope.writer.revokeArtifact(issued.value.artifactId);
  expect(revoked.artifacts).toMatchObject({ revoked: 0, alreadyRevoked: 1 });
  await redis.del(stateKey, idKey);
  const vanished = await scope.writer.consumeProtocolArtifact(issued.externalToken, purpose, a.value);
  expect(vanished.status).toBe("missing_or_expired");
  const absent = await scope.writer.resolveProtocolArtifact(issued.externalToken, purpose);
  expect(absent.status).toBe("missing_or_expired");
});

test("Artifact consume rejects corrupt or changed ownership without writes", async () => {
  const issued = await artifact();
  const keys = createSessionKernelKeyBuilder(scope.namespace);
  const stateKey = keys.state("artifact", issued.value.lookupHash);
  const idKey = keys.identity("artifact", issued.value.artifactId);
  for (const corrupted of ["", "{broken", JSON.stringify({ ...issued.value, lookupHash: "wrong" })]) {
    await redis.set(stateKey, corrupted, "KEEPTTL");
    const result = await scope.writer.consumeProtocolArtifact(issued.externalToken, purpose, issued.value);
    expect(result.status).toBe("schema_invalid");
    const raw = await redis.get(stateKey);
    expect(raw).toBe(corrupted);
  }
  await redis.set(stateKey, JSON.stringify(issued.value), "KEEPTTL");
  await redis.set(idKey, "another-owner", "KEEPTTL");
  const wrongOwner = await scope.writer.consumeProtocolArtifact(issued.externalToken, purpose, issued.value);
  expect(wrongOwner.status).toBe("fail_closed");
  const raw = await redis.get(stateKey);
  expect(JSON.parse(raw!)).toEqual(JSON.parse(JSON.stringify(issued.value)));
});

test("parentless Return Handle keeps its own deadline and uses generated token", async () => {
  const handlePurpose = { protocol: "oidc", artifactType: "return_handle" };
  const issued = await scope.writer.createProtocolArtifact({ ...handlePurpose, tokenKind: "oidcReturnHandle", ttlMs: 30_000 });
  if (issued.status !== "created" || !issued.externalToken)
    throw new Error("expected Return Handle");
  expect(issued.value.principalSessionId).toBeUndefined();
  const read = await scope.writer.resolveProtocolArtifact(issued.externalToken, handlePurpose);
  expect(read.status).toBe("resolved");
  const consumed = await scope.writer.consumeProtocolArtifact(issued.externalToken, handlePurpose, issued.value);
  expect(consumed.status).toBe("resolved");
});
