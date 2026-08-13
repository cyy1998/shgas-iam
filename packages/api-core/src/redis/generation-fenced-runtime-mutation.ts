import type { Redis } from "ioredis";

const BEGIN_MUTATION_SCRIPT = `-- generation-fenced-runtime:begin
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
local generation = redis.call("INCR", KEYS[2])
redis.call("DEL", KEYS[3])
return tostring(generation)
`;

const FINISH_MUTATION_SCRIPT = `-- generation-fenced-runtime:finish
local current = redis.call("GET", KEYS[1])
if current and current ~= ARGV[1] then
  return 0
end
redis.call("INCR", KEYS[2])
redis.call("DEL", KEYS[3])
if current then
  redis.call("DEL", KEYS[1])
  return 1
end
return 2
`;

const RENEW_MUTATION_SCRIPT = `-- generation-fenced-runtime:renew
local current = redis.call("GET", KEYS[1])
if not current then
  return 2
end
if current ~= ARGV[1] then
  return 0
end
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return 1
`;

const CHECK_MUTATION_SCRIPT = `-- generation-fenced-runtime:check
local current = redis.call("GET", KEYS[1])
if not current then
  return 2
end
if current ~= ARGV[1] then
  return 0
end
return 1
`;

export interface GenerationFencedRuntimeMutationRedis {
  eval: (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => Promise<unknown>;
}

export interface GenerationFencedRuntimeMutationKeys {
  readonly cacheKey: string;
  readonly generationKey: string;
  readonly mutationKey: string;
}

export interface GenerationFencedRuntimeMutationLease {
  readonly fenceTtlMs: number;
  readonly mutationId: string;
  readonly mutationKey: string;
}

export type GenerationFencedRuntimeMutationOwnership
  = "expired" | "owned" | "superseded";

export interface GenerationFencedRuntimeMutationHeartbeatTimer {
  setInterval: (callback: () => void, intervalMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface GenerationFencedRuntimeMutationHeartbeat {
  assertOwned: () => Promise<void>;
  stopAndSettle: <T>(settle: () => Promise<T>) => Promise<T>;
}

const defaultHeartbeatTimer: GenerationFencedRuntimeMutationHeartbeatTimer = {
  setInterval(callback, intervalMs) {
    return globalThis.setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>);
  },
};

export async function beginGenerationFencedRuntimeMutation(
  redis: GenerationFencedRuntimeMutationRedis,
  input: GenerationFencedRuntimeMutationKeys & {
    readonly fenceTtlMs: number;
    readonly mutationId: string;
  },
) {
  await redis.eval(
    BEGIN_MUTATION_SCRIPT,
    3,
    input.mutationKey,
    input.generationKey,
    input.cacheKey,
    input.mutationId,
    String(input.fenceTtlMs),
  );
}

export async function renewGenerationFencedRuntimeMutation(
  redis: GenerationFencedRuntimeMutationRedis,
  lease: GenerationFencedRuntimeMutationLease,
): Promise<"expired" | "renewed" | "superseded"> {
  const result = await redis.eval(
    RENEW_MUTATION_SCRIPT,
    1,
    lease.mutationKey,
    lease.mutationId,
    String(lease.fenceTtlMs),
  );
  if (Number(result) === 1)
    return "renewed";
  if (Number(result) === 2)
    return "expired";
  return "superseded";
}

export async function checkGenerationFencedRuntimeMutation(
  redis: GenerationFencedRuntimeMutationRedis,
  lease: Pick<GenerationFencedRuntimeMutationLease, "mutationId" | "mutationKey">,
): Promise<GenerationFencedRuntimeMutationOwnership> {
  const result = await redis.eval(
    CHECK_MUTATION_SCRIPT,
    1,
    lease.mutationKey,
    lease.mutationId,
  );
  if (Number(result) === 1)
    return "owned";
  if (Number(result) === 2)
    return "expired";
  return "superseded";
}

export function startGenerationFencedRuntimeMutationHeartbeat(
  redis: GenerationFencedRuntimeMutationRedis,
  lease: GenerationFencedRuntimeMutationLease,
  options: {
    readonly createOwnershipError: (
      ownership: Exclude<GenerationFencedRuntimeMutationOwnership, "owned">,
    ) => Error;
    readonly failureMessage: string;
    readonly timer?: GenerationFencedRuntimeMutationHeartbeatTimer;
  },
): GenerationFencedRuntimeMutationHeartbeat {
  const timer = options.timer ?? defaultHeartbeatTimer;
  const intervalMs = Math.floor(lease.fenceTtlMs / 3);
  let stopped = false;
  let checkingOwnership = false;
  let inFlight: Promise<void> | undefined;
  let hasFailure = false;
  let failure: unknown;

  function recordFailure(error: unknown) {
    if (hasFailure)
      return;
    hasFailure = true;
    failure = error;
  }

  function startRenewal() {
    if (stopped || checkingOwnership || hasFailure || inFlight !== undefined)
      return;
    const renewal = (async () => {
      try {
        const status = await renewGenerationFencedRuntimeMutation(
          redis,
          lease,
        );
        if (status !== "renewed")
          recordFailure(options.createOwnershipError(status));
      }
      catch (error) {
        recordFailure(error);
      }
    })().finally(() => {
      if (inFlight === renewal)
        inFlight = undefined;
    });
    inFlight = renewal;
  }

  async function waitForInFlight() {
    if (inFlight !== undefined)
      await inFlight;
  }

  const timerHandle = timer.setInterval(startRenewal, intervalMs);
  return {
    async assertOwned() {
      checkingOwnership = true;
      try {
        await waitForInFlight();
        if (hasFailure)
          throw failure;
        let ownership: GenerationFencedRuntimeMutationOwnership;
        try {
          ownership = await checkGenerationFencedRuntimeMutation(
            redis,
            lease,
          );
        }
        catch (error) {
          recordFailure(error);
          throw error;
        }
        if (ownership !== "owned") {
          const error = options.createOwnershipError(ownership);
          recordFailure(error);
          throw error;
        }
      }
      finally {
        checkingOwnership = false;
      }
    },
    async stopAndSettle<T>(settle: () => Promise<T>) {
      if (!stopped) {
        stopped = true;
        timer.clearInterval(timerHandle);
      }
      await waitForInFlight();

      let result: T | undefined;
      let settleFailed = false;
      let settleFailure: unknown;
      try {
        result = await settle();
      }
      catch (error) {
        settleFailed = true;
        settleFailure = error;
      }

      if (hasFailure && settleFailed) {
        throw new AggregateError(
          [failure, settleFailure],
          options.failureMessage,
        );
      }
      if (hasFailure)
        throw failure;
      if (settleFailed)
        throw settleFailure;
      return result as T;
    },
  };
}

export async function finishGenerationFencedRuntimeMutation(
  redis: GenerationFencedRuntimeMutationRedis,
  input: GenerationFencedRuntimeMutationKeys & {
    readonly mutationId: string;
  },
): Promise<"expired" | "finished" | "superseded"> {
  const result = await redis.eval(
    FINISH_MUTATION_SCRIPT,
    3,
    input.mutationKey,
    input.generationKey,
    input.cacheKey,
    input.mutationId,
  );
  if (Number(result) === 1)
    return "finished";
  if (Number(result) === 2)
    return "expired";
  return "superseded";
}

export async function invalidateGenerationFencedRuntime(
  redis: Redis,
  keys: Pick<GenerationFencedRuntimeMutationKeys, "cacheKey" | "generationKey">,
  failureMessage: string,
) {
  const result = await redis.multi()
    .incr(keys.generationKey)
    .del(keys.cacheKey)
    .exec();
  if (result === null)
    throw new Error(failureMessage);
  const failed = result.find(([error]) => error !== null);
  if (failed?.[0])
    throw failed[0];
}
