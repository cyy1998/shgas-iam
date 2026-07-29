import type {
  ClearLoginStateAtomicResult,
  ListLoginRestrictionsAtomicResult,
  LoginRestrictionAtomicState,
  LoginRestrictionAtomicStorePort,
  RecordLoginFailureAtomicResult,
} from "./login-restriction";
import {
  LOGIN_FAILURE_THRESHOLD,
  LOGIN_FAILURE_WINDOW_SECONDS,
  LOGIN_RESTRICTION_DURATION_SECONDS,
} from "./login-restriction";

const RECORD_FAILURE_SCRIPT = `-- login-restriction:record-failure
local failureKey = KEYS[1]
local restrictionKey = KEYS[2]
local restrictionIndexKey = KEYS[3]
local failureMember = ARGV[1]
local failureWindowSeconds = tonumber(ARGV[2])
local restrictionDurationMs = tonumber(ARGV[3])
local threshold = tonumber(ARGV[4])
local userId = ARGV[5]
local triggerMethod = ARGV[6]
local redisTime = redis.call("TIME")
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local windowStart = now - failureWindowSeconds * 1000

redis.call("ZREMRANGEBYSCORE", failureKey, "-inf", windowStart)
redis.call("ZADD", failureKey, now, failureMember)
local failureCount = redis.call("ZCARD", failureKey)
redis.call("EXPIRE", failureKey, failureWindowSeconds)

local newlyRestricted = 0
local storedTriggerMethod = redis.call("GET", restrictionKey)
local restrictionTtlMs = redis.call("PTTL", restrictionKey)

if failureCount >= threshold then
  if not storedTriggerMethod or restrictionTtlMs <= 0 then
    redis.call("SET", restrictionKey, triggerMethod, "PX", restrictionDurationMs)
    storedTriggerMethod = triggerMethod
    restrictionTtlMs = restrictionDurationMs
    newlyRestricted = 1
  end

  redis.call("ZADD", restrictionIndexKey, now + restrictionTtlMs, userId)
end

local restrictedUntil = false
if storedTriggerMethod and restrictionTtlMs > 0 then
  restrictedUntil = now + restrictionTtlMs
end

return {
  failureCount,
  newlyRestricted,
  storedTriggerMethod or false,
  restrictedUntil,
  restrictionTtlMs
}`;

const GET_RESTRICTION_SCRIPT = `-- login-restriction:get-restriction
local restrictionKey = KEYS[1]
local restrictionIndexKey = KEYS[2]
local userId = ARGV[1]
local redisTime = redis.call("TIME")
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local storedTriggerMethod = redis.call("GET", restrictionKey)
local restrictionTtlMs = redis.call("PTTL", restrictionKey)

if not storedTriggerMethod or restrictionTtlMs <= 0 then
  redis.call("ZREM", restrictionIndexKey, userId)
  return { false, false, restrictionTtlMs }
end

return { storedTriggerMethod, now + restrictionTtlMs, restrictionTtlMs }`;

const CLEAR_LOGIN_STATE_SCRIPT = `-- login-restriction:clear-login-state
local failureKey = KEYS[1]
local restrictionKey = KEYS[2]
local restrictionIndexKey = KEYS[3]
local userId = ARGV[1]
local redisTime = redis.call("TIME")
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local storedTriggerMethod = redis.call("GET", restrictionKey)
local restrictionTtlMs = redis.call("PTTL", restrictionKey)
local changed = 0
local restrictedUntil = false

if storedTriggerMethod and restrictionTtlMs > 0 then
  changed = 1
  restrictedUntil = now + restrictionTtlMs
end

redis.call("DEL", failureKey, restrictionKey)
redis.call("ZREM", restrictionIndexKey, userId)
return { changed, storedTriggerMethod or false, restrictedUntil, restrictionTtlMs }`;

const LIST_RESTRICTIONS_SCRIPT = `-- login-restriction:list-restrictions
local restrictionIndexKey = KEYS[1]
local offset = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local restrictionKeyPrefix = ARGV[3]
local redisTime = redis.call("TIME")
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local rank = 0
local validSeen = 0
local collected = 0
local result = { 0 }

redis.call("ZREMRANGEBYSCORE", restrictionIndexKey, "-inf", now)

while collected < limit do
  local indexed = redis.call("ZREVRANGE", restrictionIndexKey, rank, rank, "WITHSCORES")
  if #indexed == 0 then
    break
  end

  local userId = indexed[1]
  local restrictedUntil = tonumber(indexed[2])
  local restrictionKey = restrictionKeyPrefix .. userId
  local storedTriggerMethod = redis.call("GET", restrictionKey)
  local restrictionTtlMs = redis.call("PTTL", restrictionKey)

  if not storedTriggerMethod or restrictionTtlMs <= 0 then
    redis.call("ZREM", restrictionIndexKey, userId)
  else
    if validSeen >= offset then
      table.insert(result, userId)
      table.insert(result, storedTriggerMethod)
      table.insert(result, restrictedUntil)
      table.insert(result, restrictionTtlMs)
      collected = collected + 1
    end
    validSeen = validSeen + 1
    rank = rank + 1
  end
end

result[1] = redis.call("ZCARD", restrictionIndexKey)
return result`;

export interface LoginRestrictionRedis {
  eval: (
    script: string,
    keyCount: number,
    ...args: Array<number | string>
  ) => Promise<unknown>;
}

export interface CreateRedisLoginRestrictionStoreOptions {
  redis: LoginRestrictionRedis;
  keyPrefix?: string;
}

function requireResultArray(value: unknown, operation: string) {
  if (!Array.isArray(value))
    throw new TypeError(`Redis ${operation} script returned an invalid result`);
  return value;
}

function requireFiniteNumber(value: unknown, operation: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new TypeError(`Redis ${operation} script returned an invalid number`);
  return parsed;
}

function toAtomicState(
  userId: number,
  triggerMethod: unknown,
  restrictedUntil: unknown,
  remainingMilliseconds: unknown,
  operation: string,
): LoginRestrictionAtomicState | null {
  if (triggerMethod === null || triggerMethod === false)
    return null;

  const remaining = requireFiniteNumber(remainingMilliseconds, operation);
  if (remaining <= 0)
    return null;

  return {
    userId,
    triggerMethod,
    restrictedUntil: requireFiniteNumber(restrictedUntil, operation),
    remainingMilliseconds: remaining,
  };
}

export function createRedisLoginRestrictionStore(
  options: CreateRedisLoginRestrictionStoreOptions,
): LoginRestrictionAtomicStorePort {
  const prefix = options.keyPrefix ?? "";
  const restrictionIndexKey = `${prefix}login-blacklist:idx:users`;

  function failureKey(userId: number) {
    return `${prefix}login-failures:user:${userId}`;
  }

  function restrictionKey(userId: number) {
    return `${prefix}login-blacklist:user:${userId}`;
  }

  async function recordFailure(input: {
    userId: number;
    triggerMethod: "password" | "mobile";
    failureMember: string;
  }): Promise<RecordLoginFailureAtomicResult> {
    const result = requireResultArray(await options.redis.eval(
      RECORD_FAILURE_SCRIPT,
      3,
      failureKey(input.userId),
      restrictionKey(input.userId),
      restrictionIndexKey,
      input.failureMember,
      String(LOGIN_FAILURE_WINDOW_SECONDS),
      String(LOGIN_RESTRICTION_DURATION_SECONDS * 1000),
      String(LOGIN_FAILURE_THRESHOLD),
      String(input.userId),
      input.triggerMethod,
    ), "record failure");

    return {
      failureCount: requireFiniteNumber(result[0], "record failure"),
      newlyRestricted: requireFiniteNumber(result[1], "record failure") === 1,
      restriction: toAtomicState(
        input.userId,
        result[2],
        result[3],
        result[4],
        "record failure",
      ),
    };
  }

  async function getRestriction(userId: number): Promise<LoginRestrictionAtomicState | null> {
    const result = requireResultArray(await options.redis.eval(
      GET_RESTRICTION_SCRIPT,
      2,
      restrictionKey(userId),
      restrictionIndexKey,
      String(userId),
    ), "get restriction");
    return toAtomicState(userId, result[0], result[1], result[2], "get restriction");
  }

  async function clearLoginState(userId: number): Promise<ClearLoginStateAtomicResult> {
    const result = requireResultArray(await options.redis.eval(
      CLEAR_LOGIN_STATE_SCRIPT,
      3,
      failureKey(userId),
      restrictionKey(userId),
      restrictionIndexKey,
      String(userId),
    ), "clear login state");

    return {
      changed: requireFiniteNumber(result[0], "clear login state") === 1,
      restriction: toAtomicState(
        userId,
        result[1],
        result[2],
        result[3],
        "clear login state",
      ),
    };
  }

  async function listRestrictions(input: {
    offset: number;
    limit: number;
  }): Promise<ListLoginRestrictionsAtomicResult> {
    const result = requireResultArray(await options.redis.eval(
      LIST_RESTRICTIONS_SCRIPT,
      1,
      restrictionIndexKey,
      String(input.offset),
      String(input.limit),
      `${prefix}login-blacklist:user:`,
    ), "list restrictions");
    const items: LoginRestrictionAtomicState[] = [];

    for (let index = 1; index < result.length; index += 4) {
      const userId = requireFiniteNumber(result[index], "list restrictions");
      const state = toAtomicState(
        userId,
        result[index + 1],
        result[index + 2],
        result[index + 3],
        "list restrictions",
      );
      if (state === null)
        throw new TypeError("Redis list restrictions script returned incomplete state");
      items.push(state);
    }

    return {
      items,
      total: requireFiniteNumber(result[0], "list restrictions"),
    };
  }

  return {
    clearLoginState,
    getRestriction,
    listRestrictions,
    recordFailure,
  };
}
