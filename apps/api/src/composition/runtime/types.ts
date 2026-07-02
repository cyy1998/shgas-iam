import type { Env } from "@api/env";
import type { SessionKernelConfig } from "@iam/api-core/session/kernel";
import type Redis from "ioredis";
import type { Logger } from "pino";

export type LoggerPort = Pick<Logger, "debug" | "info" | "warn" | "error" | "child">;
export type AfterCommitLoggerPort = Pick<Logger, "warn" | "error">;
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
    authCodeExpireSeconds: number;
    redisExpireSeconds: number;
  };
  cap: {
    enabled: boolean;
    siteKey: string;
    secret: string;
    challengeTtlMs: number;
    tokenTtlSeconds: number;
  };
  humanVerification: {
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
  sessionKernel: SessionKernelConfig;
  userProfile: {
    dslMaxLimit: number;
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

export interface OrcasIntegrationPort {
  orcasLogin: (input: {
    id: number;
    username: string;
    name: string;
    mobile?: string | null;
  }) => Promise<{ orcasSessionId: string; orcasId: string }>;
}

export interface WechatIntegrationPort {
  getWxUserId: (code: string) => Promise<string>;
}

export interface ApiIntegrationPorts {
  cap: CapIntegrationPort;
  wechat: WechatIntegrationPort;
  orcas: OrcasIntegrationPort;
  sms: SmsIntegrationPort;
}

export interface ApiRuntimePorts {
  logger: LoggerPort;
  afterCommitLogger: AfterCommitLoggerPort;
  redis: RedisPort;
  passwordHasher: PasswordHasherPort;
  random: RandomPort;
  clock: ClockPort;
  config: ApiRuntimeConfig;
  integrations: ApiIntegrationPorts;
}
