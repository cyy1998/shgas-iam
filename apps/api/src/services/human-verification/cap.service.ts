import type { HumanVerificationContext } from "./human-verification.type";
import { createHmac } from "node:crypto";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import config from "@api/env";
import redis from "@api/lib/infra/redis";
import capClient from "@api/lib/integrations/cap";
import { logger } from "@api/lib/logger";
import * as riskService from "./human-risk.service";
import { HumanVerificationRequiredError } from "./human-verification.error";

type RedeemInput = {
  token?: string;
  solutions?: number[];
};

const tokenActionKey = (token: string) => `cap:token-action:${hashToken(token)}`;

function hashToken(token: string) {
  return createHmac("sha256", config.CAP_SECRET).update(token).digest("hex");
}

export function isValidSiteKey(siteKey: string) {
  return siteKey === config.CAP_SITE_KEY;
}

export async function createChallenge() {
  return await capClient.createChallenge({ expiresMs: config.CAP_CHALLENGE_TTL_MS });
}

export async function redeemChallenge(input: RedeemInput, action?: string) {
  if (!input.token || !Array.isArray(input.solutions)) {
    return { success: false };
  }
  const result = await capClient.redeemChallenge({
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

  const result = await capClient.validateToken(token);
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
      hasToken: token !== undefined,
      ip: context.ip,
      subject: context.subject,
    }, "human verification required for action");
    await verifyTokenForAction(action, token);
  }
}

export { HumanVerificationAction };
