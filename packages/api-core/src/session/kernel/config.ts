export const DEFAULT_SESSION_KERNEL_NAMESPACE = "sess:v2:";
export const MIN_LOOKUP_HMAC_SECRET_BYTES = 32;

export type SessionKernelClock = {
  now: () => number;
};

export type SessionKernelHmacKeyInput = {
  id: string;
  secret: string | Uint8Array;
};

export type SessionKernelHmacKey = {
  id: string;
  secret: Uint8Array;
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
  lookupHmacKeys: {
    current: SessionKernelHmacKeyInput;
    previous?: SessionKernelHmacKeyInput;
  };
  tombstoneTtlMs?: number;
  tombstoneGraceMs?: number;
  tokenPrefixes?: Partial<SessionKernelTokenPrefixes>;
  clock?: SessionKernelClock;
};

export type SessionKernelConfig = {
  namespace: string;
  principalIdleTtlMs: number;
  principalAbsoluteTtlMs: number;
  lookupHmacKeys: {
    current: SessionKernelHmacKey;
    previous?: SessionKernelHmacKey;
  };
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

  const current = normalizeHmacKey(input.lookupHmacKeys.current, "current");
  const previous = input.lookupHmacKeys.previous
    ? normalizeHmacKey(input.lookupHmacKeys.previous, "previous")
    : undefined;

  if (previous) {
    if (previous.id === current.id)
      throw new Error("current and previous lookup HMAC key ids must be different");
    if (secretFingerprint(previous.secret) === secretFingerprint(current.secret))
      throw new Error("current and previous lookup HMAC secrets must be different");
  }

  return {
    namespace: normalizeNamespace(input.namespace ?? DEFAULT_SESSION_KERNEL_NAMESPACE),
    principalIdleTtlMs: input.principalIdleTtlMs,
    principalAbsoluteTtlMs: input.principalAbsoluteTtlMs,
    lookupHmacKeys: { current, previous },
    tombstoneTtlMs: input.tombstoneTtlMs ?? 24 * 60 * 60 * 1000,
    tombstoneGraceMs: input.tombstoneGraceMs ?? 5 * 60 * 1000,
    tokenPrefixes: { ...defaultTokenPrefixes, ...input.tokenPrefixes },
    clock: input.clock ?? systemSessionKernelClock,
  };
}

export function isSessionKernelConfig(
  value: SessionKernelConfigInput | SessionKernelConfig,
): value is SessionKernelConfig {
  return value.lookupHmacKeys.current.secret instanceof Uint8Array
    && "namespace" in value
    && "tokenPrefixes" in value
    && "clock" in value;
}

export function normalizeSessionKernelConfig(input: SessionKernelConfigInput | SessionKernelConfig) {
  return isSessionKernelConfig(input) ? input : createSessionKernelConfig(input);
}

function normalizeNamespace(namespace: string) {
  return namespace.endsWith(":") ? namespace : `${namespace}:`;
}

function normalizeHmacKey(input: SessionKernelHmacKeyInput, label: string): SessionKernelHmacKey {
  if (input.id.trim().length === 0)
    throw new Error(`${label} lookup HMAC key id is required`);
  const secret = typeof input.secret === "string"
    ? new TextEncoder().encode(input.secret)
    : input.secret;
  if (secret.byteLength < MIN_LOOKUP_HMAC_SECRET_BYTES) {
    throw new Error(`${label} lookup HMAC secret must be at least ${MIN_LOOKUP_HMAC_SECRET_BYTES} bytes`);
  }
  return { id: input.id, secret };
}

function secretFingerprint(secret: Uint8Array) {
  return [...secret].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
