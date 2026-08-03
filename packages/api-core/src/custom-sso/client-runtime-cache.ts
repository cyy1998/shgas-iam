import type { Redis } from "ioredis";

export const CUSTOM_SSO_CLIENT_RUNTIME_POSITIVE_CACHE_TTL_MS = 30_000;
export const CUSTOM_SSO_CLIENT_RUNTIME_NEGATIVE_CACHE_TTL_MS = 3_000;
export const CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS = 120_000;

export function customSsoClientRuntimeCacheKey(clientCode: string) {
  return `custom-sso:client-runtime:${encodeClientCodeKeySegment(clientCode)}`;
}

export function customSsoClientRuntimeGenerationKey(clientCode: string) {
  return `custom-sso:client-runtime-generation:${encodeClientCodeKeySegment(clientCode)}`;
}

export function customSsoClientRuntimeMutationKey(clientCode: string) {
  return `custom-sso:client-runtime-mutation:${encodeClientCodeKeySegment(clientCode)}`;
}

export interface CustomSsoClientRuntimeMutation {
  readonly clientCode: string;
  readonly fenceTtlMs: number;
  readonly mutationId: string;
}

export interface CustomSsoClientRuntimeMutationRedis {
  eval: (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => Promise<unknown>;
}

const BEGIN_RUNTIME_MUTATION_SCRIPT = `
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
local generation = redis.call("INCR", KEYS[2])
redis.call("DEL", KEYS[3])
return tostring(generation)
`;

const FINISH_RUNTIME_MUTATION_SCRIPT = `
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

const RENEW_RUNTIME_MUTATION_SCRIPT = `
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

const CHECK_RUNTIME_MUTATION_OWNERSHIP_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return 2
end
if current ~= ARGV[1] then
  return 0
end
return 1
`;

export type CustomSsoClientRuntimeMutationOwnership
  = "owned" | "expired" | "superseded";

export class CustomSsoClientRuntimeMutationOwnershipError extends Error {
  constructor(
    public readonly ownership:
    Exclude<CustomSsoClientRuntimeMutationOwnership, "owned">,
  ) {
    super(`Custom SSO client runtime mutation ownership ${ownership}`);
    this.name = "CustomSsoClientRuntimeMutationOwnershipError";
  }
}

export interface CustomSsoClientRuntimeMutationHeartbeatTimer {
  setInterval: (
    callback: () => void,
    intervalMs: number,
  ) => unknown;
  clearInterval: (handle: unknown) => void;
}

export interface CustomSsoClientRuntimeMutationHeartbeat {
  assertOwned: () => Promise<void>;
  stopAndSettle: <T>(settle: () => Promise<T>) => Promise<T>;
}

export interface StartCustomSsoClientRuntimeMutationHeartbeatOptions {
  readonly timer?: CustomSsoClientRuntimeMutationHeartbeatTimer;
}

const defaultHeartbeatTimer:
CustomSsoClientRuntimeMutationHeartbeatTimer = {
  setInterval(callback, intervalMs) {
    return globalThis.setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    globalThis.clearInterval(
      handle as ReturnType<typeof globalThis.setInterval>,
    );
  },
};

export async function beginCustomSsoClientRuntimeMutation(
  redis: CustomSsoClientRuntimeMutationRedis,
  input: Omit<CustomSsoClientRuntimeMutation, "fenceTtlMs"> & {
    readonly fenceTtlMs?: number;
  },
): Promise<CustomSsoClientRuntimeMutation> {
  const fenceTtlMs = input.fenceTtlMs
    ?? CUSTOM_SSO_CLIENT_RUNTIME_MUTATION_FENCE_TTL_MS;
  assertPositiveSafeInteger(fenceTtlMs, "mutation fence TTL");
  if (fenceTtlMs < 3) {
    throw new RangeError(
      "Custom SSO client runtime mutation fence TTL must be at least 3 milliseconds",
    );
  }

  await redis.eval(
    BEGIN_RUNTIME_MUTATION_SCRIPT,
    3,
    customSsoClientRuntimeMutationKey(input.clientCode),
    customSsoClientRuntimeGenerationKey(input.clientCode),
    customSsoClientRuntimeCacheKey(input.clientCode),
    input.mutationId,
    String(fenceTtlMs),
  );
  return {
    clientCode: input.clientCode,
    fenceTtlMs,
    mutationId: input.mutationId,
  };
}

export async function renewCustomSsoClientRuntimeMutation(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
): Promise<"renewed" | "expired" | "superseded"> {
  const result = await redis.eval(
    RENEW_RUNTIME_MUTATION_SCRIPT,
    1,
    customSsoClientRuntimeMutationKey(mutation.clientCode),
    mutation.mutationId,
    String(mutation.fenceTtlMs),
  );
  if (Number(result) === 1)
    return "renewed";
  if (Number(result) === 2)
    return "expired";
  return "superseded";
}

export async function checkCustomSsoClientRuntimeMutationOwnership(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
): Promise<CustomSsoClientRuntimeMutationOwnership> {
  const result = await redis.eval(
    CHECK_RUNTIME_MUTATION_OWNERSHIP_SCRIPT,
    1,
    customSsoClientRuntimeMutationKey(mutation.clientCode),
    mutation.mutationId,
  );
  if (Number(result) === 1)
    return "owned";
  if (Number(result) === 2)
    return "expired";
  return "superseded";
}

export function startCustomSsoClientRuntimeMutationHeartbeat(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
  options: StartCustomSsoClientRuntimeMutationHeartbeatOptions = {},
): CustomSsoClientRuntimeMutationHeartbeat {
  const timer = options.timer ?? defaultHeartbeatTimer;
  const intervalMs = Math.floor(mutation.fenceTtlMs / 3);
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
    if (
      stopped
      || checkingOwnership
      || hasFailure
      || inFlight !== undefined
    ) {
      return;
    }
    const renewal = (async () => {
      try {
        const status = await renewCustomSsoClientRuntimeMutation(
          redis,
          mutation,
        );
        if (status !== "renewed") {
          recordFailure(
            new CustomSsoClientRuntimeMutationOwnershipError(status),
          );
        }
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
    const active = inFlight;
    if (active !== undefined)
      await active;
  }

  const timerHandle = timer.setInterval(
    startRenewal,
    intervalMs,
  );

  return {
    async assertOwned() {
      checkingOwnership = true;
      try {
        await waitForInFlight();
        if (hasFailure)
          throw failure;
        let ownership: CustomSsoClientRuntimeMutationOwnership;
        try {
          ownership
            = await checkCustomSsoClientRuntimeMutationOwnership(
              redis,
              mutation,
            );
        }
        catch (error) {
          recordFailure(error);
          throw error;
        }
        if (ownership !== "owned") {
          const error
            = new CustomSsoClientRuntimeMutationOwnershipError(
              ownership,
            );
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
          "Custom SSO client runtime heartbeat and settlement failed",
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

export async function completeCustomSsoClientRuntimeMutation(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
): Promise<"completed" | "expired" | "superseded"> {
  return await finishCustomSsoClientRuntimeMutation(
    redis,
    mutation,
    "completed",
  );
}

export async function abortCustomSsoClientRuntimeMutation(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
): Promise<"aborted" | "expired" | "superseded"> {
  return await finishCustomSsoClientRuntimeMutation(
    redis,
    mutation,
    "aborted",
  );
}

async function finishCustomSsoClientRuntimeMutation<
  T extends "aborted" | "completed",
>(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
  ownedStatus: T,
): Promise<T | "expired" | "superseded"> {
  const result = await redis.eval(
    FINISH_RUNTIME_MUTATION_SCRIPT,
    3,
    customSsoClientRuntimeMutationKey(mutation.clientCode),
    customSsoClientRuntimeGenerationKey(mutation.clientCode),
    customSsoClientRuntimeCacheKey(mutation.clientCode),
    mutation.mutationId,
  );
  return finishResult(result, ownedStatus);
}

export async function invalidateCustomSsoClientRuntime(
  redis: Redis,
  clientCode: string,
) {
  const result = await redis.multi()
    .incr(customSsoClientRuntimeGenerationKey(clientCode))
    .del(customSsoClientRuntimeCacheKey(clientCode))
    .exec();
  if (result === null) {
    throw new Error(
      "Custom SSO client runtime invalidation transaction failed",
    );
  }
  const failed = result.find(([error]) => error !== null);
  if (failed?.[0])
    throw failed[0];
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`Custom SSO client runtime ${label} must be a positive safe integer`);
}

function encodeClientCodeKeySegment(clientCode: string) {
  return encodeURIComponent(clientCode);
}

function finishResult<T extends "aborted" | "completed">(
  result: unknown,
  ownedStatus: T,
): T | "expired" | "superseded" {
  if (Number(result) === 1)
    return ownedStatus;
  if (Number(result) === 2)
    return "expired";
  return "superseded";
}
