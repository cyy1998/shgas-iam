import type { Redis } from "ioredis";

export function createOidcTokenStore(redis: Redis) {
  return {
    async revokeAccessToken(tokenKey: string) {
      await redis.del(tokenKey, tokenKey.replace("oidc:model:", "oidc:consumed:"));
    },
  };
}

export type OidcTokenStore = ReturnType<typeof createOidcTokenStore>;
