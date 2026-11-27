import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Env } from "@admin-api/env";
import { createGenericClientCacheInvalidation } from "@iam/client-snapshot/generic-cache";
import { hash as hashSecret } from "bcrypt-ts";
import type { AdminApiRuntimePorts } from "./types";

export interface CreateAdminApiRuntimeOptions {
  env: Env;
  logger: AdminApiRuntimePorts["logger"];
  redis: AdminApiRuntimePorts["redis"];
}

function generateRandomPassword(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function createAdminApiRuntime(options: CreateAdminApiRuntimeOptions): AdminApiRuntimePorts {
  const { env: runtimeEnv, logger: runtimeLogger, redis: runtimeRedis } = options;
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
      clientCache: createGenericClientCacheInvalidation({ redis: runtimeRedis }),
    },
  };
}
