export type ParsedTestRedisUrl = {
  baseUrl: string;
  host: string;
  connectHost: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
};

export type RedisPreflightOptions = {
  requiredSlot?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function parseTestRedisUrl(rawUrl: string, envName?: string): ParsedTestRedisUrl;
export function formatRedisSlotUrl(rawUrl: string, slot: number, envName?: string): string;
export function redactRedisUrl(rawUrl: string): string;
export function verifyRedisDatabaseSlotSupport(rawUrl: string, options?: RedisPreflightOptions): Promise<void>;
