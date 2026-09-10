export const DEFAULT_SESSION_KERNEL_NAMESPACE = "sess:v2:";

export type SessionKernelClock = {
  now: () => number;
};

export type SessionKernelTokenPrefixes = {
  principalSession: string;
  authCode: string;
  localSession: string;
  oidcReturnHandle: string;
  credential: string;
  artifact: string;
};

export type SessionKernelConfigInput = {
  namespace?: string;
  principalIdleTtlMs: number;
  principalAbsoluteTtlMs: number;
  tombstoneTtlMs?: number;
  tombstoneGraceMs?: number;
  tokenPrefixes?: Partial<SessionKernelTokenPrefixes>;
  /** Authentication event time; production lifecycle deadlines and observations belong to Redis. */
  clock?: SessionKernelClock;
};

export type SessionKernelConfig = {
  namespace: string;
  principalIdleTtlMs: number;
  principalAbsoluteTtlMs: number;
  tombstoneTtlMs: number;
  tombstoneGraceMs: number;
  tokenPrefixes: SessionKernelTokenPrefixes;
  clock: SessionKernelClock;
};

export const systemSessionKernelClock: SessionKernelClock = {
  now: () => Date.now(),
};

const defaultTokenPrefixes: SessionKernelTokenPrefixes = {
  principalSession: "iam_ps_",
  authCode: "iam_ac_",
  localSession: "iam_ls_",
  oidcReturnHandle: "iam_or_",
  credential: "iam_cr_",
  artifact: "iam_pa_",
};

export function createSessionKernelConfig(input: SessionKernelConfigInput): SessionKernelConfig {
  if (!Number.isInteger(input.principalIdleTtlMs) || input.principalIdleTtlMs <= 0)
    throw new Error("principalIdleTtlMs must be a positive integer");
  if (!Number.isInteger(input.principalAbsoluteTtlMs) || input.principalAbsoluteTtlMs <= 0)
    throw new Error("principalAbsoluteTtlMs must be a positive integer");
  if (input.principalAbsoluteTtlMs < input.principalIdleTtlMs)
    throw new Error("principalAbsoluteTtlMs must be greater than or equal to principalIdleTtlMs");

  return {
    namespace: normalizeNamespace(input.namespace ?? DEFAULT_SESSION_KERNEL_NAMESPACE),
    principalIdleTtlMs: input.principalIdleTtlMs,
    principalAbsoluteTtlMs: input.principalAbsoluteTtlMs,
    tombstoneTtlMs: input.tombstoneTtlMs ?? 24 * 60 * 60 * 1000,
    tombstoneGraceMs: input.tombstoneGraceMs ?? 5 * 60 * 1000,
    tokenPrefixes: { ...defaultTokenPrefixes, ...input.tokenPrefixes },
    clock: input.clock ?? systemSessionKernelClock,
  };
}

export function normalizeSessionKernelConfig(input: SessionKernelConfigInput | SessionKernelConfig) {
  return createSessionKernelConfig(input);
}

function normalizeNamespace(namespace: string) {
  return namespace.endsWith(":") ? namespace : `${namespace}:`;
}
