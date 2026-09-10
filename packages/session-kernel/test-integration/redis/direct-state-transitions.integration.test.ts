import type { DirectStateTransitions } from "../../src/storage/direct-state-transitions";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import Redis from "ioredis";
import { createRedisDirectStateTransitions } from "../../src/storage/direct-state-transitions";

let redis: Redis;
let transitions: DirectStateTransitions;
let namespace: string;
let expiresAt: number;
let ownedKeys: Set<string>;

beforeAll(async () => {
  const url = process.env.IAM_SESSION_KERNEL_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_SESSION_KERNEL_TEST_REDIS_URL must point to a caller-provided dedicated Redis test instance");
  redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0 });
  await redis.connect();
  transitions = createRedisDirectStateTransitions(redis);
});

beforeEach(async () => {
  namespace = `iam:test:direct-state:${randomUUID()}:`;
  ownedKeys = new Set();
  const [seconds, microseconds] = await redis.time();
  expiresAt = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000) + 60_000;
});

afterEach(async () => {
  if (ownedKeys.size > 0)
    await redis.del(...ownedKeys);
});

afterAll(async () => {
  await redis.quit();
});

function key(suffix: string) {
  const value = `${namespace}${suffix}`;
  ownedKeys.add(value);
  return value;
}

function input() {
  return {
    stateKey: key("state"),
    idKey: key("identity"),
    idOwner: "digest-owner",
    serialized: "active-state",
    expiresAt,
    indexes: [{ key: key("index"), score: expiresAt, member: "object" }],
  };
}

async function snapshot() {
  const entries = [];
  for (const name of ownedKeys) {
    const type = await redis.type(name);
    const value = type === "zset"
      ? await redis.zrange(name, 0, -1, "WITHSCORES")
      : await redis.get(name);
    const deadline = await redis.pexpiretime(name);
    entries.push({ name, type, value, deadline });
  }
  return entries;
}

async function rejection(operation: () => Promise<unknown>) {
  let error: unknown;
  try {
    await operation();
  }
  catch (cause) {
    error = cause;
  }
  return error;
}

test.each(["stateKey", "idKey"] as const)("creation preserves an occupied %s and leaves all other keys untouched", async (slot) => {
  const candidate = input();
  await redis.set(candidate[slot], "retained-owner");
  await redis.pexpireat(candidate[slot], expiresAt);
  const before = await snapshot();
  const result = await transitions.create(candidate);
  const after = await snapshot();
  expect(result).toBe(false);
  expect(after).toEqual(before);
});

test.each(["create", "update", "revoke-removal", "revoke-pending", "finalize"] as const)(
  "%s rejects an index of the wrong type before any state, deadline or index changes",
  async (operation) => {
    const candidate = input();
    const badKey = key("bad-index");
    const pendingKey = key("pending");
    if (operation !== "create") {
      const created = await transitions.create(candidate);
      expect(created).toBe(true);
    }
    await redis.set(badKey, "unrelated-string");
    await redis.pexpireat(badKey, expiresAt);
    const before = await snapshot();
    const error = await rejection(async () => {
      if (operation === "create") {
        return await transitions.create({
          ...candidate,
          indexes: [...candidate.indexes, { key: badKey, score: expiresAt, member: "object" }],
        });
      }
      if (operation === "update") {
        return await transitions.update({
          ...candidate,
          expected: candidate.serialized,
          serialized: "renewed-state",
          expiresAt: expiresAt + 10_000,
          indexes: [
            { key: candidate.indexes[0]!.key, score: expiresAt + 10_000, member: "object" },
            { key: badKey, score: expiresAt + 10_000, member: "object" },
          ],
        });
      }
      if (operation === "finalize") {
        return await transitions.finalize({
          ...candidate,
          expected: candidate.serialized,
          now: expiresAt + 1,
          indexKey: badKey,
          member: "object",
        });
      }
      return await transitions.revoke({
        ...candidate,
        expected: candidate.serialized,
        serialized: "revoked-state",
        indexRemovals: [
          { key: candidate.indexes[0]!.key, member: "object" },
          ...(operation === "revoke-removal" ? [{ key: badKey, member: "object" }] : []),
        ],
        pending: { key: operation === "revoke-pending" ? badKey : pendingKey, member: "object", score: expiresAt },
      });
    });
    const after = await snapshot();
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("WRONGTYPE");
    expect(after).toEqual(before);
  },
);

test.each([false, true])("pending retains state and ID without TTL and finalization honors elapsed=%s", async (elapsed) => {
  const candidate = input();
  const pendingKey = key("pending");
  const created = await transitions.create(candidate);
  expect(created).toBe(true);
  const revoked = await transitions.revoke({
    ...candidate,
    expected: candidate.serialized,
    serialized: "revoked-state",
    indexRemovals: candidate.indexes,
    pending: { key: pendingKey, member: "object", score: expiresAt - 1000 },
  });
  const retained = await redis.mget(candidate.stateKey, candidate.idKey);
  const stateTtl = await redis.pttl(candidate.stateKey);
  const idTtl = await redis.pttl(candidate.idKey);
  const removedIndex = await redis.zrange(candidate.indexes[0]!.key, 0, -1);
  const pending = await redis.zrange(pendingKey, 0, -1);
  expect(revoked).toBe(true);
  expect(retained).toEqual(["revoked-state", candidate.idOwner]);
  expect([stateTtl, idTtl]).toEqual([-1, -1]);
  expect(removedIndex).toEqual([]);
  expect(pending).toEqual(["object"]);

  const finalized = await transitions.finalize({
    ...candidate,
    expected: "revoked-state",
    now: expiresAt + (elapsed ? 1 : -1),
    indexKey: pendingKey,
    member: "object",
  });
  const after = await redis.mget(candidate.stateKey, candidate.idKey);
  const stateDeadline = await redis.pexpiretime(candidate.stateKey);
  const idDeadline = await redis.pexpiretime(candidate.idKey);
  const pendingAfter = await redis.zrange(pendingKey, 0, -1);
  expect(finalized).toBe(true);
  expect(after).toEqual(elapsed ? [null, null] : ["revoked-state", candidate.idOwner]);
  expect([stateDeadline, idDeadline]).toEqual(elapsed ? [-2, -2] : [expiresAt, expiresAt]);
  expect(pendingAfter).toEqual([]);
});

test.each(["stateKey", "idKey"] as const)("stale finalization and cleanup preserve replacement %s and payload", async (slot) => {
  const candidate = input();
  const pendingKey = key("pending");
  const payloadKey = key("payload");
  const created = await transitions.create(candidate);
  expect(created).toBe(true);
  const revoked = await transitions.revoke({
    ...candidate,
    expected: candidate.serialized,
    serialized: "revoked-state",
    indexRemovals: candidate.indexes,
    pending: { key: pendingKey, member: "object", score: expiresAt - 1000 },
  });
  expect(revoked).toBe(true);
  await redis.set(candidate[slot], "replacement-owner");
  await redis.pexpireat(candidate[slot], expiresAt + 10_000);
  await redis.set(payloadKey, "replacement-payload");
  const before = await snapshot();
  const finalized = await transitions.finalize({
    ...candidate,
    expected: "revoked-state",
    now: expiresAt + 1,
    indexKey: pendingKey,
    member: "object",
  });
  const afterFinalize = await snapshot();
  const cleaned = await transitions.deleteOwned({
    ...candidate,
    expected: "revoked-state",
    payloadKeys: [payloadKey],
  });
  const afterCleanup = await snapshot();
  expect(finalized).toBe(false);
  expect(cleaned).toBe(false);
  expect(afterFinalize).toEqual(before);
  expect(afterCleanup).toEqual(before);
});
