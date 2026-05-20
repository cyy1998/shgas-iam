import type { HumanVerificationContext } from "./human-verification.type";
import { createHmac } from "node:crypto";
import config from "@api/env";
import redis from "@api/lib/clients/redis";
import { logger } from "@api/lib/logger";
import Cap from "@cap.js/server";
import { createSingleton } from "@iam/api-core/core/singleton";
import * as riskService from "./human-risk.service";
import { HumanVerificationRequiredError } from "./human-verification.error";
import { HumanVerificationAction } from "./human-verification.type";

type ChallengeData = {
  challenge: {
    c: number;
    s: number;
    d: number;
  };
  expires: number;
};

type RedeemInput = {
  token?: string;
  solutions?: number[];
};

const challengeKey = (token: string) => `cap:challenge:${token}`;
const tokenKey = (key: string) => `cap:token:${key}`;
const tokenActionKey = (token: string) => `cap:token-action:${hashToken(token)}`;

function ttlSeconds(expires: number) {
  return Math.max(1, Math.ceil((expires - Date.now()) / 1000));
}

function hashToken(token: string) {
  return createHmac("sha256", config.CAP_SECRET).update(token).digest("hex");
}

function parseChallenge(value: string | null): ChallengeData | null {
  if (value === null) {
    return null;
  }
  const data = JSON.parse(value) as ChallengeData;
  if (data.expires <= Date.now()) {
    return null;
  }
  return data;
}

export const cap = createSingleton("api:human-verification:cap", () =>
  new Cap({
    storage: {
      challenges: {
        async store(token, challengeData) {
          await redis.set(challengeKey(token), JSON.stringify(challengeData), "EX", ttlSeconds(challengeData.expires));
        },
        async read(token) {
          return parseChallenge(await redis.get(challengeKey(token)));
        },
        async delete(token) {
          await redis.del(challengeKey(token));
        },
        async deleteExpired() {
          // Redis TTL removes expired challenges.
        },
      },
      tokens: {
        async store(key, expires) {
          await redis.set(tokenKey(key), String(expires), "EX", ttlSeconds(expires));
        },
        async get(key) {
          const expires = Number(await redis.get(tokenKey(key)));
          return Number.isFinite(expires) && expires > Date.now() ? expires : null;
        },
        async delete(key) {
          await redis.del(tokenKey(key));
        },
        async deleteExpired() {
          // Redis TTL removes expired tokens.
        },
      },
    },
  }));

export function isValidSiteKey(siteKey: string) {
  return siteKey === config.CAP_SITE_KEY;
}

export async function createChallenge() {
  return await cap.createChallenge({ expiresMs: config.CAP_CHALLENGE_TTL_MS });
}

export async function redeemChallenge(input: RedeemInput, action?: string) {
  if (!input.token || !Array.isArray(input.solutions)) {
    return { success: false };
  }
  const result = await cap.redeemChallenge({
    token: input.token,
    solutions: input.solutions,
  });
  if (result.success && result.token && action && isHumanVerificationAction(action)) {
    await redis.set(tokenActionKey(result.token), action, "EX", config.CAP_TOKEN_TTL_SECONDS);
  }
  return result;
}

export function isHumanVerificationAction(value: string): value is HumanVerificationAction {
  return Object.values(HumanVerificationAction).includes(value as HumanVerificationAction);
}

export async function verifyTokenForAction(action: HumanVerificationAction, token?: string) {
  if (!config.CAP_ENABLED) {
    return;
  }
  if (!token) {
    logger.warn({ action }, "human verification token missing");
    throw new HumanVerificationRequiredError();
  }

  const actionKey = tokenActionKey(token);
  const storedAction = await redis.get(actionKey);
  if (storedAction !== action) {
    await redis.del(actionKey);
    logger.warn({ action, storedAction }, "human verification token action mismatch");
    throw new HumanVerificationRequiredError();
  }

  const result = await cap.validateToken(token);
  await redis.del(actionKey);
  if (!result.success) {
    logger.warn({ action }, "human verification token validation failed");
    throw new HumanVerificationRequiredError();
  }
  logger.info({ action }, "human verification token validated");
}

export async function ensureActionAllowed(
  action: HumanVerificationAction,
  token: string | undefined,
  context: HumanVerificationContext,
) {
  if (await riskService.shouldRequireVerification(action, context)) {
    logger.info({
      action,
      client: context.client,
      hasToken: token !== undefined,
      ip: context.ip,
      subject: context.subject,
    }, "human verification required for action");
    await verifyTokenForAction(action, token);
  }
}

export { HumanVerificationAction };
