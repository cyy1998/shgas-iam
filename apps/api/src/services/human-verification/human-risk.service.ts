import type { HumanRiskServiceDeps } from "./human-verification.port";
import type { HumanVerificationContext } from "./human-verification.type";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";

type Dimension = "subject" | "ip";

const LOOKUP_USERNAMES_DIMENSIONS: Dimension[] = ["ip"];
const LOGIN_FAILURE_DIMENSIONS: Dimension[] = ["subject", "ip"];

function normalizeValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function countKey(action: HumanVerificationAction, dimension: Dimension, value: string) {
  return `human-risk:${action}:${dimension}:${value}`;
}

function lookupUsernamesKey(dimension: Dimension, value: string) {
  return `human-risk:${HumanVerificationAction.OpenUserInfoLookup}:usernames:${dimension}:${value}`;
}

function contextEntries(context: HumanVerificationContext, dimensions: Dimension[]) {
  return dimensions.flatMap((dimension) => {
    const value = normalizeValue(context[dimension]);
    return value === null ? [] : [{ dimension, value }];
  });
}

export function createHumanRiskService(deps: HumanRiskServiceDeps) {
  async function getCount(action: HumanVerificationAction, dimension: Dimension, value: string) {
    const count = await deps.redis.get(countKey(action, dimension, value));
    return Number(count ?? 0);
  }

  async function incrementCount(action: HumanVerificationAction, dimension: Dimension, value: string) {
    const key = countKey(action, dimension, value);
    await deps.redis.multi()
      .incr(key)
      .expire(key, deps.config.windowSeconds)
      .exec();
  }

  async function shouldRequireVerification(
    action: HumanVerificationAction,
    context: HumanVerificationContext,
  ): Promise<boolean> {
    if (!deps.config.capEnabled) {
      return false;
    }
    if (action === HumanVerificationAction.SendSmsCode) {
      return true;
    }
    if (action === HumanVerificationAction.OpenUserInfoLookup) {
      const entries = contextEntries(context, LOOKUP_USERNAMES_DIMENSIONS);
      const counts = await Promise.all(entries.map(async entry => deps.redis.scard(
        lookupUsernamesKey(entry.dimension, entry.value),
      )));
      return counts.some(count => count >= deps.config.lookupThreshold);
    }

    const entries = contextEntries(context, LOGIN_FAILURE_DIMENSIONS);
    const counts = await Promise.all(entries.map(async entry => getCount(action, entry.dimension, entry.value)));
    return counts.some(count => count >= deps.config.loginFailureThreshold);
  }

  async function recordLoginFailure(
    action: HumanVerificationAction.PasswordLogin | HumanVerificationAction.MobileLogin,
    context: HumanVerificationContext,
  ) {
    const entries = contextEntries(context, LOGIN_FAILURE_DIMENSIONS);
    await Promise.all(entries.map(entry => incrementCount(action, entry.dimension, entry.value)));
  }

  async function recordOpenUserInfoLookup(username: string, context: HumanVerificationContext) {
    const normalizedUsername = normalizeValue(username);
    if (normalizedUsername === null) {
      return;
    }
    const entries = contextEntries(context, LOOKUP_USERNAMES_DIMENSIONS);
    await Promise.all(entries.map(async (entry) => {
      const key = lookupUsernamesKey(entry.dimension, entry.value);
      await deps.redis.multi()
        .sadd(key, normalizedUsername)
        .expire(key, deps.config.windowSeconds)
        .exec();
    }));
  }

  return {
    shouldRequireVerification,
    recordLoginFailure,
    recordOpenUserInfoLookup,
  };
}

export type HumanRiskService = ReturnType<typeof createHumanRiskService>;
