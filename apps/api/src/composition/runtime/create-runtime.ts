import type { ApiRuntimePorts } from "./types";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import env from "@api/env";
import redis from "@api/lib/infra/redis";
import { createCapClient } from "@api/lib/integrations/cap";
import { createOrcasClient } from "@api/lib/integrations/orcas";
import { createSmsClient } from "@api/lib/integrations/sms";
import { createWechatClient } from "@api/lib/integrations/wechat";
import { logger } from "@api/lib/logger";
import { createSessionKernelConfigFromEnv } from "@iam/api-core/session/kernel";
import { createApiPasswordHasher } from "./password-hasher";

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
    passwordHasher: createApiPasswordHasher(runtimeEnv.passwordHashRounds),
    random: runtimeRandom,
    clock: runtimeClock,
    config: {
      env: runtimeEnv,
      auth: {
        magicCode: runtimeEnv.auth.magicCode,
        authCodeExpireSeconds: runtimeEnv.auth.authCodeTtlSeconds,
        redisExpireSeconds: runtimeEnv.auth.sessionDefaultTtlSeconds,
      },
      cap: {
        enabled: runtimeEnv.cap.enabled,
        siteKey: runtimeEnv.cap.siteKey,
        secret: runtimeEnv.cap.secret,
        challengeTtlMs: runtimeEnv.cap.challengeTtlMs,
        tokenTtlSeconds: runtimeEnv.cap.tokenTtlSeconds,
      },
      humanVerification: {
        windowSeconds: runtimeEnv.humanVerification.windowSeconds,
        loginFailureThreshold: runtimeEnv.humanVerification.loginFailureThreshold,
        lookupThreshold: runtimeEnv.humanVerification.lookupThreshold,
      },
      loginCredential: {
        activeKid: runtimeEnv.loginCredential.activeKid,
        privateKeysByKid: runtimeEnv.loginCredential.privateKeysByKid,
        maxSkewMs: runtimeEnv.loginCredential.maxSkewMs,
        nonceTtlSeconds: runtimeEnv.loginCredential.nonceTtlSeconds,
      },
      sessionKernel: createSessionKernelConfigFromEnv({
        namespace: runtimeEnv.sessionKernel.namespace,
        principalIdleTtlSeconds: runtimeEnv.sessionKernel.principalIdleTtlSeconds,
        principalAbsoluteTtlSeconds: runtimeEnv.sessionKernel.principalAbsoluteTtlSeconds,
        defaultPrincipalTtlSeconds: runtimeEnv.auth.sessionDefaultTtlSeconds,
        tombstoneTtlSeconds: runtimeEnv.sessionKernel.tombstoneTtlSeconds,
        tombstoneGraceSeconds: runtimeEnv.sessionKernel.tombstoneGraceSeconds,
        lookupHmacCurrentId: runtimeEnv.sessionKernel.lookupHmacCurrentId,
        lookupHmacCurrentSecret: runtimeEnv.sessionKernel.lookupHmacCurrentSecret,
        lookupHmacPreviousId: runtimeEnv.sessionKernel.lookupHmacPreviousId,
        lookupHmacPreviousSecret: runtimeEnv.sessionKernel.lookupHmacPreviousSecret,
        nodeEnv: runtimeEnv.nodeEnv,
      }),
      userProfile: {
        dslMaxLimit: runtimeEnv.userProfile.dslMaxLimit,
      },
    },
    integrations: {
      cap: createCapClient({
        redis: runtimeRedis,
        clock: runtimeClock,
      }),
      orcas: createOrcasClient({
        config: {
          orcasUrl: runtimeEnv.integrations.orcas.url,
        },
      }),
      sms: createSmsClient({
        clock: runtimeClock,
        random: runtimeRandom,
        config: {
          smsUrl: runtimeEnv.integrations.sms.url,
          signatureKey: runtimeEnv.integrations.sms.signatureKey,
        },
      }),
      wechat: createWechatClient({
        redis: runtimeRedis,
        config: {
          corpId: runtimeEnv.integrations.wechat.corpId,
          corpSecret: runtimeEnv.integrations.wechat.corpSecret,
        },
      }),
    },
  };
}
