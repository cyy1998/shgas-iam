import type { ApiRuntimePorts } from "./types";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import env from "@api/env";
import redis from "@api/lib/infra/redis";
import { createCapClient } from "@api/lib/integrations/cap";
import { createOrcasClient } from "@api/lib/integrations/orcas";
import { createSmsClient } from "@api/lib/integrations/sms";
import { createWechatClient } from "@api/lib/integrations/wechat";
import { logger } from "@api/lib/logger";
import { compare, hash } from "bcrypt-ts";

export interface CreateApiRuntimeOptions {
  env?: typeof env;
  logger?: typeof logger;
  redis?: typeof redis;
}

export function createApiRuntime(options: CreateApiRuntimeOptions = {}): ApiRuntimePorts {
  const runtimeEnv = options.env ?? env;
  const runtimeLogger = options.logger ?? logger;
  const runtimeRedis = options.redis ?? redis;
  const runtimeRandom: ApiRuntimePorts["random"] = {
    uuid: randomUUID,
    integer: randomInt,
    bytes(size) {
      return randomBytes(size);
    },
  };
  const runtimeClock: ApiRuntimePorts["clock"] = {
    now: Date.now,
    nowDate() {
      return new Date();
    },
  };

  return {
    logger: runtimeLogger,
    afterCommitLogger: runtimeLogger,
    redis: runtimeRedis,
    passwordHasher: {
      async hashPassword(password) {
        return await hash(password, runtimeEnv.PASSWORD_HASH_ROUNDS);
      },
      async verifyPassword(password, hashedPassword) {
        return await compare(password, hashedPassword);
      },
    },
    random: runtimeRandom,
    clock: runtimeClock,
    config: {
      env: runtimeEnv,
      auth: {
        magicCode: runtimeEnv.MAGIC_CODE,
        authCodeExpireSeconds: runtimeEnv.AUTH_CODE_EXPIRE_TIME,
        redisExpireSeconds: runtimeEnv.REDIS_EXPIRE_TIME,
      },
      cap: {
        enabled: runtimeEnv.CAP_ENABLED,
        siteKey: runtimeEnv.CAP_SITE_KEY,
        secret: runtimeEnv.CAP_SECRET,
        challengeTtlMs: runtimeEnv.CAP_CHALLENGE_TTL_MS,
        tokenTtlSeconds: runtimeEnv.CAP_TOKEN_TTL_SECONDS,
      },
      humanVerification: {
        windowSeconds: runtimeEnv.HUMAN_VERIFICATION_WINDOW_SECONDS,
        loginFailureThreshold: runtimeEnv.HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD,
        lookupThreshold: runtimeEnv.HUMAN_VERIFICATION_LOOKUP_THRESHOLD,
      },
      loginCredential: {
        activeKid: runtimeEnv.LOGIN_CREDENTIAL_ACTIVE_KID,
        privateKeysByKid: runtimeEnv.LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON,
        maxSkewMs: runtimeEnv.LOGIN_CREDENTIAL_MAX_SKEW_MS,
        nonceTtlSeconds: runtimeEnv.LOGIN_CREDENTIAL_NONCE_TTL_SECONDS,
      },
    },
    integrations: {
      cap: createCapClient({
        redis: runtimeRedis,
        clock: runtimeClock,
      }),
      orcas: createOrcasClient({
        config: {
          orcasUrl: runtimeEnv.ORCAS_URL,
        },
      }),
      sms: createSmsClient({
        clock: runtimeClock,
        random: runtimeRandom,
        config: {
          smsUrl: runtimeEnv.SMS_URL,
          signatureKey: runtimeEnv.SMS_SIGNATURE_KEY,
        },
      }),
      wechat: createWechatClient({
        redis: runtimeRedis,
        config: {
          corpId: runtimeEnv.WX_CORPID,
          corpSecret: runtimeEnv.WX_CORPSECRET,
        },
      }),
    },
  };
}
