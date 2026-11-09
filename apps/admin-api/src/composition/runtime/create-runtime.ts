import { randomBytes, randomInt, randomUUID } from "node:crypto";
import env from "@admin-api/env";
import redis from "@admin-api/lib/infra/redis";
import { logger } from "@admin-api/lib/logger";
import { hashSecret } from "@iam/runtime/security/bcrypt";
import { createAdminClientCache } from "./client-cache";
import type { AdminApiRuntimePorts } from "./types";

export interface CreateAdminApiRuntimeOptions {
  env?: typeof env;
  logger?: typeof logger;
  redis?: typeof redis;
}

function generateRandomPassword(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function createAdminApiRuntime(options: CreateAdminApiRuntimeOptions = {}): AdminApiRuntimePorts {
  const runtimeEnv = options.env ?? env;
  const runtimeLogger = options.logger ?? logger;
  const runtimeRedis = options.redis ?? redis;
  return {
    logger: runtimeLogger,
    afterCommitLogger: runtimeLogger,
    redis: runtimeRedis,
    passwordHasher: {
      async hashPassword(password) {
        return await hashSecret(password, runtimeEnv.passwordHashRounds);
      },
    },
    random: {
      uuid: randomUUID,
      password(length) {
        return generateRandomPassword(length);
      },
      integer: randomInt,
      bytes(size) {
        return randomBytes(size);
      },
    },
    clock: {
      now: Date.now,
      nowDate() {
        return new Date();
      },
    },
    config: {
      env: runtimeEnv,
      auth: {
        adminClientCodes: runtimeEnv.auth.adminClientCodes,
      },
      sessionKernel: runtimeEnv.sessionKernel,
    },
    integrations: {
      clientCache: createAdminClientCache({ redis: runtimeRedis }),
    },
  };
}
