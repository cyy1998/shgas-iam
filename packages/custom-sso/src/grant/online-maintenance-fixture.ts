import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { createCustomSsoState, randomHandle } from "../unified/state";
import { createCustomSsoTokenState, tokenDigest } from "../unified/token-state";
import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./redis-store";
import { createLegacyAuthorizationGrantFixture } from "./testing";

/** Public test-support owns protocol serialization, keys and explicit offline fault variants. */
export function createCustomSsoMaintenanceTestFixture(
  redis: Redis,
  namespace: string,
  trackKey: (key: string) => void,
) {
  const prefix = `${namespace}:custom-sso:v1:`;
  const state = createCustomSsoState(redis, namespace);
  const tokens = createCustomSsoTokenState(redis, namespace);
  const legacy = createLegacyAuthorizationGrantFixture({ redis, trackKey });
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
      }
      finally {
        (await redis.keys(`${prefix}*`)).forEach(owned);
      }
    },
    async seedCorruptUnified() {
      const key = owned(`${prefix}code:${tokenDigest(randomHandle())}`);
      await redis.set(key, JSON.stringify({ version: 99, sensitive: "sensitive-fixture" }), "PX", 120000);
      return key;
    },
    async seedSource() {
      const keys: string[] = [];
      for (const state of ["issued", "redeeming", "consumed"] as const) {
        const grantId = randomUUID();
        const common = { version: 1 as const, grantId, expiresAt: Date.now() + 120000 };
        await legacy.initialize(
          state === "redeeming"
            ? { ...common, state, attemptId: randomUUID(), leaseExpiresAt: Date.now() + 5000 }
            : { ...common, state },
        );
        const key = `${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${grantId}`;
        await redis.persist(key);
        keys.push(key);
      }
      return keys;
    },
    async seedCorruptSource() {
      const key = owned(`${AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX}${randomUUID()}`);
      await redis.set(key, "sensitive-fixture");
      return key;
    },
  };
}
