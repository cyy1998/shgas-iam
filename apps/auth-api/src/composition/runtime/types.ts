import type { Env } from "@auth-api/env";
import type { WechatQrIdentity } from "@auth-api/services/authentication/wechat-qr-identity.type";
import type { AfterCommitLoggerPort } from "@iam/unit-of-work";
import type Redis from "ioredis";
import type { Logger } from "pino";

export type LoggerPort = Pick<Logger, "debug" | "info" | "warn" | "error" | "child">;
export type RedisPort = Redis;

export interface PasswordHasherPort {
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
}

export interface RandomPort {
  uuid: () => string;
  integer: (min: number, max: number) => number;
  bytes: (size: number) => Uint8Array;
}

export interface ClockPort {
  now: () => number;
  nowDate: () => Date;
}

export interface ApiRuntimeConfig {
  env: Env;
  auth: {
    magicCode: string;
  };
  cap: {
    enabled: boolean;
    siteKey: string;
    secret: string;
    challengeTtlMs: number;
    tokenTtlSeconds: number;
  };
  humanVerification: {
    imageCaptchaEnabled: boolean;
    windowSeconds: number;
    loginFailureThreshold: number;
    lookupThreshold: number;
  };
  loginCredential: {
    activeKid: string;
    privateKeysByKid: Record<string, string>;
    maxSkewMs: number;
    nonceTtlSeconds: number;
  };
  sessionKernel: {
    namespace: string;
    userSessionTtlSeconds: number;
    clientSessionTtlSeconds: number;
  };
}

export interface CapIntegrationPort {
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

export interface SmsIntegrationPort {
  sendVerificationCode: (phoneNumber: string) => Promise<{ success: boolean; code: number | string }>;
  sendMessage: (phoneNumber: string, message: string) => Promise<unknown>;
}

export interface WechatIntegrationPort {
  getWxUserId: (code: string) => Promise<string>;
  getQrIdentity: (code: string) => Promise<WechatQrIdentity>;
}

export interface ApiIntegrationPorts {
  cap: CapIntegrationPort;
  wechat: WechatIntegrationPort;
  sms: SmsIntegrationPort;
}

export interface ApiRuntimePorts {
  logger: Logger;
  afterCommitLogger: AfterCommitLoggerPort;
  redis: RedisPort;
  passwordHasher: PasswordHasherPort;
  random: RandomPort;
  clock: ClockPort;
  config: ApiRuntimeConfig;
  integrations: ApiIntegrationPorts;
}
