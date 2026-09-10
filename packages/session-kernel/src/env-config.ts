import type { SessionKernelClock, SessionKernelConfig, SessionKernelTokenPrefixes } from "./config";
import { createSessionKernelConfig } from "./config";

export type SessionKernelEnvConfigInput = {
  namespace?: string;
  principalIdleTtlSeconds?: number;
  principalAbsoluteTtlSeconds?: number;
  defaultPrincipalTtlSeconds?: number;
  tombstoneTtlSeconds?: number;
  tombstoneGraceSeconds?: number;
  tokenPrefixes?: Partial<SessionKernelTokenPrefixes>;
  clock?: SessionKernelClock;
};

export function createSessionKernelConfigFromEnv(input: SessionKernelEnvConfigInput): SessionKernelConfig {
  const principalIdleTtlSeconds = input.principalIdleTtlSeconds ?? input.defaultPrincipalTtlSeconds;
  const principalAbsoluteTtlSeconds = input.principalAbsoluteTtlSeconds
    ?? input.defaultPrincipalTtlSeconds
    ?? principalIdleTtlSeconds;

  if (principalIdleTtlSeconds === undefined)
    throw new Error("SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS or defaultPrincipalTtlSeconds is required");
  if (principalAbsoluteTtlSeconds === undefined)
    throw new Error("SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS or defaultPrincipalTtlSeconds is required");

  return createSessionKernelConfig({
    namespace: input.namespace,
    principalIdleTtlMs: secondsToMilliseconds(principalIdleTtlSeconds, "SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS"),
    principalAbsoluteTtlMs: secondsToMilliseconds(
      principalAbsoluteTtlSeconds,
      "SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS",
    ),
    tombstoneTtlMs: input.tombstoneTtlSeconds === undefined
      ? undefined
      : secondsToMilliseconds(input.tombstoneTtlSeconds, "SESSION_KERNEL_TOMBSTONE_TTL_SECONDS"),
    tombstoneGraceMs: input.tombstoneGraceSeconds === undefined
      ? undefined
      : secondsToMilliseconds(input.tombstoneGraceSeconds, "SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS"),
    tokenPrefixes: input.tokenPrefixes,
    clock: input.clock,
  });
}

function secondsToMilliseconds(seconds: number, label: string) {
  if (!Number.isInteger(seconds) || seconds <= 0)
    throw new Error(`${label} must be a positive integer`);
  return seconds * 1000;
}
