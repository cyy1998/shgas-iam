import type { Redis } from "ioredis";

export const oidcUserTokenIndexKey = (userId: number) => `oidc:user-tokens:${userId}`;
export const oidcClientTokenIndexKey = (clientId: string) => `oidc:client-tokens:${clientId}`;
export function oidcGlobalSessionTokenIndexKey(globalSessionId: string) {
  return `oidc:global-session-tokens:${globalSessionId}`;
}

export type OidcAccessTokenIndexMetadata = {
  tokenKey: string;
  userId: number;
  clientId: string;
  globalSessionId: string;
  expiresAt: number;
};

const REGISTER_TOKEN_INDEX_SCRIPT = `
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[2])
local latest = redis.call("ZRANGE", KEYS[1], -1, -1, "WITHSCORES")
if latest[2] then redis.call("PEXPIREAT", KEYS[1], math.ceil(tonumber(latest[2]))) end
return 1
`;

function indexKeys(metadata: Pick<OidcAccessTokenIndexMetadata, "userId" | "clientId" | "globalSessionId">) {
  return [
    oidcUserTokenIndexKey(metadata.userId),
    oidcClientTokenIndexKey(metadata.clientId),
    oidcGlobalSessionTokenIndexKey(metadata.globalSessionId),
  ];
}

export async function registerOidcAccessToken(redis: Redis, metadata: OidcAccessTokenIndexMetadata) {
  await Promise.all(indexKeys(metadata).map(async key => await redis.eval(
    REGISTER_TOKEN_INDEX_SCRIPT,
    1,
    key,
    metadata.expiresAt,
    metadata.tokenKey,
  )));
}

async function removeTokenFromIndexes(redis: Redis, tokenKey: string, serialized: string | null) {
  if (!serialized)
    return;
  try {
    const payload = JSON.parse(serialized) as {
      clientId?: string;
      extra?: { userId?: number; globalSessionId?: string };
      userId?: number;
      globalSessionId?: string;
    };
    const userId = payload.userId ?? payload.extra?.userId;
    const globalSessionId = payload.globalSessionId ?? payload.extra?.globalSessionId;
    if (typeof userId !== "number" || typeof payload.clientId !== "string" || typeof globalSessionId !== "string")
      return;
    const transaction = redis.multi();
    for (const key of indexKeys({ userId, clientId: payload.clientId, globalSessionId }))
      transaction.zrem(key, tokenKey);
    await transaction.exec();
  }
  catch {
    // The token is being revoked anyway; malformed stale metadata must not block cleanup.
  }
}

export async function revokeOidcAccessToken(redis: Redis, tokenKey: string) {
  const serialized = await redis.get(tokenKey);
  await redis.del(tokenKey, tokenKey.replace("oidc:model:", "oidc:consumed:"));
  await removeTokenFromIndexes(redis, tokenKey, serialized);
}

async function revokeByIndex(redis: Redis, indexKey: string) {
  await redis.zremrangebyscore(indexKey, "-inf", Date.now());
  const tokenKeys = await redis.zrange(indexKey, 0, -1);
  for (const tokenKey of tokenKeys)
    await revokeOidcAccessToken(redis, tokenKey);
  await redis.del(indexKey);
  return tokenKeys.length;
}

export async function revokeOidcAccessTokensForUser(redis: Redis, userId: number) {
  return await revokeByIndex(redis, oidcUserTokenIndexKey(userId));
}

export async function revokeOidcAccessTokensForClient(redis: Redis, clientId: string) {
  return await revokeByIndex(redis, oidcClientTokenIndexKey(clientId));
}

export async function revokeOidcAccessTokensForGlobalSession(redis: Redis, globalSessionId: string) {
  return await revokeByIndex(redis, oidcGlobalSessionTokenIndexKey(globalSessionId));
}
