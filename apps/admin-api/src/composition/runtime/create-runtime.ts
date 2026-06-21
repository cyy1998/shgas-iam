import type { AdminApiRuntimePorts } from "./types";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import env, { adminClientCodes, adminRoleCodes } from "@admin-api/env";
import redis from "@admin-api/lib/infra/redis";
import { logger } from "@admin-api/lib/logger";
import { invalidateOidcClient, revokeOidcAccessTokensForUser } from "@iam/api-core/oidc";
import { hashSecret } from "@iam/api-core/security";
import { generateRandomPassword } from "@iam/api-core/utils";
import { hash } from "bcrypt-ts";

export interface CreateAdminApiRuntimeOptions {
  env?: typeof env;
  logger?: typeof logger;
  redis?: typeof redis;
}

export function createAdminApiRuntime(options: CreateAdminApiRuntimeOptions = {}): AdminApiRuntimePorts {
  const runtimeEnv = options.env ?? env;
  const runtimeLogger = options.logger ?? logger;
  const runtimeRedis = options.redis ?? redis;
  const adminAuthClientCodes = options.env === undefined
    ? adminClientCodes
    : runtimeEnv.ADMIN_CLIENT_CODES.split(",").map(code => code.trim()).filter(Boolean);
  const adminAuthRoleCodes = options.env === undefined
    ? adminRoleCodes
    : runtimeEnv.ADMIN_ROLE_CODES.split(",").map(code => code.trim()).filter(Boolean);

  return {
    logger: runtimeLogger,
    afterCommitLogger: runtimeLogger,
    redis: runtimeRedis,
    passwordHasher: {
      async hashPassword(password) {
        return await hash(password, runtimeEnv.PASSWORD_HASH_ROUNDS);
      },
      async hashSecret(secret) {
        return await hashSecret(secret, runtimeEnv.PASSWORD_HASH_ROUNDS);
      },
    },
    random: {
      uuid: randomUUID,
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
        adminClientCodes: adminAuthClientCodes,
        adminRoleCodes: adminAuthRoleCodes,
      },
      sessionKernel: {
        namespace: runtimeEnv.SESSION_KERNEL_NAMESPACE,
        principalIdleTtlMs: runtimeEnv.SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS * 1000,
        principalAbsoluteTtlMs: runtimeEnv.SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS * 1000,
        lookupHmacKeys: {
          current: {
            id: runtimeEnv.SESSION_LOOKUP_HMAC_CURRENT_ID,
            secret: runtimeEnv.SESSION_LOOKUP_HMAC_CURRENT_SECRET,
          },
          ...(runtimeEnv.SESSION_LOOKUP_HMAC_PREVIOUS_ID && runtimeEnv.SESSION_LOOKUP_HMAC_PREVIOUS_SECRET
            ? {
                previous: {
                  id: runtimeEnv.SESSION_LOOKUP_HMAC_PREVIOUS_ID,
                  secret: runtimeEnv.SESSION_LOOKUP_HMAC_PREVIOUS_SECRET,
                },
              }
            : {}),
        },
        tombstoneTtlMs: runtimeEnv.SESSION_KERNEL_TOMBSTONE_TTL_SECONDS * 1000,
        tombstoneGraceMs: runtimeEnv.SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS * 1000,
      },
    },
    integrations: {
      clientCache: {
        async setClient(clientDto) {
          await Promise.all([
            runtimeRedis.set(`cache:client:code:${clientDto.clientCode}`, JSON.stringify(clientDto)),
            runtimeRedis.set(`cache:client:secret:${clientDto.clientSecret}`, JSON.stringify(clientDto)),
          ]);
        },
        async deleteClient(clientDto) {
          await Promise.all([
            runtimeRedis.del(`cache:client:code:${clientDto.clientCode}`),
            runtimeRedis.del(`cache:client:secret:${clientDto.clientSecret}`),
          ]);
        },
        async syncUpdatedClient(oldClientDto, newClientDto) {
          await Promise.all([
            oldClientDto.clientCode === newClientDto.clientCode
              ? Promise.resolve()
              : runtimeRedis.del(`cache:client:code:${oldClientDto.clientCode}`),
            oldClientDto.clientSecret === newClientDto.clientSecret
              ? Promise.resolve()
              : runtimeRedis.del(`cache:client:secret:${oldClientDto.clientSecret}`),
            this.setClient(newClientDto),
          ]);
        },
      },
      oidcInvalidation: {
        async invalidateClient(client) {
          await invalidateOidcClient(runtimeRedis, {
            clientId: client.id,
            clientCode: client.clientCode,
            oidcConfigVersion: client.oidcConfigVersion,
          });
        },
      },
      tokenRevocation: {
        async revokeUserTokens(userId) {
          await revokeOidcAccessTokensForUser(runtimeRedis, userId);
        },
      },
    },
  };
}
