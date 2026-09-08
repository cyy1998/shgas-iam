import type { SessionKernelClock, SessionKernelConfig, SessionKernelTokenPrefixes } from "./config";
import { createSessionKernelConfig } from "./config";

export const DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID = "dev-current";
export const DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET = "dev-session-lookup-hmac-secret-32-bytes";

export type SessionKernelEnvConfigInput = {
  namespace?: string;
  principalIdleTtlSeconds?: number;
  principalAbsoluteTtlSeconds?: number;
  defaultPrincipalTtlSeconds?: number;
  tombstoneTtlSeconds?: number;
  tombstoneGraceSeconds?: number;
  lookupHmacCurrentId?: string;
  lookupHmacCurrentSecret?: string;
  lookupHmacPreviousId?: string;
  lookupHmacPreviousSecret?: string;
  nodeEnv?: string;
  tokenPrefixes?: Partial<SessionKernelTokenPrefixes>;
  clock?: SessionKernelClock;
};

export function createSessionKernelConfigFromEnv(input: SessionKernelEnvConfigInput): SessionKernelConfig {
  const currentSecret = normalizeOptionalString(input.lookupHmacCurrentSecret);
  if (
    input.nodeEnv === "production"
    && (!currentSecret || currentSecret === DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET)
  ) {
    throw new Error("SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production");
  }
  if (!currentSecret)
    throw new Error("SESSION_LOOKUP_HMAC_CURRENT_SECRET is required");

  const previousId = normalizeOptionalString(input.lookupHmacPreviousId);
  const previousSecret = normalizeOptionalString(input.lookupHmacPreviousSecret);
  if ((previousId === undefined) !== (previousSecret === undefined)) {
    throw new Error(
      "SESSION_LOOKUP_HMAC_PREVIOUS_ID and SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be configured together",
    );
  }

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
    lookupHmacKeys: {
      current: {
        id: normalizeOptionalString(input.lookupHmacCurrentId) ?? DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID,
        secret: currentSecret,
      },
      ...(previousId && previousSecret
        ? {
            previous: {
              id: previousId,
              secret: previousSecret,
            },
          }
        : {}),
    },
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

function normalizeOptionalString(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function secondsToMilliseconds(seconds: number, label: string) {
  if (!Number.isInteger(seconds) || seconds <= 0)
    throw new Error(`${label} must be a positive integer`);
  return seconds * 1000;
}
