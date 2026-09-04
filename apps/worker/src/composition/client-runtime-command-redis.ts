import type {
  ClientRuntimeRestoreRepairRedis,
  ClientRuntimeRestoreScanRedis,
} from "@iam/api-core/client-runtime-snapshot/redis-maintenance";
import type { ClientRuntimeMaintenanceCommandEnv } from "@worker/env";
import type { Redis as RedisType } from "ioredis";
import type { WorkerLogger } from "./runtime";
import Redis from "ioredis";
import { closeWorkerCommandResources } from "./command-shutdown";

interface ClientRuntimeTargetedRepairRedis {
  readonly eval: (
    script: string,
    keyCount: number,
    ...args: string[]
  ) => Promise<unknown>;
}

type ClientRuntimeCommandRepairRedis
  = ClientRuntimeTargetedRepairRedis & ClientRuntimeRestoreRepairRedis;

interface ClientRuntimeCommandRedisOptions {
  readonly config: ClientRuntimeMaintenanceCommandEnv["redis"];
  readonly logger: WorkerLogger;
}

export function createClientRuntimeRepairCommandRedis(
  options: ClientRuntimeCommandRedisOptions,
) {
  const connection = createCommandRedisConnection({
    ...options,
    operation: "repair",
  });
  const redis: ClientRuntimeCommandRepairRedis = {
    ...createScanRedis(connection.execute),
    async eval(script, keyCount, ...args) {
      return await connection.execute(async client =>
        await client.eval(script, keyCount, ...args));
    },
    async unlink(...keys) {
      return await connection.execute(async client => await client.unlink(...keys));
    },
  };
  return { redis, shutdown: connection.shutdown };
}

export function createClientRuntimeVerifyCommandRedis(
  options: ClientRuntimeCommandRedisOptions,
) {
  const connection = createCommandRedisConnection({
    ...options,
    operation: "verify",
  });
  return {
    redis: createScanRedis(connection.execute),
    shutdown: connection.shutdown,
  };
}

function createScanRedis(
  execute: <T>(operation: (client: RedisType) => Promise<T>) => Promise<T>,
): ClientRuntimeRestoreScanRedis {
  return {
    async scan(cursor, matchToken, pattern, countToken, count) {
      return await execute(async client =>
        await client.scan(cursor, matchToken, pattern, countToken, count));
    },
  };
}

function createCommandRedisConnection(
  options: ClientRuntimeCommandRedisOptions & {
    readonly operation: "repair" | "verify";
  },
) {
  const client = new Redis({
    ...options.config,
    commandTimeout: 10_000,
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  client.on("error", () => {});

  let connection: Promise<void> | undefined;
  async function execute<T>(operation: (redis: RedisType) => Promise<T>) {
    connection ??= client.connect();
    await connection;
    return await operation(client);
  }

  async function shutdown(signal: string) {
    try {
      options.logger.info(
        { signal },
        `Client Runtime ${options.operation} command shutting down`,
      );
    }
    catch {}
    await closeWorkerCommandResources([Promise.resolve(client.disconnect())]);
  }

  return { execute, shutdown };
}
