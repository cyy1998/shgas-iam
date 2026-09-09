import type {
  SessionKernelRedis,
  SessionKernelRevocationTransitions,
} from "./store";

const DELETE_OWNED_CLEANUP_KEYS_SCRIPT = `
-- session-kernel-delete-owned-cleanup-keys-v1
if redis.call("EXISTS", KEYS[1]) == 1
  or redis.call("GET", KEYS[2]) ~= ARGV[1] then
  return 0
end
for index = 3, #KEYS do
  redis.call("DEL", KEYS[index])
end
return 1
`;

const REVOKE_ACTIVE_OBJECT_SCRIPT = `
-- session-kernel-revoke-active-object-v1
if redis.call("EXISTS", KEYS[2]) == 1
  or redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end

local serializedTombstone = ARGV[2]
local expiresAt = ARGV[3]
local hasLookup = ARGV[7] == "1"
local hasCleanupPending = ARGV[8] == "1"
local removalCount = tonumber(ARGV[9])
local keyCursor = 3

redis.call("SET", KEYS[2], serializedTombstone)
if not hasCleanupPending then
  redis.call("PEXPIREAT", KEYS[2], expiresAt)
end
redis.call("DEL", KEYS[1])

if hasLookup then
  local lookupKey = KEYS[keyCursor]
  local lookupTombstoneKey = KEYS[keyCursor + 1]
  if redis.call("GET", lookupKey) == ARGV[4] then
    redis.call("SET", lookupTombstoneKey, serializedTombstone)
    if not hasCleanupPending then
      redis.call("PEXPIREAT", lookupTombstoneKey, expiresAt)
    end
    redis.call("DEL", lookupKey)
  end
  keyCursor = keyCursor + 2
end

if hasCleanupPending then
  redis.call("ZADD", KEYS[keyCursor], ARGV[6], ARGV[5])
  keyCursor = keyCursor + 1
end

for index = 1, removalCount do
  redis.call("ZREM", KEYS[keyCursor], ARGV[9 + index])
  keyCursor = keyCursor + 1
end

return 1
`;

const FINALIZE_CLEANUP_PENDING_SCRIPT = `
-- session-kernel-finalize-cleanup-pending-v1
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end

local hasLookupTombstone = ARGV[5] == "1"
if hasLookupTombstone
  and redis.call("EXISTS", KEYS[3]) == 1
  and redis.call("GET", KEYS[3]) ~= ARGV[1] then
  return 0
end

redis.call("ZREM", KEYS[2], ARGV[2])
if tonumber(ARGV[3]) <= tonumber(ARGV[4]) then
  redis.call("DEL", KEYS[1])
  if hasLookupTombstone
    and redis.call("GET", KEYS[3]) == ARGV[1] then
    redis.call("DEL", KEYS[3])
  end
else
  redis.call("PEXPIREAT", KEYS[1], ARGV[3])
  if hasLookupTombstone
    and redis.call("GET", KEYS[3]) == ARGV[1] then
    redis.call("PEXPIREAT", KEYS[3], ARGV[3])
  end
end

return 1
`;

const UPDATE_ACTIVE_OBJECT_SCRIPT = `
-- session-kernel-update-active-object-v1
if redis.call("EXISTS", KEYS[2]) == 1
  or redis.call("GET", KEYS[1]) ~= ARGV[1] then
  return 0
end

local indexCount = tonumber(ARGV[4])
local lookupOwner = ARGV[5 + indexCount * 2]
if lookupOwner ~= "" then
  if redis.call("GET", KEYS[3 + indexCount]) ~= lookupOwner
    or redis.call("EXISTS", KEYS[4 + indexCount]) == 1 then
    return 0
  end
  redis.call("PEXPIREAT", KEYS[3 + indexCount], ARGV[3])
end
redis.call("SET", KEYS[1], ARGV[2])
redis.call("PEXPIREAT", KEYS[1], ARGV[3])
for index = 1, indexCount do
  local argumentCursor = 4 + ((index - 1) * 2)
  redis.call(
    "ZADD",
    KEYS[2 + index],
    ARGV[argumentCursor + 1],
    ARGV[argumentCursor + 2]
  )
end
return 1
`;

export function createRedisSessionKernelRevocationTransitions(
  redis: SessionKernelRedis,
): SessionKernelRevocationTransitions {
  if (!redis.eval) {
    throw new Error(
      "session kernel Redis eval is required for revocation transitions",
    );
  }

  return {
    async deleteOwnedCleanupKeys(input) {
      return parseTransitionResult(await redis.eval!(
        DELETE_OWNED_CLEANUP_KEYS_SCRIPT,
        2 + input.payloadKeys.length,
        input.lookupKey,
        input.lookupTombstoneKey,
        ...input.payloadKeys,
        input.serializedTombstone,
      ));
    },
    async finalizeCleanupPending(input) {
      const keys = [input.tombstoneKey, input.indexKey];
      if (input.lookupTombstoneKey)
        keys.push(input.lookupTombstoneKey);
      return parseTransitionResult(await redis.eval!(
        FINALIZE_CLEANUP_PENDING_SCRIPT,
        keys.length,
        ...keys,
        input.serializedTombstone,
        input.member,
        input.expiresAt,
        input.now,
        input.lookupTombstoneKey ? 1 : 0,
      ));
    },
    async revokeActiveObject(input) {
      const keys = [input.activeKey, input.tombstoneKey];
      if (input.lookup)
        keys.push(input.lookup.activeKey, input.lookup.tombstoneKey);
      if (input.cleanupPending)
        keys.push(input.cleanupPending.key);
      keys.push(...input.indexRemovals.map(removal => removal.key));
      return parseTransitionResult(await redis.eval!(
        REVOKE_ACTIVE_OBJECT_SCRIPT,
        keys.length,
        ...keys,
        input.expectedActive,
        input.serializedTombstone,
        input.expiresAt,
        input.lookup?.expectedOwner ?? "",
        input.cleanupPending?.member ?? "",
        input.cleanupPending?.score ?? 0,
        input.lookup ? 1 : 0,
        input.cleanupPending ? 1 : 0,
        input.indexRemovals.length,
        ...input.indexRemovals.map(removal => removal.member),
      ));
    },
    async updateActiveObject(input) {
      const keys = [
        input.activeKey,
        input.tombstoneKey,
        ...input.indexes.map(index => index.key),
        ...(input.lookup ? [input.lookup.key, input.lookup.tombstoneKey] : []),
      ];
      return parseTransitionResult(await redis.eval!(
        UPDATE_ACTIVE_OBJECT_SCRIPT,
        keys.length,
        ...keys,
        input.expectedActive,
        input.serializedObject,
        input.expiresAt,
        input.indexes.length,
        ...input.indexes.flatMap(index => [index.score, index.member]),
        input.lookup?.expectedOwner ?? "",
      ));
    },
  };
}

export function createInMemorySessionKernelRevocationTransitions(
  redis: SessionKernelRedis,
): SessionKernelRevocationTransitions {
  let tail = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    deleteOwnedCleanupKeys(input) {
      return enqueue(async () => {
        if (await redis.get(input.lookupKey) !== null
          || await redis.get(input.lookupTombstoneKey) !== input.serializedTombstone) {
          return false;
        }
        await redis.del(...input.payloadKeys);
        return true;
      });
    },
    finalizeCleanupPending(input) {
      return enqueue(async () => {
        if (await redis.get(input.tombstoneKey) !== input.serializedTombstone)
          return false;
        if (
          input.lookupTombstoneKey
          && await redis.get(input.lookupTombstoneKey) !== null
          && await redis.get(input.lookupTombstoneKey) !== input.serializedTombstone
        ) {
          return false;
        }
        const transaction = redis.multi().zrem(input.indexKey, input.member);
        if (input.expiresAt <= input.now) {
          transaction.del(
            input.tombstoneKey,
            ...(input.lookupTombstoneKey ? [input.lookupTombstoneKey] : []),
          );
        }
        else {
          transaction.pexpireat(input.tombstoneKey, input.expiresAt);
          if (input.lookupTombstoneKey)
            transaction.pexpireat(input.lookupTombstoneKey, input.expiresAt);
        }
        await assertTransitionTransaction(transaction.exec());
        return true;
      });
    },
    revokeActiveObject(input) {
      return enqueue(async () => {
        if (
          await redis.get(input.tombstoneKey) !== null
          || await redis.get(input.activeKey) !== input.expectedActive
        ) {
          return false;
        }
        const transaction = redis.multi()
          .set(input.tombstoneKey, input.serializedTombstone)
          .del(input.activeKey);
        if (input.cleanupPending) {
          transaction.zadd(
            input.cleanupPending.key,
            input.cleanupPending.score,
            input.cleanupPending.member,
          );
        }
        else {
          transaction.pexpireat(input.tombstoneKey, input.expiresAt);
        }
        if (
          input.lookup
          && await redis.get(input.lookup.activeKey) === input.lookup.expectedOwner
        ) {
          transaction
            .set(input.lookup.tombstoneKey, input.serializedTombstone)
            .del(input.lookup.activeKey);
          if (!input.cleanupPending)
            transaction.pexpireat(input.lookup.tombstoneKey, input.expiresAt);
        }
        for (const removal of input.indexRemovals)
          transaction.zrem(removal.key, removal.member);
        await assertTransitionTransaction(transaction.exec());
        return true;
      });
    },
    updateActiveObject(input) {
      return enqueue(async () => {
        if (
          await redis.get(input.tombstoneKey) !== null
          || await redis.get(input.activeKey) !== input.expectedActive
        ) {
          return false;
        }
        if (input.lookup && (
          await redis.get(input.lookup.key) !== input.lookup.expectedOwner
          || await redis.get(input.lookup.tombstoneKey) !== null
        )) {
          return false;
        }
        const transaction = redis.multi()
          .set(input.activeKey, input.serializedObject)
          .pexpireat(input.activeKey, input.expiresAt);
        if (input.lookup)
          transaction.pexpireat(input.lookup.key, input.expiresAt);
        for (const index of input.indexes)
          transaction.zadd(index.key, index.score, index.member);
        await assertTransitionTransaction(transaction.exec());
        return true;
      });
    },
  };
}

function parseTransitionResult(result: unknown) {
  if (result === 1 || result === "1")
    return true;
  if (result === 0 || result === "0")
    return false;
  throw new Error("session kernel Redis returned an invalid revocation transition result");
}

async function assertTransitionTransaction(
  promise: Promise<Array<[Error | null, unknown]> | null>,
) {
  const result = await promise;
  if (!result)
    throw new Error("session kernel in-memory revocation transition failed");
  const failed = result.find(([error]) => error !== null);
  if (failed?.[0])
    throw failed[0];
}
