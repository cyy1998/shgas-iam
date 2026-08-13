import type { Redis } from "ioredis";
import type {
  GenerationFencedRuntimeMutationHeartbeat,
  GenerationFencedRuntimeMutationHeartbeatTimer,
  GenerationFencedRuntimeMutationOwnership,
  GenerationFencedRuntimeMutationRedis,
} from "../redis/generation-fenced-runtime-mutation";
import {
  beginGenerationFencedRuntimeMutation,
  checkGenerationFencedRuntimeMutation,
  finishGenerationFencedRuntimeMutation,
  invalidateGenerationFencedRuntime,
  renewGenerationFencedRuntimeMutation,
  startGenerationFencedRuntimeMutationHeartbeat,
} from "../redis/generation-fenced-runtime-mutation";

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

export type CustomSsoClientRuntimeMutationRedis
  = GenerationFencedRuntimeMutationRedis;

export type CustomSsoClientRuntimeMutationOwnership
  = GenerationFencedRuntimeMutationOwnership;

export class CustomSsoClientRuntimeMutationOwnershipError extends Error {
  constructor(
    public readonly ownership:
    Exclude<CustomSsoClientRuntimeMutationOwnership, "owned">,
  ) {
    super(`Custom SSO client runtime mutation ownership ${ownership}`);
    this.name = "CustomSsoClientRuntimeMutationOwnershipError";
  }
}

export type CustomSsoClientRuntimeMutationHeartbeatTimer
  = GenerationFencedRuntimeMutationHeartbeatTimer;

export type CustomSsoClientRuntimeMutationHeartbeat
  = GenerationFencedRuntimeMutationHeartbeat;

export interface StartCustomSsoClientRuntimeMutationHeartbeatOptions {
  readonly timer?: CustomSsoClientRuntimeMutationHeartbeatTimer;
}

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
  await beginGenerationFencedRuntimeMutation(redis, {
    ...runtimeKeys(input.clientCode),
    fenceTtlMs,
    mutationId: input.mutationId,
  });
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
  return await renewGenerationFencedRuntimeMutation(
    redis,
    runtimeLease(mutation),
  );
}

export async function checkCustomSsoClientRuntimeMutationOwnership(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
): Promise<CustomSsoClientRuntimeMutationOwnership> {
  return await checkGenerationFencedRuntimeMutation(
    redis,
    runtimeLease(mutation),
  );
}

export function startCustomSsoClientRuntimeMutationHeartbeat(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
  options: StartCustomSsoClientRuntimeMutationHeartbeatOptions = {},
): CustomSsoClientRuntimeMutationHeartbeat {
  return startGenerationFencedRuntimeMutationHeartbeat(
    redis,
    runtimeLease(mutation),
    {
      createOwnershipError: ownership =>
        new CustomSsoClientRuntimeMutationOwnershipError(ownership),
      failureMessage: "Custom SSO client runtime heartbeat and settlement failed",
      ...(options.timer === undefined ? {} : { timer: options.timer }),
    },
  );
}

export async function completeCustomSsoClientRuntimeMutation(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
): Promise<"completed" | "expired" | "superseded"> {
  const result = await finishMutation(redis, mutation);
  return result === "finished" ? "completed" : result;
}

export async function abortCustomSsoClientRuntimeMutation(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
): Promise<"aborted" | "expired" | "superseded"> {
  const result = await finishMutation(redis, mutation);
  return result === "finished" ? "aborted" : result;
}

export async function invalidateCustomSsoClientRuntime(
  redis: Redis,
  clientCode: string,
) {
  await invalidateGenerationFencedRuntime(
    redis,
    runtimeKeys(clientCode),
    "Custom SSO client runtime invalidation transaction failed",
  );
}

async function finishMutation(
  redis: CustomSsoClientRuntimeMutationRedis,
  mutation: CustomSsoClientRuntimeMutation,
) {
  return await finishGenerationFencedRuntimeMutation(redis, {
    ...runtimeKeys(mutation.clientCode),
    mutationId: mutation.mutationId,
  });
}

function runtimeKeys(clientCode: string) {
  return {
    cacheKey: customSsoClientRuntimeCacheKey(clientCode),
    generationKey: customSsoClientRuntimeGenerationKey(clientCode),
    mutationKey: customSsoClientRuntimeMutationKey(clientCode),
  };
}

function runtimeLease(mutation: CustomSsoClientRuntimeMutation) {
  return {
    fenceTtlMs: mutation.fenceTtlMs,
    mutationId: mutation.mutationId,
    mutationKey: customSsoClientRuntimeMutationKey(mutation.clientCode),
  };
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`Custom SSO client runtime ${label} must be a positive safe integer`);
}

function encodeClientCodeKeySegment(clientCode: string) {
  return encodeURIComponent(clientCode);
}
