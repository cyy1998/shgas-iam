import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { codeRecordSchema, continuationSchema, createCustomSsoState, randomHandle } from "../unified/state";
import { createCustomSsoTokenState, tokenDigest, tokenRecordSchema } from "../unified/token-state";
import { AUTHORIZATION_GRANT_REDEMPTION_KEY_PREFIX } from "./redis-store";
import { createLegacyAuthorizationGrantFixture } from "./testing";

/** Read-only test observation, independent of maintenance selection/CAS. Never supplies mutation instructions. */
export async function observeCustomSsoAuthorizationUpgrade(
  redis: Pick<Redis, "keys" | "get">,
  namespace: string,
  clientCode: string,
) {
  const prefix = `${namespace}:custom-sso:v1:`;
  const authorizationKeys: string[] = [];
  const tokenKeys: string[] = [];
  const tokenIndexKeys: string[] = [];
  for (const key of await redis.keys(`${prefix}*`)) {
    if (key.startsWith(`${prefix}token-id:`)) {
      // An orphan has no trustworthy Client attribution. Observe every reverse index for preservation.
      tokenIndexKeys.push(key);
      continue;
    }
    const schema = key.startsWith(`${prefix}code:`)
      ? codeRecordSchema
      : key.startsWith(`${prefix}continuation:`)
        ? continuationSchema
        : key.startsWith(`${prefix}token:`) ? tokenRecordSchema : undefined;
    if (!schema)
      continue;
    const raw = await redis.get(key);
    if (raw === null)
      continue;
    if (schema.parse(JSON.parse(raw)).clientCode !== clientCode)
      continue;
    (schema === tokenRecordSchema ? tokenKeys : authorizationKeys).push(key);
  }
  return { authorizationKeys, tokenKeys, tokenIndexKeys };
}

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
