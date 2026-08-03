import {
  customSsoClientRuntimeCacheKey,
  customSsoClientRuntimeGenerationKey,
  customSsoClientRuntimeMutationKey,
} from "@iam/api-core/custom-sso";
import { describe, expect, mock, test } from "bun:test";
import { createAdminClientCache } from "../client-cache";

function createRedisDouble() {
  const transactions: Array<Array<readonly [string, string]>> = [];
  const del = mock(async (..._keys: string[]) => 1);
  const evalScript = mock(async (..._args: unknown[]) => 1);
  const multi = mock(() => {
    const commands: Array<readonly [string, string]> = [];
    const transaction = {
      incr(key: string) {
        commands.push(["incr", key]);
        return transaction;
      },
      del(key: string) {
        commands.push(["del", key]);
        return transaction;
      },
      async exec() {
        transactions.push(commands);
        return commands.map(() => [null, 1]);
      },
    };
    return transaction;
  });
  return {
    redis: { del, eval: evalScript, multi },
    del,
    evalScript,
    multi,
    transactions,
  };
}

describe("Admin API client cache composition", () => {
  test("invalidates the generic and generation-fenced Custom SSO runtime caches", async () => {
    const fake = createRedisDouble();
    const cache = createAdminClientCache({ redis: fake.redis as never });

    await cache.invalidateClient({
      clientCode: "gateway",
      clientSecret: "generic-secret",
    });

    expect(fake.del.mock.calls).toEqual([
      ["cache:client:code:gateway"],
      ["cache:client:secret:generic-secret"],
    ]);
    expect(fake.transactions).toEqual([[
      ["incr", customSsoClientRuntimeGenerationKey("gateway")],
      ["del", customSsoClientRuntimeCacheKey("gateway")],
    ]]);
  });

  test("invalidates both old and new runtime cache identities on a client update", async () => {
    const fake = createRedisDouble();
    const cache = createAdminClientCache({ redis: fake.redis as never });

    await cache.invalidateUpdatedClient(
      {
        clientCode: "before",
        clientSecret: "before-secret",
      },
      {
        clientCode: "after",
        clientSecret: "after-secret",
      },
    );

    expect(fake.transactions).toEqual([
      [
        ["incr", customSsoClientRuntimeGenerationKey("before")],
        ["del", customSsoClientRuntimeCacheKey("before")],
      ],
      [
        ["incr", customSsoClientRuntimeGenerationKey("after")],
        ["del", customSsoClientRuntimeCacheKey("after")],
      ],
    ]);
  });

  test("composes the runtime mutation fence without loading a Redis singleton", async () => {
    const fake = createRedisDouble();
    const cache = createAdminClientCache({ redis: fake.redis as never });

    const mutation = await cache.beginRuntimeMutation(
      "gateway",
      "mutation-1",
    );
    const completion = await cache.completeRuntimeMutation(mutation);

    expect(mutation).toEqual({
      clientCode: "gateway",
      fenceTtlMs: 120_000,
      mutationId: "mutation-1",
    });
    expect(completion).toBe("completed");
    expect(fake.evalScript.mock.calls).toHaveLength(2);
    expect(fake.evalScript.mock.calls[0]?.slice(1)).toEqual([
      3,
      customSsoClientRuntimeMutationKey("gateway"),
      customSsoClientRuntimeGenerationKey("gateway"),
      customSsoClientRuntimeCacheKey("gateway"),
      "mutation-1",
      "120000",
    ]);
    expect(fake.evalScript.mock.calls[1]?.slice(1)).toEqual([
      3,
      customSsoClientRuntimeMutationKey("gateway"),
      customSsoClientRuntimeGenerationKey("gateway"),
      customSsoClientRuntimeCacheKey("gateway"),
      "mutation-1",
    ]);
  });
});
