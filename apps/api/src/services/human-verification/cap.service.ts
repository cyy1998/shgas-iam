import type { CapServiceDeps } from "./human-verification.port";
import type { HumanVerificationContext } from "./human-verification.type";
import { createHmac } from "node:crypto";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { SystemLogEvent } from "@iam/api-core/logger";
import { HumanVerificationRequiredError } from "./human-verification.error";

type RedeemInput = {
  token?: string;
  solutions?: number[];
};

const tokenActionKey = (secret: string, token: string) => `cap:token-action:${hashToken(secret, token)}`;

function hashToken(secret: string, token: string) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function createCapService(deps: CapServiceDeps) {
  function isValidSiteKey(siteKey: string) {
    return siteKey === deps.config.siteKey;
  }

  async function createChallenge() {
    return await deps.capClient.createChallenge({ expiresMs: deps.config.challengeTtlMs });
  }

  async function redeemChallenge(input: RedeemInput, action?: string) {
    if (!input.token || !Array.isArray(input.solutions)) {
      return { success: false };
    }
    const result = await deps.capClient.redeemChallenge({
      token: input.token,
      solutions: input.solutions,
    });
    if (result.success && result.token && action && isHumanVerificationAction(action)) {
      await deps.redis.set(
        tokenActionKey(deps.config.secret, result.token),
        action,
        "EX",
        deps.config.tokenTtlSeconds,
      );
    }
    return result;
  }

  function isHumanVerificationAction(value: string): value is HumanVerificationAction {
    return Object.values(HumanVerificationAction).includes(value as HumanVerificationAction);
  }

  async function verifyTokenForAction(action: HumanVerificationAction, token?: string) {
    if (!deps.config.capEnabled) {
      return;
    }
    if (!token) {
      deps.logger.warn({ event: SystemLogEvent.HumanVerificationMissing, action }, "human verification token missing");
      throw new HumanVerificationRequiredError();
    }

    const actionKey = tokenActionKey(deps.config.secret, token);
    const storedAction = await deps.redis.get(actionKey);
    if (storedAction !== action) {
      await deps.redis.del(actionKey);
      deps.logger.warn({ event: SystemLogEvent.HumanVerificationMismatch, action, storedAction }, "human verification token action mismatch");
      throw new HumanVerificationRequiredError();
    }

    const result = await deps.capClient.validateToken(token);
    await deps.redis.del(actionKey);
    if (!result.success) {
      deps.logger.warn({ event: SystemLogEvent.HumanVerificationFailed, action }, "human verification token validation failed");
      throw new HumanVerificationRequiredError();
    }
    deps.logger.info({ event: SystemLogEvent.HumanVerificationValidated, action }, "human verification token validated");
  }

  async function ensureActionAllowed(
    action: HumanVerificationAction,
    token: string | undefined,
    context: HumanVerificationContext,
  ) {
    if (await deps.riskService.shouldRequireVerification(action, context)) {
      deps.logger.info({
        event: SystemLogEvent.HumanVerificationRequired,
        action,
        hasToken: token !== undefined,
        ip: context.ip,
        subject: context.subject,
      }, "human verification required for action");
      await verifyTokenForAction(action, token);
    }
  }

  return {
    isValidSiteKey,
    createChallenge,
    redeemChallenge,
    isHumanVerificationAction,
    verifyTokenForAction,
    ensureActionAllowed,
    HumanVerificationAction,
  };
}

export { HumanVerificationAction };
export type CapService = ReturnType<typeof createCapService>;
