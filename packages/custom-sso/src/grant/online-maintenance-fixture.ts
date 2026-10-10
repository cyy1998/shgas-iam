import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { createCustomSsoState, randomHandle } from "../unified/state";
import { createCustomSsoTokenState, tokenDigest } from "../unified/token-state";
/** Public test-support owns protocol serialization, keys and explicit offline fault variants. */
export function createCustomSsoMaintenanceTestFixture(
  redis: Redis,
  namespace: string,
  trackKey: (key: string) => void,
) {
  const prefix = `${namespace}:custom-sso:v1:`;
  const state = createCustomSsoState(redis, namespace);
  const tokens = createCustomSsoTokenState(redis, namespace);
  function owned(key: string) {
    trackKey(key);
    return key;
  }
  async function seedContinuation(clientCode: string) {
    const handle = await state.saveContinuation(
      {
        clientCode,
        callbackEndpoint: "https://client.example/callback",
        redirectUrl: "https://client.example/",
        redeemer: "business",
      },
      "browser",
      120,
    );
    return owned(`${prefix}continuation:${tokenDigest(handle)}`);
  }
  return {
    async seedVersionedKeys() {
      const keys = [
        owned(`${namespace}:custom-sso:v0:legacy:${randomUUID()}`),
        owned(`${namespace}:custom-sso:v2:future:${randomUUID()}`),
        owned(`${namespace}:custom-sso:unversioned:${randomUUID()}`),
        owned(`${namespace}:custom-sso:v9:queue:${randomUUID()}`),
        owned(`${namespace}:custom-sso:v3:members:${randomUUID()}`),
        owned(`${namespace}:custom-sso:v4:events:${randomUUID()}`),
      ];
      await redis.set(keys[0]!, "{malformed");
      await redis.hset(keys[1]!, "field", "arbitrary");
      await redis.zadd(keys[2]!, 1, "non-uuid");
      await redis.rpush(keys[3]!, "arbitrary");
      await redis.sadd(keys[4]!, "arbitrary");
      await redis.xadd(keys[5]!, "*", "field", "arbitrary");
      return keys;
    },
    seedContinuation,
    async seedUnified(clientCode = "alpha") {
      try {
        const identity = {
          userSessionId: randomUUID(),
          clientSessionId: randomUUID(),
          userSessionInstance: randomUUID(),
          clientSessionInstance: randomUUID(),
          issuedAt: Date.now(),
          expiresAt: Date.now() + 120000,
        };
        const bearer = randomHandle();
        const token = {
          ...identity,
          version: 1 as const,
          protocol: "custom_sso" as const,
          purpose: "business" as const,
          tokenId: randomUUID(),
          clientCode,
        };
        await tokens.save(bearer, token);
        await redis.del(`${prefix}token-id:${token.tokenId}`);
        const orphanBearer = randomHandle();
        await tokens.save(orphanBearer, { ...token, tokenId: randomUUID() });
        await redis.del(`${prefix}token:${tokenDigest(orphanBearer)}`);
        await state.saveCode({
          ...identity,
          version: 1,
          protocol: "custom_sso",
          codeId: randomHandle(),
          clientCode,
          callbackEndpoint: "https://client.example/callback",
          redirectUrl: "https://client.example/",
          redeemer: "business",
        });
        await seedContinuation(clientCode);
        const keys = await redis.keys(`${prefix}*`);
        for (const key of keys) await redis.persist(key);
        return keys;
      } finally {
        (await redis.keys(`${prefix}*`)).forEach(owned);
      }
    },
    async seedCorruptUnified() {
      const key = owned(`${prefix}code:${tokenDigest(randomHandle())}`);
      await redis.set(key, JSON.stringify({ version: 99, sensitive: "sensitive-fixture" }), "PX", 120000);
      return key;
    },
    async seedUnknownUnifiedFamily() {
      const key = owned(`${prefix}unknown:${randomUUID()}`);
      await redis.set(key, "unknown owner record", "PX", 120000);
      return key;
    },
  };
}
