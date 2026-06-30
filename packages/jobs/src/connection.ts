import type { QueueOptions } from "bullmq";
import type { RedisOptions } from "ioredis";
import Redis from "ioredis";

export interface BullMqRedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  username?: string;
  tls?: RedisOptions["tls"];
}

export interface CreateBullMqConnectionOptions {
  connectionName?: string;
  lazyConnect?: boolean;
  maxRetriesPerRequest?: RedisOptions["maxRetriesPerRequest"];
}

export function createBullMqConnection(
  config: BullMqRedisConfig,
  options: CreateBullMqConnectionOptions = {},
): Redis {
  return new Redis(resolveRedisOptions(config, options));
}

export function createBullMqConnectionOptions(
  config: BullMqRedisConfig,
  options: CreateBullMqConnectionOptions = {},
): QueueOptions["connection"] {
  return resolveRedisOptions(config, options) as QueueOptions["connection"];
}

function resolveRedisOptions(config: BullMqRedisConfig, options: CreateBullMqConnectionOptions): RedisOptions {
  return {
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    username: config.username,
    tls: config.tls,
    connectionName: options.connectionName,
    lazyConnect: options.lazyConnect,
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? null,
  };
}
