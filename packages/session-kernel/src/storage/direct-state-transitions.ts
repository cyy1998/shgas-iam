import type { SessionKernelRedis, StoreIndexWrite } from "./store";

type DirectStateOwner = {
  stateKey: string;
  idKey: string;
  idOwner: string;
};

type DirectStateComparison = DirectStateOwner & { expected: string };

type DirectStateWrite = DirectStateOwner & {
  serialized: string;
  expiresAt: number;
  indexes: StoreIndexWrite[];
};

export interface DirectStateTransitions {
  create: (input: DirectStateWrite) => Promise<boolean>;
  update: (input: DirectStateWrite & { expected: string }) => Promise<boolean>;
  revoke: (input: DirectStateComparison & {
    serialized: string;
    expiresAt: number;
    indexRemovals: Array<{ key: string; member: string }>;
    pending?: { key: string; member: string; score: number };
  }) => Promise<boolean>;
  finalize: (input: DirectStateComparison & {
    expiresAt: number;
    now: number;
    indexKey: string;
    member: string;
  }) => Promise<boolean>;
  deleteOwned: (input: DirectStateComparison & { payloadKeys: readonly string[] }) => Promise<boolean>;
}

// Validate every index before the first write: Redis script errors do not roll back earlier writes.
const CHECK_INDEX_TYPES_SCRIPT = `
for index = 3, #KEYS do
  local keyType = redis.call("TYPE", KEYS[index]).ok
  if KEYS[index] == KEYS[1] or KEYS[index] == KEYS[2]
    or (keyType ~= "none" and keyType ~= "zset") then
    return redis.error_reply("WRONGTYPE direct state index must be a sorted set")
  end
end
`;

const CHECK_OWNER_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1]
  or redis.call("GET", KEYS[2]) ~= ARGV[2] then
  return 0
end
`;

const CREATE_SCRIPT = `
-- session-kernel-direct-create-v1
if redis.call("EXISTS", KEYS[1]) == 1
  or redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end
${CHECK_INDEX_TYPES_SCRIPT}
redis.call("SET", KEYS[1], ARGV[1])
redis.call("SET", KEYS[2], ARGV[2])
redis.call("PEXPIREAT", KEYS[1], ARGV[3])
redis.call("PEXPIREAT", KEYS[2], ARGV[3])
for index = 3, #KEYS do
  local cursor = 4 + (index - 3) * 2
  redis.call("ZADD", KEYS[index], ARGV[cursor], ARGV[cursor + 1])
end
return 1
`;

const UPDATE_SCRIPT = `
-- session-kernel-direct-update-v1
${CHECK_OWNER_SCRIPT}
${CHECK_INDEX_TYPES_SCRIPT}
redis.call("SET", KEYS[1], ARGV[3])
redis.call("PEXPIREAT", KEYS[1], ARGV[4])
redis.call("PEXPIREAT", KEYS[2], ARGV[4])
for index = 3, #KEYS do
  local cursor = 5 + (index - 3) * 2
  redis.call("ZADD", KEYS[index], ARGV[cursor], ARGV[cursor + 1])
end
return 1
`;

const REVOKE_SCRIPT = `
-- session-kernel-direct-revoke-v1
${CHECK_OWNER_SCRIPT}
${CHECK_INDEX_TYPES_SCRIPT}
redis.call("SET", KEYS[1], ARGV[3])
redis.call("SET", KEYS[2], ARGV[2])
if ARGV[5] ~= "1" then
  redis.call("PEXPIREAT", KEYS[1], ARGV[4])
  redis.call("PEXPIREAT", KEYS[2], ARGV[4])
end
local removalCount = tonumber(ARGV[6])
for index = 1, removalCount do
  redis.call("ZREM", KEYS[2 + index], ARGV[6 + index])
end
if ARGV[5] == "1" then
  redis.call("ZADD", KEYS[3 + removalCount], ARGV[7 + removalCount], ARGV[8 + removalCount])
end
return 1
`;

const FINALIZE_SCRIPT = `
-- session-kernel-direct-finalize-v1
${CHECK_OWNER_SCRIPT}
${CHECK_INDEX_TYPES_SCRIPT}
redis.call("ZREM", KEYS[3], ARGV[5])
if tonumber(ARGV[3]) <= tonumber(ARGV[4]) then
  redis.call("DEL", KEYS[1], KEYS[2])
else
  redis.call("PEXPIREAT", KEYS[1], ARGV[3])
  redis.call("PEXPIREAT", KEYS[2], ARGV[3])
end
return 1
`;

const CLEANUP_SCRIPT = `
-- session-kernel-direct-cleanup-v1
${CHECK_OWNER_SCRIPT}
for index = 3, #KEYS do
  redis.call("DEL", KEYS[index])
end
return 1
`;

export function createRedisDirectStateTransitions(redis: SessionKernelRedis): DirectStateTransitions {
  if (!redis.eval)
    throw new Error("session kernel Redis eval is required for direct state transitions");

  const evaluate = async (script: string, keys: string[], args: Array<string | number>) => {
    if (keys[0] === keys[1])
      throw new Error("session kernel direct state and ID keys must be distinct");
    return parseTransitionResult(await redis.eval!(script, keys.length, ...keys, ...args));
  };

  return {
    async create(input) {
      assertWriteNumbers(input.expiresAt, input.indexes);
      return await evaluate(CREATE_SCRIPT, [input.stateKey, input.idKey, ...input.indexes.map(index => index.key)], [
        input.serialized,
        input.idOwner,
        input.expiresAt,
        ...input.indexes.flatMap(index => [index.score, index.member]),
      ]);
    },
    async update(input) {
      assertWriteNumbers(input.expiresAt, input.indexes);
      return await evaluate(UPDATE_SCRIPT, [input.stateKey, input.idKey, ...input.indexes.map(index => index.key)], [
        input.expected,
        input.idOwner,
        input.serialized,
        input.expiresAt,
        ...input.indexes.flatMap(index => [index.score, index.member]),
      ]);
    },
    async revoke(input) {
      assertWriteNumbers(input.expiresAt, input.pending ? [input.pending] : []);
      return await evaluate(REVOKE_SCRIPT, [
        input.stateKey,
        input.idKey,
        ...input.indexRemovals.map(index => index.key),
        ...(input.pending ? [input.pending.key] : []),
      ], [
        input.expected,
        input.idOwner,
        input.serialized,
        input.expiresAt,
        input.pending ? 1 : 0,
        input.indexRemovals.length,
        ...input.indexRemovals.map(index => index.member),
        ...(input.pending ? [input.pending.score, input.pending.member] : []),
      ]);
    },
    async finalize(input) {
      assertWriteNumbers(input.expiresAt, []);
      if (!Number.isSafeInteger(input.now))
        throw new Error("session kernel direct state observation time must be an integer");
      return await evaluate(FINALIZE_SCRIPT, [input.stateKey, input.idKey, input.indexKey], [
        input.expected,
        input.idOwner,
        input.expiresAt,
        input.now,
        input.member,
      ]);
    },
    async deleteOwned(input) {
      return await evaluate(CLEANUP_SCRIPT, [input.stateKey, input.idKey, ...input.payloadKeys], [
        input.expected,
        input.idOwner,
      ]);
    },
  };
}

const inMemoryTails = new WeakMap<SessionKernelRedis, Promise<void>>();

export function createInMemoryDirectStateTransitions(redis: SessionKernelRedis): DirectStateTransitions {
  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = (inMemoryTails.get(redis) ?? Promise.resolve()).then(operation);
    inMemoryTails.set(redis, result.then(() => undefined, () => undefined));
    return result;
  };
  const owns = async (input: DirectStateComparison) => {
    if (input.stateKey === input.idKey)
      throw new Error("session kernel direct state and ID keys must be distinct");
    return await redis.get(input.stateKey) === input.expected && await redis.get(input.idKey) === input.idOwner;
  };

  return {
    create(input) {
      return enqueue(async () => {
        assertWriteNumbers(input.expiresAt, input.indexes);
        if (input.stateKey === input.idKey)
          throw new Error("session kernel direct state and ID keys must be distinct");
        if (await redis.get(input.stateKey) !== null || await redis.get(input.idKey) !== null)
          return false;
        const transaction = redis.multi()
          .set(input.stateKey, input.serialized)
          .set(input.idKey, input.idOwner)
          .pexpireat(input.stateKey, input.expiresAt)
          .pexpireat(input.idKey, input.expiresAt);
        for (const index of input.indexes)
          transaction.zadd(index.key, index.score, index.member);
        await assertTransaction(transaction.exec());
        return true;
      });
    },
    update(input) {
      return enqueue(async () => {
        assertWriteNumbers(input.expiresAt, input.indexes);
        if (!await owns(input))
          return false;
        const transaction = redis.multi()
          .set(input.stateKey, input.serialized)
          .pexpireat(input.stateKey, input.expiresAt)
          .pexpireat(input.idKey, input.expiresAt);
        for (const index of input.indexes)
          transaction.zadd(index.key, index.score, index.member);
        await assertTransaction(transaction.exec());
        return true;
      });
    },
    revoke(input) {
      return enqueue(async () => {
        assertWriteNumbers(input.expiresAt, input.pending ? [input.pending] : []);
        if (!await owns(input))
          return false;
        const transaction = redis.multi()
          .del(input.stateKey, input.idKey)
          .set(input.stateKey, input.serialized)
          .set(input.idKey, input.idOwner);
        if (!input.pending) {
          transaction.pexpireat(input.stateKey, input.expiresAt)
            .pexpireat(input.idKey, input.expiresAt);
        }
        for (const removal of input.indexRemovals)
          transaction.zrem(removal.key, removal.member);
        if (input.pending)
          transaction.zadd(input.pending.key, input.pending.score, input.pending.member);
        await assertTransaction(transaction.exec());
        return true;
      });
    },
    finalize(input) {
      return enqueue(async () => {
        assertWriteNumbers(input.expiresAt, []);
        if (!Number.isSafeInteger(input.now))
          throw new Error("session kernel direct state observation time must be an integer");
        if (!await owns(input))
          return false;
        const transaction = redis.multi().zrem(input.indexKey, input.member);
        if (input.expiresAt <= input.now)
          transaction.del(input.stateKey, input.idKey);
        else
          transaction.pexpireat(input.stateKey, input.expiresAt).pexpireat(input.idKey, input.expiresAt);
        await assertTransaction(transaction.exec());
        return true;
      });
    },
    deleteOwned(input) {
      return enqueue(async () => {
        if (!await owns(input))
          return false;
        if (input.payloadKeys.length > 0)
          await assertTransaction(redis.multi().del(...input.payloadKeys).exec());
        return true;
      });
    },
  };
}

function assertWriteNumbers(expiresAt: number, indexes: ReadonlyArray<{ score: number }>) {
  if (!Number.isSafeInteger(expiresAt) || indexes.some(index => !Number.isFinite(index.score)))
    throw new Error("session kernel direct state requires an integer deadline and finite index scores");
}

function parseTransitionResult(result: unknown) {
  if (result === 1 || result === "1")
    return true;
  if (result === 0 || result === "0")
    return false;
  throw new Error("session kernel Redis returned an invalid direct state transition result");
}

async function assertTransaction(promise: Promise<Array<[Error | null, unknown]> | null>) {
  const result = await promise;
  if (!result)
    throw new Error("session kernel in-memory direct state transition failed");
  const failed = result.find(([error]) => error !== null);
  if (failed?.[0])
    throw failed[0];
}
