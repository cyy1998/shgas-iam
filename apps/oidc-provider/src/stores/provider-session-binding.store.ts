import type { Redis } from "ioredis";
import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import type { ProviderSessionBinding } from "../session/provider-session.ts";
import { globalSessionKey } from "@iam/api-core/session";
import {
  PENDING_PROVIDER_SESSION_BINDING_TTL_SECONDS,
  pendingProviderSessionBindingKey,
  providerSessionBindingKey,
  ProviderSessionBindingSchema,
} from "../session/provider-session.ts";

export function createProviderSessionBindingStore(redis: Redis) {
  return {
    bind(sessionUid: string, session: ResolvedGlobalSession, context = { oidcConfigVersion: 0 }) {
      return bindProviderSession(redis, sessionUid, session, context);
    },
    stage(session: ResolvedGlobalSession, context = { oidcConfigVersion: 0 }) {
      return stageProviderSessionBinding(redis, session, context);
    },
    consumeStaged(accountId: string, sessionUid: string) {
      return consumeStagedProviderSessionBinding(redis, accountId, sessionUid);
    },
    read(sessionUid: string) {
      return readProviderSessionBinding(redis, sessionUid);
    },
  };
}

export type ProviderSessionBindingStore = ReturnType<typeof createProviderSessionBindingStore>;

export async function bindProviderSession(
  redis: Redis,
  sessionUid: string,
  session: ResolvedGlobalSession,
  context: { oidcConfigVersion: number } = { oidcConfigVersion: 0 },
): Promise<ProviderSessionBinding | null> {
  const ttl = await redis.ttl(globalSessionKey(session.sessionId));
  if (ttl <= 0)
    return null;
  const binding: ProviderSessionBinding = {
    globalSessionId: session.sessionId,
    principalSessionId: session.sessionId,
    bindingId: `legacy:${sessionUid}`,
    userId: session.userId,
    accountId: session.accountId,
    authTime: session.authTime,
    oidcConfigVersion: context.oidcConfigVersion,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  await redis.set(providerSessionBindingKey(sessionUid), JSON.stringify(binding), "EX", ttl);
  return binding;
}

export async function stageProviderSessionBinding(
  redis: Redis,
  session: ResolvedGlobalSession,
  context: { oidcConfigVersion: number } = { oidcConfigVersion: 0 },
): Promise<ProviderSessionBinding | null> {
  const ttl = await redis.ttl(globalSessionKey(session.sessionId));
  if (ttl <= 0)
    return null;
  const binding: ProviderSessionBinding = {
    globalSessionId: session.sessionId,
    principalSessionId: session.sessionId,
    bindingId: "legacy:pending",
    userId: session.userId,
    accountId: session.accountId,
    authTime: session.authTime,
    oidcConfigVersion: context.oidcConfigVersion,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  await redis.set(
    pendingProviderSessionBindingKey(session.accountId),
    JSON.stringify(binding),
    "EX",
    Math.min(ttl, PENDING_PROVIDER_SESSION_BINDING_TTL_SECONDS),
  );
  return binding;
}

export async function consumeStagedProviderSessionBinding(
  redis: Redis,
  accountId: string,
  sessionUid: string,
): Promise<ProviderSessionBinding | null> {
  const key = pendingProviderSessionBindingKey(accountId);
  const value = await redis.get(key);
  if (!value)
    return null;
  await redis.del(key);
  let json: unknown;
  try {
    json = JSON.parse(value);
  }
  catch {
    return null;
  }
  const parsed = ProviderSessionBindingSchema.safeParse(json);
  if (!parsed.success
    || parsed.data.accountId !== accountId
    || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return await bindProviderSession(redis, sessionUid, {
    sessionId: parsed.data.globalSessionId,
    userId: parsed.data.userId,
    accountId: parsed.data.accountId,
    authTime: parsed.data.authTime,
  }, {
    oidcConfigVersion: parsed.data.oidcConfigVersion,
  });
}

export async function readProviderSessionBinding(redis: Redis, sessionUid: string) {
  const key = providerSessionBindingKey(sessionUid);
  const value = await redis.get(key);
  if (!value)
    return null;
  let json: unknown;
  try {
    json = JSON.parse(value);
  }
  catch {
    await redis.del(key);
    return null;
  }
  const parsed = ProviderSessionBindingSchema.safeParse(json);
  if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) {
    await redis.del(key);
    return null;
  }
  return parsed.data;
}
