import type { AdminApiRuntimePorts } from "./types";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import env from "@admin-api/env";
import redis from "@admin-api/lib/infra/redis";
import { logger } from "@admin-api/lib/logger";
import {
  createClientRuntimeSnapshotLoggerObservability,
  createClientRuntimeSnapshotModule,
} from "@iam/api-core/client-runtime-snapshot";
import { hashSecret } from "@iam/api-core/security";
import { generateRandomPassword } from "@iam/api-core/utils";
import { createSessionKernelConfigFromEnv } from "@iam/session-kernel";
import { hash } from "bcrypt-ts";
import { createAdminClientCache } from "./client-cache";

export interface CreateAdminApiRuntimeOptions {
  env?: typeof env;
  logger?: typeof logger;
  redis?: typeof redis;
}

export function createAdminApiRuntime(options: CreateAdminApiRuntimeOptions = {}): AdminApiRuntimePorts {
  const runtimeEnv = options.env ?? env;
  const runtimeLogger = options.logger ?? logger;
  const runtimeRedis = options.redis ?? redis;
  const clientRuntimeSnapshots = createClientRuntimeSnapshotModule({
    redis: runtimeRedis,
    adapters: [] as const,
    observability: createClientRuntimeSnapshotLoggerObservability(runtimeLogger),
  });
  return {
    logger: runtimeLogger,
    afterCommitLogger: runtimeLogger,
    redis: runtimeRedis,
    passwordHasher: {
      async hashPassword(password) {
        return await hash(password, runtimeEnv.passwordHashRounds);
      },
      async hashSecret(secret) {
        return await hashSecret(secret, runtimeEnv.passwordHashRounds);
      },
    },
    random: {
      uuid: randomUUID,
      customSsoClientSecret() {
        return `iam_sso_${randomBytes(32).toString("base64url")}`;
      },
      oidcClientSecret() {
        return `iam_oidc_${randomBytes(32).toString("base64url")}`;
      },
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
      sessionKernel: createSessionKernelConfigFromEnv({
        namespace: runtimeEnv.sessionKernel.namespace,
        principalIdleTtlSeconds: runtimeEnv.sessionKernel.principalIdleTtlSeconds,
        principalAbsoluteTtlSeconds: runtimeEnv.sessionKernel.principalAbsoluteTtlSeconds,
        tombstoneTtlSeconds: runtimeEnv.sessionKernel.tombstoneTtlSeconds,
        tombstoneGraceSeconds: runtimeEnv.sessionKernel.tombstoneGraceSeconds,
        lookupHmacCurrentId: runtimeEnv.sessionKernel.lookupHmacCurrentId,
        lookupHmacCurrentSecret: runtimeEnv.sessionKernel.lookupHmacCurrentSecret,
        lookupHmacPreviousId: runtimeEnv.sessionKernel.lookupHmacPreviousId,
        lookupHmacPreviousSecret: runtimeEnv.sessionKernel.lookupHmacPreviousSecret,
        nodeEnv: runtimeEnv.nodeEnv,
      }),
    },
    integrations: {
      clientCache: createAdminClientCache({ redis: runtimeRedis }),
      clientRuntimeInvalidation: clientRuntimeSnapshots,
    },
  };
}
