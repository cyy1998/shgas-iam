import type { Env } from "@admin-api/env";
import type { ClientDto } from "@admin-api/services/client/client.type";
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
    adminRoleCodes: string[];
  };
  sessionKernel: {
    namespace: string;
    principalIdleTtlMs: number;
    principalAbsoluteTtlMs: number;
    lookupHmacKeys: {
      current: {
        id: string;
        secret: string;
      };
      previous?: {
        id: string;
        secret: string;
      };
    };
    tombstoneTtlMs: number;
    tombstoneGraceMs: number;
  };
}

export interface ClientCachePort {
  setClient: (client: ClientDto) => Promise<unknown>;
  deleteClient: (client: Pick<ClientDto, "clientCode" | "clientSecret">) => Promise<unknown>;
  syncUpdatedClient: (oldClient: ClientDto, newClient: ClientDto) => Promise<unknown>;
}

export interface OidcInvalidationPort {
  invalidateClient: (client: { id: number; clientCode: string; oidcConfigVersion: number }) => Promise<unknown>;
}

export interface AdminApiIntegrationPorts {
  clientCache: ClientCachePort;
  oidcInvalidation: OidcInvalidationPort;
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
