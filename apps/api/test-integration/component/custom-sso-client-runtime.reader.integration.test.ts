import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import {
  createCustomSsoClientRuntimeReader,
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import {
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
} from "@iam/api-core/custom-sso";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const runtimeClient = {
  id: 7,
  clientCode: "gateway",
  clientName: "Gateway",
  status: ClientStatus.Enable,
  isDelete: false,
  customSsoEnabled: true,
  customSsoConfig: {
    mode: CustomSsoClientMode.Gateway,
    orcas: { enabled: false },
    subjectClaims: [SubjectClaim.SubjectIdentifier],
    validRedirectUrls: ["https://gateway.example.com/callback"],
  },
  customSsoConfigVersion: 3,
} satisfies CustomSsoClientRuntimeDto;

const clock = {
  value: 1_000_000,
  now() {
    return clock.value;
  },
};

const positiveCacheTtlMs = 30_000;
const negativeCacheTtlMs = 3_000;

class FakeRuntimeCacheRedis {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();

  async get(key: string) {
    this.expireIfNeeded(key);
    return this.values.get(key) ?? null;
  }

  async eval(
    _script: string,
    keyCount: number,
    ...args: string[]
  ) {
    if (keyCount !== 3)
      throw new Error(`unexpected key count ${keyCount}`);

    const [cacheKey, mutationKey, generationKey] = args;
    if (
      cacheKey === undefined
      || mutationKey === undefined
      || generationKey === undefined
    ) {
      throw new Error("missing runtime cache keys");
    }
    this.expireIfNeeded(cacheKey);
    this.expireIfNeeded(mutationKey);

    if (args.length === 3) {
      const mutation = this.values.get(mutationKey);
      if (mutation !== undefined)
        return ["blocked"];
      return [
        "ready",
        this.values.get(generationKey) ?? "0",
        this.values.get(cacheKey) ?? null,
      ];
    }

    const expectedGeneration = args[3];
    const serialized = args[4];
    const ttlMs = Number(args[5]);
    if (
      expectedGeneration === undefined
      || serialized === undefined
      || !Number.isSafeInteger(ttlMs)
      || ttlMs <= 0
    ) {
      throw new Error("invalid runtime cache publish");
    }
    if (this.values.has(mutationKey))
      return 0;
    const currentGeneration = this.values.get(generationKey) ?? "0";
    if (currentGeneration !== expectedGeneration)
      return 0;
    this.values.set(cacheKey, serialized);
    this.expirations.set(cacheKey, clock.now() + ttlMs);
    return 1;
  }

  beginMutation(clientCode: string, mutationId = "mutation-1") {
    const cacheKey = customSsoClientRuntimeCacheKey(clientCode);
    const generationKey = customSsoClientRuntimeGenerationKey(clientCode);
    const mutationKey = customSsoClientRuntimeMutationKey(clientCode);
    const current = BigInt(this.values.get(generationKey) ?? "0");
    this.values.set(generationKey, String(current + 1n));
    this.values.delete(cacheKey);
    this.expirations.delete(cacheKey);
    this.values.set(mutationKey, mutationId);
  }

  private expireIfNeeded(key: string) {
    const expiration = this.expirations.get(key);
    if (expiration !== undefined && expiration <= clock.now()) {
      this.expirations.delete(key);
      this.values.delete(key);
    }
  }
}

function cachedRecord(
  client: CustomSsoClientRuntimeDto | null,
  options: {
    clientCode?: string;
    expiresAt?: number;
    generation?: string;
  } = {},
) {
  return JSON.stringify({
    version: 1,
    generation: options.generation ?? "0",
    clientCode: options.clientCode ?? client?.clientCode ?? "missing",
    expiresAt: options.expiresAt ?? clock.now() + positiveCacheTtlMs,
    client,
  });
}

function createReader(
  redis: FakeRuntimeCacheRedis,
  findRuntimeRecord: (
    clientCode: string,
  ) => Promise<CustomSsoClientRuntimeDto | null>,
) {
  return createCustomSsoClientRuntimeReader({
    redis,
    source: { findRuntimeRecord },
    clock,
    cache: {
      positiveTtlMs: positiveCacheTtlMs,
      negativeTtlMs: negativeCacheTtlMs,
    },
  });
}

describe("Custom SSO client runtime reader", () => {
  test("returns a bounded strict cache hit without consulting PostgreSQL", async () => {
    const redis = new FakeRuntimeCacheRedis();
    redis.values.set(
      customSsoClientRuntimeCacheKey(runtimeClient.clientCode),
      cachedRecord(runtimeClient),
    );
    const findRuntimeRecord = mock(async () => {
      throw new Error("PostgreSQL must not be queried on a cache hit");
    });
    const reader = createReader(redis, findRuntimeRecord);

    await expect(reader.findRuntimeRecord(runtimeClient.clientCode))
      .resolves
      .toEqual(runtimeClient);
    expect(findRuntimeRecord).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", null],
    ["malformed", "{\"version\":\"legacy\"}"],
    [
      "cross-client",
      cachedRecord(
        { ...runtimeClient, clientCode: "other" },
        { clientCode: runtimeClient.clientCode },
      ),
    ],
  ])("loads one current row and replaces a %s cache entry", async (_, cached) => {
    const redis = new FakeRuntimeCacheRedis();
    if (cached !== null) {
      redis.values.set(
        customSsoClientRuntimeCacheKey(runtimeClient.clientCode),
        cached,
      );
    }
    const findRuntimeRecord = mock(async () => runtimeClient);
    const reader = createReader(redis, findRuntimeRecord);

    await expect(reader.findRuntimeRecord(runtimeClient.clientCode))
      .resolves
      .toEqual(runtimeClient);
    expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
    expect(JSON.parse(
      redis.values.get(customSsoClientRuntimeCacheKey(runtimeClient.clientCode))
      ?? "null",
    )).toEqual({
      version: 1,
      generation: "0",
      clientCode: runtimeClient.clientCode,
      expiresAt: clock.now() + positiveCacheTtlMs,
      client: runtimeClient,
    });
    expect(
      redis.expirations.get(
        customSsoClientRuntimeCacheKey(runtimeClient.clientCode),
      ),
    ).toBe(clock.now() + positiveCacheTtlMs);
  });

  test("single-flights concurrent misses into one current-client query", async () => {
    const redis = new FakeRuntimeCacheRedis();
    const findRuntimeRecord = mock(async () => {
      await Promise.resolve();
      return runtimeClient;
    });
    const reader = createReader(redis, findRuntimeRecord);

    const clients = await Promise.all(
      Array.from(
        { length: 16 },
        () => reader.findRuntimeRecord(runtimeClient.clientCode),
      ),
    );

    expect(clients).toEqual(clients.map(() => runtimeClient));
    expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
  });

  test("fails closed when an Admin mutation overlaps an in-flight database read", async () => {
    const redis = new FakeRuntimeCacheRedis();
    let releaseLoad!: () => void;
    const loadBlocked = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    const findRuntimeRecord = mock(async () => {
      await loadBlocked;
      return runtimeClient;
    });
    const reader = createReader(redis, findRuntimeRecord);

    const overlappingRead = reader.findRuntimeRecord(runtimeClient.clientCode);
    await Promise.resolve();
    redis.beginMutation(runtimeClient.clientCode);
    releaseLoad();

    await expect(overlappingRead).rejects.toBeInstanceOf(
      CustomSsoClientRuntimeUnavailableError,
    );
    expect(
      redis.values.has(customSsoClientRuntimeCacheKey(runtimeClient.clientCode)),
    ).toBe(false);
  });

  test("uses a shorter bounded TTL for absent clients", async () => {
    const redis = new FakeRuntimeCacheRedis();
    const findRuntimeRecord = mock(async () => null);
    const reader = createReader(redis, findRuntimeRecord);

    await expect(reader.findRuntimeRecord("missing")).resolves.toBeNull();
    await expect(reader.findRuntimeRecord("missing")).resolves.toBeNull();
    expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
    expect(JSON.parse(
      redis.values.get(customSsoClientRuntimeCacheKey("missing")) ?? "null",
    )).toEqual({
      version: 1,
      generation: "0",
      clientCode: "missing",
      expiresAt: clock.now() + negativeCacheTtlMs,
      client: null,
    });

    clock.value += negativeCacheTtlMs;
    await expect(reader.findRuntimeRecord("missing")).resolves.toBeNull();
    expect(findRuntimeRecord).toHaveBeenCalledTimes(2);
  });

  test("ignores an expired envelope even when Redis retained the key", async () => {
    const redis = new FakeRuntimeCacheRedis();
    redis.values.set(
      customSsoClientRuntimeCacheKey(runtimeClient.clientCode),
      cachedRecord(runtimeClient, { expiresAt: clock.now() }),
    );
    const disabledClient = {
      ...runtimeClient,
      customSsoEnabled: false,
      customSsoConfigVersion: 4,
    };
    const findRuntimeRecord = mock(async () => disabledClient);
    const reader = createReader(redis, findRuntimeRecord);

    await expect(reader.findRuntimeRecord(runtimeClient.clientCode))
      .resolves
      .toEqual(disabledClient);
    expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
  });

  test("rejects a cache envelope from a different runtime generation", async () => {
    const redis = new FakeRuntimeCacheRedis();
    redis.values.set(
      customSsoClientRuntimeGenerationKey(runtimeClient.clientCode),
      "1",
    );
    redis.values.set(
      customSsoClientRuntimeCacheKey(runtimeClient.clientCode),
      cachedRecord(runtimeClient, { generation: "0" }),
    );
    const updatedClient = {
      ...runtimeClient,
      customSsoEnabled: false,
      customSsoConfigVersion: 4,
    };
    const findRuntimeRecord = mock(async () => updatedClient);
    const reader = createReader(redis, findRuntimeRecord);

    await expect(reader.findRuntimeRecord(runtimeClient.clientCode))
      .resolves
      .toEqual(updatedClient);
    expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
    expect(JSON.parse(
      redis.values.get(
        customSsoClientRuntimeCacheKey(runtimeClient.clientCode),
      ) ?? "null",
    )).toMatchObject({
      generation: "1",
      client: updatedClient,
    });
  });

  test("preserves existing non-ASCII and delimiter Client Codes", async () => {
    const redis = new FakeRuntimeCacheRedis();
    const findRuntimeRecord = mock(async (clientCode: string) => ({
      ...runtimeClient,
      clientCode,
    }));
    const reader = createReader(redis, findRuntimeRecord);

    for (const clientCode of [
      "_legacy",
      "legacy:client",
      "中文客户端",
      "legacy/client",
    ]) {
      await expect(reader.findRuntimeRecord(clientCode)).resolves.toMatchObject({
        clientCode,
      });
    }

    expect(findRuntimeRecord).toHaveBeenCalledTimes(4);
  });

  test("rejects only out-of-range client codes before Redis or PostgreSQL", async () => {
    const redis = new FakeRuntimeCacheRedis();
    const evalCall = mock(redis.eval.bind(redis));
    redis.eval = evalCall;
    const findRuntimeRecord = mock(async () => runtimeClient);
    const reader = createReader(redis, findRuntimeRecord);

    for (const clientCode of ["", "a".repeat(65)]) {
      await expect(reader.findRuntimeRecord(clientCode))
        .resolves
        .toBeNull();
    }

    expect(evalCall).not.toHaveBeenCalled();
    expect(findRuntimeRecord).not.toHaveBeenCalled();
  });

  test("fails closed while a client runtime mutation fence is active", async () => {
    const redis = new FakeRuntimeCacheRedis();
    redis.beginMutation(runtimeClient.clientCode);
    const findRuntimeRecord = mock(async () => runtimeClient);
    const reader = createReader(redis, findRuntimeRecord);

    await expect(reader.findRuntimeRecord(runtimeClient.clientCode))
      .rejects
      .toBeInstanceOf(CustomSsoClientRuntimeUnavailableError);
    expect(findRuntimeRecord).not.toHaveBeenCalled();
  });

  test("maps Redis and source uncertainty to a stable typed unavailable error", async () => {
    const redisFailure = new FakeRuntimeCacheRedis();
    redisFailure.eval = mock(async () => {
      throw new Error("redis unavailable");
    });
    const sourceFailure = new FakeRuntimeCacheRedis();

    await expect(
      createReader(redisFailure, mock(async () => runtimeClient))
        .findRuntimeRecord(runtimeClient.clientCode),
    ).rejects.toBeInstanceOf(CustomSsoClientRuntimeUnavailableError);
    await expect(
      createReader(sourceFailure, mock(async () => {
        throw new Error("postgres unavailable");
      })).findRuntimeRecord(runtimeClient.clientCode),
    ).rejects.toBeInstanceOf(CustomSsoClientRuntimeUnavailableError);
  });
});
