import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
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
    seedContinuation,
    async seedAuthorizationPreservation(clientCode = "alpha") {
      const identity = {
        userSessionId: randomUUID(),
        clientSessionId: randomUUID(),
        userSessionInstance: randomUUID(),
        clientSessionInstance: randomUUID(),
        issuedAt: Date.now(),
        expiresAt: Date.now() + 600000,
      };
      const retained: string[] = [];
      const authorization: string[] = [];
      for (const purpose of ["managed", "business"] as const) {
        const bearer = randomHandle();
        const tokenId = randomUUID();
        await tokens.save(bearer, { ...identity, version: 1, protocol: "custom_sso", purpose, tokenId, clientCode });
        retained.push(owned(`${prefix}token:${tokenDigest(bearer)}`), owned(`${prefix}token-id:${tokenId}`));
        const codeId = randomHandle();
        await state.saveCode({ ...identity, version: 1, protocol: "custom_sso", codeId, clientCode, callbackEndpoint: "https://client.example/callback", redirectUrl: "https://client.example/", redeemer: purpose });
        authorization.push(owned(`${prefix}code:${tokenDigest(JSON.stringify([clientCode, identity.userSessionId, identity.clientSessionId, codeId]))}`));
      }
      const orphan = randomUUID();
      const orphanBearer = randomHandle();
      await tokens.save(orphanBearer, { ...identity, version: 1, protocol: "custom_sso", purpose: "managed", tokenId: orphan, clientCode });
      await redis.del(`${prefix}token:${tokenDigest(orphanBearer)}`);
      retained.push(owned(`${prefix}token-id:${orphan}`));
      authorization.push(await seedContinuation(clientCode));
      return { retained, authorization };
    },
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
    async seedUnknownUnifiedFamily() {
      const key = owned(`${prefix}unknown:${randomUUID()}`);
      await redis.set(key, "unknown owner record", "PX", 120000);
      return key;
    },
  };
}
