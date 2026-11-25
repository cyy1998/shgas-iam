import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { createGenericClientCache, createGenericClientCacheInvalidation } from "@iam/client-snapshot/generic-cache";
import { createClientSnapshotMaintenance, createClientSnapshotVerifier } from "@iam/client-snapshot/maintenance";
import { createExclusiveRedisTestHarness, createRedisTestScopeCloser } from "@iam/test-support/external-test-resources";
import Redis from "ioredis";
import { z } from "zod";

const schema = z.strictObject({
  clientCode: z.string(),
  clientSecret: z.string(),
  createTime: z.date(),
  description: z.string(),
});
const client = {
  clientCode: "portal",
  clientSecret: "internal-secret",
  createTime: new Date("2026-01-01T00:00:00.000Z"),
  description: "2026-11-25T00:00:00.000Z",
};
const codeKey = "cache:client:code:portal";
const secretKey = "cache:client:secret:internal-secret";

let harness: ReturnType<typeof createExclusiveRedisTestHarness>;
let readerRedis: Redis;
let adminRedis: Redis;
let closeRedis: () => Promise<void>;

beforeAll(() => {
  harness = createExclusiveRedisTestHarness({
    environment: process.env,
    name: "IAM_CLIENT_SNAPSHOT_TEST_REDIS_URL",
  });
});
beforeEach(async () => {
  const connect = { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null };
  readerRedis = new Redis(harness.url, connect);
  adminRedis = new Redis(harness.url, connect);
  closeRedis = createRedisTestScopeCloser({ clients: [readerRedis, adminRedis] });
  await Promise.all([readerRedis.connect(), adminRedis.connect()]);
});
afterEach(async () => {
  await harness.reset([closeRedis]);
});
afterAll(async () => {
  await harness.close();
});

test("restore verification finds generic Client keys and repair makes a rotated secret unusable", async () => {
  let current = client;
  const cache = createGenericClientCache({
    redis: readerRedis,
    schema,
    source: {
      getClientByCode: async () => current,
      getClientBySecret: async (secret) => (current.clientSecret === secret ? current : null),
    },
  });
  const beforeRestore = await cache.getClientBySecret(client.clientSecret);
  expect(beforeRestore).toEqual(client);
  current = { ...client, clientSecret: "rotated-after-backup" };
  await adminRedis.set("cache:client:unowned", "preserve");

  const stopped = { protocolTrafficStopped: true } as const;
  const verifier = createClientSnapshotVerifier(adminRedis);
  const restored = await verifier.verifyAllAfterRedisRestore(stopped);
  expect(restored.matchingKeys).toBe(3);
  await createClientSnapshotMaintenance(adminRedis).repairAllAfterRedisRestore(stopped);
  const repaired = await verifier.verifyAllAfterRedisRestore(stopped);
  const unrelated = await adminRedis.get("cache:client:unowned");
  const oldSecret = await cache.getClientBySecret(client.clientSecret);
  const currentCode = await cache.getClientByCode(client.clientCode);
  const currentSecret = await cache.getClientBySecret(current.clientSecret);
  expect(repaired.matchingKeys).toBe(0);
  expect(unrelated).toBe("preserve");
  expect(oldSecret).toBeNull();
  expect(currentCode).toEqual(current);
  expect(currentSecret).toEqual(current);
});

test.each(["code", "secret"] as const)(
  "a suspended %s lookup cannot restore either key after rotation",
  async (kind) => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const rotated = { ...client, clientSecret: "rotated-secret" };
    let current = client;
    async function getByCode() {
      const observed = current;
      entered.resolve();
      await release.promise;
      return observed;
    }
    const cache = createGenericClientCache({
      redis: readerRedis,
      schema,
      source: {
        getClientByCode: getByCode,
        async getClientBySecret(secret) {
          const observed = await getByCode();
          return secret === observed.clientSecret ? observed : null;
        },
      },
    });
    const pending =
      kind === "code" ? cache.getClientByCode(client.clientCode) : cache.getClientBySecret(client.clientSecret);
    try {
      await Promise.race([entered.promise, pending]);
      current = rotated;
      await createGenericClientCacheInvalidation({ redis: adminRedis }).invalidateUpdatedClient(client, rotated);
    } finally {
      release.resolve();
      await Promise.allSettled([pending]);
    }
    const observed = await pending;
    const oldSecretPayload = await adminRedis.get(secretKey);
    const oldSecretRead = await cache.getClientBySecret(client.clientSecret);
    const newSecretRead = await cache.getClientBySecret(rotated.clientSecret);
    const newCodeRead = await cache.getClientByCode(client.clientCode);
    expect(observed).toEqual(kind === "code" ? rotated : null);
    expect(oldSecretPayload).toBeNull();
    expect(oldSecretRead).toBeNull();
    expect(newSecretRead).toEqual(rotated);
    expect(newCodeRead).toEqual(rotated);
  },
);

test.each(["code", "secret"] as const)("a cold %s lookup fills both legacy keys", async (kind) => {
  let available = true;
  async function load() {
    if (!available) throw new Error("The source should be unnecessary on a cache hit");
    return client;
  }
  const cache = createGenericClientCache({
    redis: readerRedis,
    schema,
    source: { getClientByCode: load, getClientBySecret: load },
  });

  const cold = await (kind === "code"
    ? cache.getClientByCode(client.clientCode)
    : cache.getClientBySecret(client.clientSecret));
  available = false;
  const byCode = await cache.getClientByCode(client.clientCode);
  const bySecret = await cache.getClientBySecret(client.clientSecret);
  const payloads = await adminRedis.mget(codeKey, secretKey);

  expect(cold).toEqual(client);
  expect(byCode).toEqual(client);
  expect(bySecret).toEqual(client);
  const stored = JSON.stringify(client);
  expect(payloads).toEqual([stored, stored]);
});

test.each([
  ["malformed JSON", "{"],
  ["invalid schema", JSON.stringify({ clientCode: client.clientCode })],
  ["different identity", JSON.stringify({ ...client, clientSecret: "different-secret" })],
])("removes %s from the secret key when the backing row is absent", async (_label, payload) => {
  await adminRedis.mset(secretKey, payload, codeKey, JSON.stringify(client));
  const cache = createGenericClientCache({
    redis: readerRedis,
    schema,
    source: {
      getClientByCode: async () => {
        throw new Error("The other lookup is already cached");
      },
      getClientBySecret: async () => null,
    },
  });

  const bySecret = await cache.getClientBySecret(client.clientSecret);
  const deleted = await adminRedis.get(secretKey);
  const byCode = await cache.getClientByCode(client.clientCode);

  expect(bySecret).toBeNull();
  expect(deleted).toBeNull();
  expect(byCode).toEqual(client);
});

test("repairs a code key stored as the wrong Redis type from the source", async () => {
  await adminRedis.hset(codeKey, "corrupt", "payload");
  const cache = createGenericClientCache({
    redis: readerRedis,
    schema,
    source: {
      getClientByCode: async () => client,
      getClientBySecret: async () => {
        throw new Error("The secret lookup should be repaired by the code lookup");
      },
    },
  });

  const byCode = await cache.getClientByCode(client.clientCode);
  const bySecret = await cache.getClientBySecret(client.clientSecret);

  expect(byCode).toEqual(client);
  expect(bySecret).toEqual(client);
});
