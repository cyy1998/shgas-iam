import type { GlobalSessionEnvelope } from "@iam/contracts";
import type { Redis } from "ioredis";
import type { z } from "zod";
import { GLOBAL_SESSION_VERSION } from "@iam/contracts";
import { z as zod } from "zod";
import { AuthzUnauthorizedError } from "../errors/AuthzUnauthorizedError";
import { reviveIsoDates } from "../utils/common";

export * as kernel from "./kernel";

export interface LocalSessionReference {
  clientCode: string;
  localSessionId: string;
  mode: string;
}

export interface SessionLogger {
  warn: (data: Record<string, unknown>, message: string) => void;
}

export const globalSessionKey = (sessionId: string) => `global_session:${sessionId}`;
export function localSessionKey(clientCode: string, localSessionId: string) {
  return `local_${clientCode}_session:${localSessionId}`;
}
export const localSessionReverseKey = (localSessionId: string) => `local_session_reverse:${localSessionId}`;
export const localSessionSetKey = (globalSessionId: string) => `local_session_set:${globalSessionId}`;

export function localSessionMember(reference: LocalSessionReference) {
  return JSON.stringify(reference);
}

export function createGlobalSessionEnvelopeSchema<TUser extends z.ZodTypeAny>(userSchema: TUser) {
  return zod.object({
    version: zod.literal(GLOBAL_SESSION_VERSION),
    authTime: zod.number().int().nonnegative(),
    user: userSchema,
  });
}

async function bestEffortDelete(redis: Redis, keys: string[], logger?: SessionLogger) {
  await Promise.all(keys.map(async (key) => {
    try {
      await redis.del(key);
    }
    catch (error) {
      logger?.warn({ err: error, key }, "failed to clean stale session key");
    }
  }));
}

export async function readGlobalSession<TUser>(
  redis: Redis,
  sessionId: string,
  userSchema: z.ZodType<TUser>,
  logger?: SessionLogger,
): Promise<GlobalSessionEnvelope<TUser> | null> {
  const key = globalSessionKey(sessionId);
  const value = await redis.get(key);
  if (value === null)
    return null;

  const result = createGlobalSessionEnvelopeSchema(userSchema).safeParse(JSON.parse(value, reviveIsoDates));
  if (result.success)
    return result.data;

  await bestEffortDelete(redis, [key], logger);
  logger?.warn({ sessionId, issues: result.error.issues }, "invalid global session envelope");
  return null;
}

export async function writeGlobalSession<TUser>(
  redis: Redis,
  sessionId: string,
  envelope: GlobalSessionEnvelope<TUser>,
  ttlSeconds: number,
) {
  await redis.set(globalSessionKey(sessionId), JSON.stringify(envelope), "EX", ttlSeconds);
}

export async function createGlobalSession<TUser>(redis: Redis, user: TUser, ttlSeconds: number) {
  const sessionId = crypto.randomUUID();
  const envelope: GlobalSessionEnvelope<TUser> = {
    version: GLOBAL_SESSION_VERSION,
    authTime: Math.floor(Date.now() / 1000),
    user,
  };
  await writeGlobalSession(redis, sessionId, envelope, ttlSeconds);
  return { sessionId, envelope };
}

export async function replaceGlobalSessionUser<TUser>(
  redis: Redis,
  sessionId: string,
  user: TUser,
  userSchema: z.ZodType<TUser>,
  ttlSeconds: number,
  logger?: SessionLogger,
) {
  const envelope = await readGlobalSession(redis, sessionId, userSchema, logger);
  if (envelope === null)
    return false;
  await writeGlobalSession(redis, sessionId, { ...envelope, user }, ttlSeconds);
  return true;
}

export async function getActiveGlobalSessionTtl(redis: Redis, globalSessionId: string) {
  const ttl = await redis.ttl(globalSessionKey(globalSessionId));
  if (ttl <= 0)
    throw new AuthzUnauthorizedError("全局session不存在或已过期");
  return ttl;
}

export async function listLocalSessions<TReference extends LocalSessionReference>(
  redis: Redis,
  globalSessionId: string,
  referenceSchema: z.ZodType<TReference>,
  logger?: SessionLogger,
) {
  const now = Date.now();
  const setKey = localSessionSetKey(globalSessionId);
  await redis.zremrangebyscore(setKey, "-inf", now);
  const members = await redis.zrange(setKey, 0, -1);
  const references: TReference[] = [];

  await Promise.all(members.map(async (member) => {
    const result = referenceSchema.safeParse(JSON.parse(member, reviveIsoDates));
    if (result.success) {
      references.push(result.data);
      return;
    }
    logger?.warn({ globalSessionId, member, issues: result.error.issues }, "invalid local session set member");
    await redis.zrem(setKey, member);
  }));

  return references;
}

export async function writeLocalSession(
  redis: Redis,
  globalSessionId: string,
  reference: LocalSessionReference,
  user: unknown,
  logger?: SessionLogger,
) {
  const ttl = await getActiveGlobalSessionTtl(redis, globalSessionId);
  const localKey = localSessionKey(reference.clientCode, reference.localSessionId);
  const reverseKey = localSessionReverseKey(reference.localSessionId);
  const setKey = localSessionSetKey(globalSessionId);
  const result = await redis.multi()
    .set(localKey, JSON.stringify(user), "EX", ttl)
    .set(reverseKey, globalSessionId, "EX", ttl)
    .zadd(setKey, Date.now() + ttl * 1000, localSessionMember(reference))
    .expire(setKey, ttl)
    .exec();

  if (!result)
    throw new AuthzUnauthorizedError("局部session创建失败");
  const failed = result.find(([error]) => error !== null);
  if (failed?.[0]) {
    await bestEffortDelete(redis, [localKey, reverseKey], logger);
    throw failed[0];
  }
  return ttl;
}

export async function getGlobalSessionIdByLocalSession(redis: Redis, localSessionId: string) {
  return await redis.get(localSessionReverseKey(localSessionId));
}

async function removeMatchingLocalSessionMembers(redis: Redis, globalSessionId: string, localSessionId: string) {
  const setKey = localSessionSetKey(globalSessionId);
  const members = await redis.zrange(setKey, 0, -1);
  await Promise.all(members.map(async (member) => {
    try {
      const reference = JSON.parse(member) as Partial<LocalSessionReference>;
      if (reference.localSessionId === localSessionId)
        await redis.zrem(setKey, member);
    }
    catch {
      await redis.zrem(setKey, member);
    }
  }));
}

export async function readValidatedLocalSessionUser<TUser>(
  redis: Redis,
  clientCode: string,
  localSessionId: string,
  userSchema: z.ZodType<TUser>,
  logger?: SessionLogger,
) {
  const localKey = localSessionKey(clientCode, localSessionId);
  const reverseKey = localSessionReverseKey(localSessionId);
  const userString = await redis.get(localKey);
  if (userString === null)
    return null;

  const globalSessionId = await redis.get(reverseKey);
  if (globalSessionId === null) {
    await bestEffortDelete(redis, [localKey, reverseKey], logger);
    return null;
  }

  const envelope = await readGlobalSession(redis, globalSessionId, userSchema, logger);
  if (envelope === null) {
    await bestEffortDelete(redis, [localKey, reverseKey], logger);
    await removeMatchingLocalSessionMembers(redis, globalSessionId, localSessionId);
    return null;
  }

  const userResult = userSchema.safeParse(JSON.parse(userString, reviveIsoDates));
  if (userResult.success)
    return userResult.data;

  await bestEffortDelete(redis, [localKey, reverseKey], logger);
  await removeMatchingLocalSessionMembers(redis, globalSessionId, localSessionId);
  return null;
}

export async function renewGlobalSession<TReference extends LocalSessionReference>(
  redis: Redis,
  globalSessionId: string,
  ttlSeconds: number,
  referenceSchema: z.ZodType<TReference>,
  logger?: SessionLogger,
) {
  if (await redis.exists(globalSessionKey(globalSessionId)) === 0)
    return false;
  const references = await listLocalSessions(redis, globalSessionId, referenceSchema, logger);
  const transaction = redis.multi().expire(globalSessionKey(globalSessionId), ttlSeconds);
  const setKey = localSessionSetKey(globalSessionId);

  for (const reference of references) {
    transaction
      .expire(localSessionKey(reference.clientCode, reference.localSessionId), ttlSeconds)
      .expire(localSessionReverseKey(reference.localSessionId), ttlSeconds)
      .zadd(setKey, Date.now() + ttlSeconds * 1000, localSessionMember(reference));
  }
  if (references.length > 0)
    transaction.expire(setKey, ttlSeconds);
  await transaction.exec();
  return true;
}

export async function removeLocalSession(
  redis: Redis,
  reference: LocalSessionReference,
  globalSessionId?: string | null,
) {
  const resolvedGlobalSessionId = globalSessionId
    ?? await getGlobalSessionIdByLocalSession(redis, reference.localSessionId);
  const transaction = redis.multi()
    .del(localSessionKey(reference.clientCode, reference.localSessionId))
    .del(localSessionReverseKey(reference.localSessionId));
  if (resolvedGlobalSessionId) {
    transaction.zrem(localSessionSetKey(resolvedGlobalSessionId), localSessionMember(reference));
  }
  await transaction.exec();
}

export async function removeGlobalSession(redis: Redis, globalSessionId: string) {
  const setKey = localSessionSetKey(globalSessionId);
  const members = await redis.zrange(setKey, 0, -1);
  const transaction = redis.multi().del(globalSessionKey(globalSessionId)).del(setKey);

  for (const member of members) {
    try {
      const reference = JSON.parse(member) as Partial<LocalSessionReference>;
      if (typeof reference.clientCode === "string" && typeof reference.localSessionId === "string") {
        transaction
          .del(localSessionKey(reference.clientCode, reference.localSessionId))
          .del(localSessionReverseKey(reference.localSessionId));
      }
    }
    catch {
      // The set itself is deleted below, so malformed members need no separate cleanup.
    }
  }
  await transaction.exec();
}
