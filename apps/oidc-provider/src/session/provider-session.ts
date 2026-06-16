import type { Redis } from "ioredis";
import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import { globalSessionKey } from "@iam/api-core/session";
import { z } from "zod";

const ProviderSessionBindingSchema = z.object({
  globalSessionId: z.string().min(1),
  userId: z.number().int().positive(),
  accountId: z.string().uuid(),
  authTime: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export type ProviderSessionBinding = z.infer<typeof ProviderSessionBindingSchema>;

const PENDING_PROVIDER_SESSION_BINDING_TTL_SECONDS = 60;

export function providerSessionBindingKey(sessionUid: string) {
  return `oidc:provider-session-binding:${sessionUid}`;
}

function pendingProviderSessionBindingKey(accountId: string) {
  return `oidc:pending-provider-session-binding:${accountId}`;
}

export async function bindProviderSession(
  redis: Redis,
  sessionUid: string,
  session: ResolvedGlobalSession,
) {
  const ttl = await redis.ttl(globalSessionKey(session.sessionId));
  if (ttl <= 0)
    return null;
  const binding: ProviderSessionBinding = {
    globalSessionId: session.sessionId,
    userId: session.userId,
    accountId: session.accountId,
    authTime: session.authTime,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  await redis.set(providerSessionBindingKey(sessionUid), JSON.stringify(binding), "EX", ttl);
  return binding;
}

export async function stageProviderSessionBinding(
  redis: Redis,
  session: ResolvedGlobalSession,
) {
  const ttl = await redis.ttl(globalSessionKey(session.sessionId));
  if (ttl <= 0)
    return null;
  const binding: ProviderSessionBinding = {
    globalSessionId: session.sessionId,
    userId: session.userId,
    accountId: session.accountId,
    authTime: session.authTime,
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
) {
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
  });
}

export async function readProviderSessionBinding(redis: Redis, sessionUid: string) {
  const value = await redis.get(providerSessionBindingKey(sessionUid));
  if (!value)
    return null;
  let json: unknown;
  try {
    json = JSON.parse(value);
  }
  catch {
    await redis.del(providerSessionBindingKey(sessionUid));
    return null;
  }
  const parsed = ProviderSessionBindingSchema.safeParse(json);
  if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) {
    await redis.del(providerSessionBindingKey(sessionUid));
    return null;
  }
  return parsed.data;
}
