import type { LoggerPort, RedisPort } from "@api/composition/runtime";
import type { HumanVerificationAction } from "@api/enums/humanVerification.action";
import type { HumanVerificationContext } from "./human-verification.type";

export interface HumanRiskServicePort {
  shouldRequireVerification: (action: HumanVerificationAction, context: HumanVerificationContext) => Promise<boolean>;
  recordLoginFailure: (
    action: HumanVerificationAction.PasswordLogin | HumanVerificationAction.MobileLogin,
    context: HumanVerificationContext,
  ) => Promise<void>;
  recordOpenUserInfoLookup: (username: string, context: HumanVerificationContext) => Promise<void>;
}

export interface HumanRiskServiceDeps {
  redis: Pick<RedisPort, "get" | "multi" | "scard">;
  config: {
    capEnabled: boolean;
    windowSeconds: number;
    loginFailureThreshold: number;
    lookupThreshold: number;
  };
}

export interface CapChallengePort {
  createChallenge: (input: { expiresMs: number }) => Promise<{
    challenge: {
      c: number;
      s: number;
      d: number;
    };
    token?: string;
    expires: number;
  }>;
  redeemChallenge: (input: { token: string; solutions: number[] }) => Promise<{
    success: boolean;
    token?: string;
  }>;
  validateToken: (token: string) => Promise<{ success: boolean }>;
}

export interface CapServiceDeps {
  capClient: CapChallengePort;
  redis: Pick<RedisPort, "get" | "set" | "del">;
  logger: LoggerPort;
  riskService: Pick<HumanRiskServicePort, "shouldRequireVerification">;
  config: {
    capEnabled: boolean;
    siteKey: string;
    secret: string;
    challengeTtlMs: number;
    tokenTtlSeconds: number;
  };
}
