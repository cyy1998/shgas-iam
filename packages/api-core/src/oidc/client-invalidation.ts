import type { Redis } from "ioredis";

export const OIDC_CLIENT_INVALIDATION_CHANNEL = "oidc:client-invalidation";
export const oidcClientRuntimeCacheKey = (clientCode: string) => `oidc:client-runtime:${clientCode}`;

export interface OidcClientInvalidationEvent {
  clientId: number;
  clientCode: string;
  oidcConfigVersion: number;
}

export async function invalidateOidcClient(redis: Redis, event: OidcClientInvalidationEvent) {
  await redis.del(oidcClientRuntimeCacheKey(event.clientCode));
  await redis.publish(OIDC_CLIENT_INVALIDATION_CHANNEL, JSON.stringify(event));
}
