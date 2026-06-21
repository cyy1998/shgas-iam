import type { SessionKernelConfig } from "./config";
import type { FreshnessRequirement, PrincipalSession, RenewalPolicy } from "./model";

export type PrincipalSessionWindow = {
  authTime: number;
  lastActiveAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
};

export type FreshnessEvaluation
  = | { satisfied: true }
    | {
      satisfied: false;
      reasons: FreshnessFailureReason[];
    };

export type FreshnessFailureReason = "force_reauthentication" | "max_age_exceeded" | "amr_missing" | "acr_too_low";

export function createPrincipalSessionWindow(now: number, config: SessionKernelConfig): PrincipalSessionWindow {
  const absoluteExpiresAt = now + config.principalAbsoluteTtlMs;
  return {
    authTime: now,
    lastActiveAt: now,
    absoluteExpiresAt,
    expiresAt: Math.min(now + config.principalIdleTtlMs, absoluteExpiresAt),
  };
}

export function calculateRenewedPrincipalSessionWindow(
  session: PrincipalSession,
  now: number,
  config: Pick<SessionKernelConfig, "principalIdleTtlMs">,
): PrincipalSessionWindow | null {
  if (session.expiresAt <= now || session.absoluteExpiresAt <= now)
    return null;
  return {
    authTime: session.authTime,
    lastActiveAt: now,
    absoluteExpiresAt: session.absoluteExpiresAt,
    expiresAt: Math.min(now + config.principalIdleTtlMs, session.absoluteExpiresAt),
  };
}

export function clampDerivedExpiresAt(input: {
  now: number;
  ttlMs?: number;
  expiresAt?: number;
  principalSession?: Pick<PrincipalSession, "expiresAt" | "absoluteExpiresAt">;
}) {
  const requested = input.expiresAt ?? input.now + (input.ttlMs ?? Number.POSITIVE_INFINITY);
  const principalLimit = input.principalSession
    ? Math.min(input.principalSession.expiresAt, input.principalSession.absoluteExpiresAt)
    : Number.POSITIVE_INFINITY;
  return Math.min(requested, principalLimit);
}

export function ttlMsUntil(expiresAt: number, now: number) {
  return Math.max(0, expiresAt - now);
}

export function calculateTombstoneExpiresAt(objectExpiresAt: number, now: number, config: SessionKernelConfig) {
  return Math.max(now + config.tombstoneTtlMs, Math.max(objectExpiresAt, now) + config.tombstoneGraceMs);
}

export function evaluateFreshness(
  session: PrincipalSession,
  requirement: FreshnessRequirement,
  now = Date.now(),
): FreshnessEvaluation {
  const reasons: FreshnessFailureReason[] = [];

  if (requirement.forceReauthentication)
    reasons.push("force_reauthentication");
  if (requirement.maxAgeSeconds !== undefined && now - session.authTime > requirement.maxAgeSeconds * 1000)
    reasons.push("max_age_exceeded");
  if (requirement.requiredAmr?.some(method => !session.amr.includes(method)))
    reasons.push("amr_missing");
  if (requirement.minimumAcr && !satisfiesMinimumAcr(session.acr, requirement.minimumAcr, requirement.acrRank))
    reasons.push("acr_too_low");

  return reasons.length === 0 ? { satisfied: true } : { satisfied: false, reasons };
}

export function canRenewWithPrincipal(policy: RenewalPolicy) {
  return policy === "extend_with_principal";
}

function satisfiesMinimumAcr(actual: string | undefined, minimum: string, rank?: Record<string, number>) {
  if (!actual)
    return false;
  if (rank)
    return (rank[actual] ?? Number.NEGATIVE_INFINITY) >= (rank[minimum] ?? Number.POSITIVE_INFINITY);

  const actualNumber = Number(actual);
  const minimumNumber = Number(minimum);
  if (Number.isFinite(actualNumber) && Number.isFinite(minimumNumber))
    return actualNumber >= minimumNumber;
  return actual === minimum;
}
