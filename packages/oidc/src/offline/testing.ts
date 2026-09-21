import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { createOidcLogoutState } from "../logout-state";
import { createOidcState, digest, randomHandle, statePrefix } from "../state";
import { createOidcTokenState } from "../token-state";

/** Current protocol fixtures stay with their persistence owner. */
export function createOidcMaintenanceTestFixture(
  redis: Redis,
  namespace: string,
  trackKey: (key: string) => void,
) {
  const prefix = statePrefix(namespace);
  const state = createOidcState(redis, namespace);
  const tokens = createOidcTokenState(redis, namespace);
  const logout = createOidcLogoutState(redis, namespace);
  function owned(key: string) {
    trackKey(key);
    return key;
  }
  return {
    async seedUnified(clientId = "alpha") {
      try {
        const identity = {
          userSessionId: randomUUID(),
          clientSessionId: randomUUID(),
          userSessionInstance: randomUUID(),
          clientSessionInstance: randomUUID(),
          issuedAt: Date.now(),
          expiresAt: Date.now() + 120000,
        };
        const bearer = `oa_${randomHandle()}`;
        const token = {
          issuer: "https://iam.example/oidc",
          ...identity,
          version: 1 as const,
          purpose: "oidc_access" as const,
          id: randomUUID(),
          digest: digest(bearer),
          clientId,
          scope: "openid",
        };
        await tokens.save(bearer, token);
        await redis.del(`${prefix}token-id:${token.id}`);
        const orphanBearer = `oa_${randomHandle()}`;
        await tokens.save(orphanBearer, { ...token, id: randomUUID(), digest: digest(orphanBearer) });
        await redis.del(`${prefix}token:${digest(orphanBearer)}`);
        const authorization = {
          issuer: "https://iam.example/oidc",
          clientId,
          redirectUri: "https://client.example/cb",
          scope: "openid",
          state: "state",
          responseMode: "query" as const,
          codeChallenge: "a".repeat(43),
          codeChallengeMethod: "S256" as const,
          prompt: "",
        };
        await state.saveCode({
          ...identity,
          ...authorization,
          version: 1,
          protocol: "oidc",
          codeId: randomHandle(),
        });
        await state.saveContinuation({ authorization, completionDigest: null }, "browser", 120);
        await logout.save({ issuer: "https://iam.example/oidc", clientId, hint: null, redirectUri: null, state: null }, "browser", 120);
        const keys = await redis.keys(`${prefix}*`);
        for (const key of keys) await redis.persist(key);
        return keys;
      }
      finally {
        (await redis.keys(`${prefix}*`)).forEach(owned);
      }
    },
    async seedUnknownUnifiedFamily() {
      const key = owned(`${prefix}future:${randomUUID()}`);
      await redis.set(key, "sensitive-fixture", "PX", 120000);
      return key;
    },
    async seedMalformedToken() {
      const key = owned(`${prefix}token:${digest(randomHandle())}`);
      await redis.set(key, "sensitive-fixture");
      return key;
    },
  };
}
