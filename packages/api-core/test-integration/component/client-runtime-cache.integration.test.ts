import {
  abortCustomSsoClientRuntimeMutation,
  beginCustomSsoClientRuntimeMutation,
  completeCustomSsoClientRuntimeMutation,
  CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS,
  CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS,
  CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS,
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
  invalidateCustomSsoClientRuntime,
  renewCustomSsoClientRuntimeMutation,
  startCustomSsoClientRuntimeMutationHeartbeat,
} from "@iam/api-core/custom-sso";
import { describe, expect, mock, test } from "bun:test";

class FakeMutationRedis {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();
  renewGate?: Promise<void>;
  renewStarted?: () => void;
  now = 1_000_000;

  async eval(
    _script: string,
    keyCount: number,
    ...args: string[]
  ) {
    if (keyCount === 1) {
      const [mutationKey, mutationId, ttlRaw] = args;
      if (
        mutationKey === undefined
        || mutationId === undefined
      ) {
        throw new Error("missing ownership arguments");
      }
      this.expireIfNeeded(mutationKey);
      const currentMutationId = this.values.get(mutationKey);
      if (currentMutationId === undefined)
        return 2;
      if (currentMutationId !== mutationId)
        return 0;
      if (ttlRaw === undefined)
        return 1;
      this.renewStarted?.();
      await this.renewGate;
      this.expireIfNeeded(mutationKey);
      if (this.values.get(mutationKey) === undefined)
        return 2;
      if (this.values.get(mutationKey) !== mutationId)
        return 0;
      const ttlMs = Number(ttlRaw);
      if (!Number.isSafeInteger(ttlMs))
        throw new Error("invalid renew TTL");
      this.expirations.set(mutationKey, this.now + ttlMs);
      return 1;
    }
    if (keyCount !== 3)
      throw new Error("unexpected key count");
    const [mutationKey, generationKey, cacheKey] = args;
    if (
      mutationKey === undefined
      || generationKey === undefined
      || cacheKey === undefined
    ) {
      throw new Error("missing keys");
    }
    this.expireIfNeeded(mutationKey);

    if (args.length === 5) {
      const mutationId = args[3];
      const ttlMs = Number(args[4]);
      if (mutationId === undefined || !Number.isSafeInteger(ttlMs))
        throw new Error("invalid begin arguments");
      this.values.set(mutationKey, mutationId);
      this.expirations.set(mutationKey, this.now + ttlMs);
      this.increment(generationKey);
      this.values.delete(cacheKey);
      return this.values.get(generationKey);
    }

    const mutationId = args[3];
    if (mutationId === undefined)
      throw new Error("missing mutation id");
    const currentMutationId = this.values.get(mutationKey);
    if (
      currentMutationId !== undefined
      && currentMutationId !== mutationId
    ) {
      return 0;
    }
    this.increment(generationKey);
    this.values.delete(cacheKey);
    if (currentMutationId === undefined)
      return 2;
    this.values.delete(mutationKey);
    this.expirations.delete(mutationKey);
    return 1;
  }

  private increment(key: string) {
    this.values.set(
      key,
      String(BigInt(this.values.get(key) ?? "0") + 1n),
    );
  }

  private expireIfNeeded(key: string) {
    const expiration = this.expirations.get(key);
    if (expiration !== undefined && expiration <= this.now) {
      this.values.delete(key);
      this.expirations.delete(key);
    }
  }
}

describe("Custom SSO client runtime mutation fence", () => {
  test.each([
    ["_legacy", "_legacy"],
    ["legacy:client", "legacy%3Aclient"],
    ["中文客户端", "%E4%B8%AD%E6%96%87%E5%AE%A2%E6%88%B7%E7%AB%AF"],
    ["legacy/client", "legacy%2Fclient"],
  ])(
    "encodes Client Code %s as one stable Redis key segment",
    (clientCode, encoded) => {
      expect(customSsoClientRuntimeCacheKey(clientCode))
        .toBe(`custom-sso:client-runtime:${encoded}`);
      expect(customSsoClientRuntimeGenerationKey(clientCode))
        .toBe(`custom-sso:client-runtime-generation:${encoded}`);
      expect(customSsoClientRuntimeMutationKey(clientCode))
        .toBe(`custom-sso:client-runtime-mutation:${encoded}`);
    },
  );

  test("does not alias literal percent escapes with encoded delimiters", () => {
    expect(customSsoClientRuntimeCacheKey("legacy:client"))
      .not
      .toBe(customSsoClientRuntimeCacheKey("legacy%3Aclient"));
  });

  test("keeps the mutation fence longer than every runtime cache envelope", () => {
    expect(CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS).toBeGreaterThan(0);
    expect(CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS).toBeGreaterThan(
      CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS,
    );
    expect(CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS).toBeGreaterThan(
      CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS,
    );
  });

  test.each([
    ["an aborted transaction", null],
    [
      "a per-command error",
      [
        [new Error("INCR failed"), null],
        [null, 1],
      ],
    ],
  ])("rejects runtime invalidation for %s", async (_, result) => {
    const transaction = {
      incr() {
        return transaction;
      },
      del() {
        return transaction;
      },
      exec: mock(async () => result),
    };
    const redis = {
      multi: mock(() => transaction),
    };

    await expect(
      invalidateCustomSsoClientRuntime(redis as never, "gateway"),
    ).rejects.toBeInstanceOf(Error);
  });

  test("begin atomically blocks readers, advances generation, and deletes old cache", async () => {
    const redis = new FakeMutationRedis();
    redis.values.set(customSsoClientRuntimeCacheKey("gateway"), "stale");

    const mutation = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-1",
    });

    expect(mutation).toEqual({
      clientCode: "gateway",
      fenceTtlMs: CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS,
      mutationId: "mutation-1",
    });
    expect(redis.values.get(customSsoClientRuntimeMutationKey("gateway")))
      .toBe("mutation-1");
    expect(redis.values.get(customSsoClientRuntimeGenerationKey("gateway")))
      .toBe("1");
    expect(redis.values.has(customSsoClientRuntimeCacheKey("gateway")))
      .toBe(false);
    expect(redis.expirations.get(customSsoClientRuntimeMutationKey("gateway")))
      .toBe(redis.now + CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS);
  });

  test("complete clears only its own fence and advances generation again", async () => {
    const redis = new FakeMutationRedis();
    const mutation = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-1",
    });

    await expect(
      completeCustomSsoClientRuntimeMutation(redis, mutation),
    ).resolves.toBe("completed");
    expect(redis.values.has(customSsoClientRuntimeMutationKey("gateway")))
      .toBe(false);
    expect(redis.values.get(customSsoClientRuntimeGenerationKey("gateway")))
      .toBe("2");
  });

  test("abort clears only its own fence and preserves the aborted result", async () => {
    const redis = new FakeMutationRedis();
    const mutation = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-1",
    });
    redis.values.set(customSsoClientRuntimeCacheKey("gateway"), "stale");

    await expect(
      abortCustomSsoClientRuntimeMutation(redis, mutation),
    ).resolves.toBe("aborted");
    expect(redis.values.has(customSsoClientRuntimeMutationKey("gateway")))
      .toBe(false);
    expect(redis.values.get(customSsoClientRuntimeGenerationKey("gateway")))
      .toBe("2");
    expect(redis.values.has(customSsoClientRuntimeCacheKey("gateway")))
      .toBe(false);
  });

  test("a late complete cannot clear a newer mutation fence", async () => {
    const redis = new FakeMutationRedis();
    const first = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-1",
    });
    await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-2",
    });

    await expect(
      completeCustomSsoClientRuntimeMutation(redis, first),
    ).resolves.toBe("superseded");
    expect(redis.values.get(customSsoClientRuntimeMutationKey("gateway")))
      .toBe("mutation-2");
    expect(redis.values.get(customSsoClientRuntimeGenerationKey("gateway")))
      .toBe("2");
  });

  test("an expired owner still invalidates a stale cache refill when it finishes", async () => {
    const redis = new FakeMutationRedis();
    const mutation = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-expired",
    });
    redis.now += CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS;
    redis.values.set(
      customSsoClientRuntimeCacheKey("gateway"),
      "stale-refill",
    );

    await expect(
      completeCustomSsoClientRuntimeMutation(redis, mutation),
    ).resolves.toBe("expired");

    expect(redis.values.get(customSsoClientRuntimeGenerationKey("gateway")))
      .toBe("2");
    expect(redis.values.has(customSsoClientRuntimeCacheKey("gateway")))
      .toBe(false);
  });

  test("renews only the current mutation token with an equivalent short TTL", async () => {
    const redis = new FakeMutationRedis();
    const first = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-current",
      fenceTtlMs: 90,
    });
    redis.now += 40;

    await expect(
      renewCustomSsoClientRuntimeMutation(redis, first),
    ).resolves.toBe("renewed");
    expect(redis.expirations.get(
      customSsoClientRuntimeMutationKey("gateway"),
    )).toBe(redis.now + 90);

    await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-new",
      fenceTtlMs: 90,
    });
    await expect(
      renewCustomSsoClientRuntimeMutation(redis, first),
    ).resolves.toBe("superseded");
  });

  test("heartbeats within one third of the TTL and waits for an in-flight renewal before settle", async () => {
    const redis = new FakeMutationRedis();
    const mutation = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-heartbeat",
      fenceTtlMs: 90,
    });
    let heartbeatCallback!: () => void;
    let intervalMs = 0;
    let timerCleared = false;
    let releaseRenew!: () => void;
    let markRenewStarted!: () => void;
    const renewStarted = new Promise<void>((resolve) => {
      markRenewStarted = resolve;
    });
    redis.renewStarted = markRenewStarted;
    redis.renewGate = new Promise<void>((resolve) => {
      releaseRenew = resolve;
    });
    const heartbeat = startCustomSsoClientRuntimeMutationHeartbeat(
      redis,
      mutation,
      {
        timer: {
          setInterval(callback, interval) {
            heartbeatCallback = callback;
            intervalMs = interval;
            return "timer";
          },
          clearInterval(handle) {
            expect(handle).toBe("timer");
            timerCleared = true;
          },
        },
      },
    );
    expect(intervalMs).toBeLessThanOrEqual(30);

    heartbeatCallback();
    await renewStarted;
    const settle = mock(async () => "settled" as const);
    const settling = heartbeat.stopAndSettle(settle);
    await Promise.resolve();
    expect(timerCleared).toBe(true);
    expect(settle).not.toHaveBeenCalled();

    releaseRenew();
    await expect(settling).resolves.toBe("settled");
    expect(settle).toHaveBeenCalledTimes(1);
  });

  test("keeps ownership alive for a transaction longer than the original fence TTL", async () => {
    const redis = new FakeMutationRedis();
    const mutation = await beginCustomSsoClientRuntimeMutation(redis, {
      clientCode: "gateway",
      mutationId: "mutation-long-running",
      fenceTtlMs: 90,
    });
    let heartbeatCallback!: () => void;
    const heartbeat = startCustomSsoClientRuntimeMutationHeartbeat(
      redis,
      mutation,
      {
        timer: {
          setInterval(callback) {
            heartbeatCallback = callback;
            return "timer";
          },
          clearInterval() {},
        },
      },
    );

    for (let elapsed = 0; elapsed < 180; elapsed += 25) {
      redis.now += 25;
      heartbeatCallback();
      await heartbeat.assertOwned();
    }

    await expect(heartbeat.assertOwned()).resolves.toBeUndefined();
    await expect(
      heartbeat.stopAndSettle(async () =>
        await completeCustomSsoClientRuntimeMutation(redis, mutation)),
    ).resolves.toBe("completed");
  });
});
