import { createRedisClient } from "@iam/runtime/redis/connection";
import type { WorkerEnv } from "@worker/env";
import type Redis from "ioredis";
import type { Logger } from "pino";

export type WorkerLogger = Pick<Logger, "debug" | "info" | "warn" | "error" | "child">;

export interface WorkerRuntime {
  env: WorkerEnv;
  logger: WorkerLogger;
  redis: Redis;
  clock: {
    now: () => number;
    nowDate: () => Date;
  };
  config: {
    redis: WorkerEnv["redis"];
    userDocument: WorkerEnv["userDocument"];
    organizationDocument: WorkerEnv["organizationDocument"];
  };
}

export interface CreateWorkerRuntimeOptions {
  env: WorkerEnv;
  logger: WorkerLogger;
  redis?: Redis;
}

export function createWorkerRuntime(options: CreateWorkerRuntimeOptions): WorkerRuntime {
  const redis = options.redis ?? createRedisClient(options.env.redis);

  return {
    env: options.env,
    logger: options.logger,
    redis,
    clock: {
      now: Date.now,
      nowDate() {
        return new Date();
      },
    },
    config: {
      redis: options.env.redis,
      userDocument: options.env.userDocument,
      organizationDocument: options.env.organizationDocument,
    },
  };
}
