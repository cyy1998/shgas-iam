import type { HumanVerificationContext } from "./human-verification.type";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import config from "@api/env";
import redis from "@api/lib/clients/redis";

type Dimension = "subject" | "ip" | "client";

const LOOKUP_USERNAMES_DIMENSIONS: Dimension[] = ["ip", "client"];
const LOGIN_FAILURE_DIMENSIONS: Dimension[] = ["subject", "ip", "client"];

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

async function getCount(action: HumanVerificationAction, dimension: Dimension, value: string) {
  const count = await redis.get(countKey(action, dimension, value));
  return Number(count ?? 0);
}

async function incrementCount(action: HumanVerificationAction, dimension: Dimension, value: string) {
  const key = countKey(action, dimension, value);
  await redis.multi()
    .incr(key)
    .expire(key, config.HUMAN_VERIFICATION_WINDOW_SECONDS)
    .exec();
}

export async function shouldRequireVerification(
  action: HumanVerificationAction,
  context: HumanVerificationContext,
): Promise<boolean> {
  if (!config.CAP_ENABLED) {
    return false;
  }
  if (action === HumanVerificationAction.SendSmsCode) {
    return true;
  }
  if (action === HumanVerificationAction.OpenUserInfoLookup) {
    const entries = contextEntries(context, LOOKUP_USERNAMES_DIMENSIONS);
    const counts = await Promise.all(entries.map(async entry => redis.scard(
      lookupUsernamesKey(entry.dimension, entry.value),
    )));
    return counts.some(count => count >= config.HUMAN_VERIFICATION_LOOKUP_THRESHOLD);
  }

  const entries = contextEntries(context, LOGIN_FAILURE_DIMENSIONS);
  const counts = await Promise.all(entries.map(async entry => getCount(action, entry.dimension, entry.value)));
  return counts.some(count => count >= config.HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD);
}

export async function recordLoginFailure(
  action: HumanVerificationAction.PasswordLogin | HumanVerificationAction.MobileLogin,
  context: HumanVerificationContext,
) {
  const entries = contextEntries(context, LOGIN_FAILURE_DIMENSIONS);
  await Promise.all(entries.map(entry => incrementCount(action, entry.dimension, entry.value)));
}

export async function recordOpenUserInfoLookup(username: string, context: HumanVerificationContext) {
  const normalizedUsername = normalizeValue(username);
  if (normalizedUsername === null) {
    return;
  }
  const entries = contextEntries(context, LOOKUP_USERNAMES_DIMENSIONS);
  await Promise.all(entries.map(async (entry) => {
    const key = lookupUsernamesKey(entry.dimension, entry.value);
    await redis.multi()
      .sadd(key, normalizedUsername)
      .expire(key, config.HUMAN_VERIFICATION_WINDOW_SECONDS)
      .exec();
  }));
}
