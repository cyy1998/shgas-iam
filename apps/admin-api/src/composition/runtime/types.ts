import type { Env } from "@admin-api/env";
import type {
  AdminClientCachePort,
  AdminClientRuntimeInvalidationPort,
} from "@admin-api/services/client/client.port";
import type { SessionKernelConfig } from "@iam/api-core/session/kernel";
import type Redis from "ioredis";
import type { Logger } from "pino";

export type LoggerPort = Pick<Logger, "debug" | "info" | "warn" | "error" | "child">;
export type AfterCommitLoggerPort = Pick<Logger, "warn" | "error">;
export type RedisPort = Redis;

export interface PasswordHasherPort {
  hashPassword: (password: string) => Promise<string>;
  hashSecret: (secret: string) => Promise<string>;
}

export interface RandomPort {
  uuid: () => string;
  customSsoClientSecret: () => string;
  oidcClientSecret: () => string;
  password: (length: number) => string;
  integer: (min: number, max: number) => number;
  bytes: (size: number) => Uint8Array;
}

export interface ClockPort {
  now: () => number;
  nowDate: () => Date;
}

export interface AdminApiRuntimeConfig {
  env: Env;
  auth: {
    adminClientCodes: string[];
  };
  sessionKernel: SessionKernelConfig;
}

export interface AdminApiIntegrationPorts {
  clientCache: AdminClientCachePort;
  clientRuntimeInvalidation: AdminClientRuntimeInvalidationPort;
}

export interface AdminApiRuntimePorts {
  logger: LoggerPort;
  afterCommitLogger: AfterCommitLoggerPort;
  redis: RedisPort;
  passwordHasher: PasswordHasherPort;
  random: RandomPort;
  clock: ClockPort;
  config: AdminApiRuntimeConfig;
  integrations: AdminApiIntegrationPorts;
}
