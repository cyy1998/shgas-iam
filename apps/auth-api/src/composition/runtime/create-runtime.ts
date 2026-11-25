import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Env } from "@auth-api/env";
import { createCapClient } from "@auth-api/lib/integrations/cap";
import { createSmsClient } from "@auth-api/lib/integrations/sms";
import { createWechatClient } from "@auth-api/lib/integrations/wechat";
import { createLogger, LoggerSourceApp } from "@iam/runtime/logger";
import { createOwnedRedisClient } from "@iam/runtime/redis/connection";
import type { Logger } from "pino";
import { createApiPasswordHasher } from "./password-hasher";
import type { ApiRuntimePorts } from "./types";

export interface CreateApiRuntimeOptions {
  env: Env;
  logger?: Logger;
  integrationFetch?: { wechat?: typeof fetch; sms?: typeof fetch };
}

export function createApiRuntime(options: CreateApiRuntimeOptions): ApiRuntimePorts {
  const runtimeEnv = options.env;
  const runtimeLogger =
    options.logger ??
    createLogger({
      nodeEnv: runtimeEnv.nodeEnv,
      logLevel: runtimeEnv.log.level,
      logFormat: runtimeEnv.log.format,
      sourceApp: LoggerSourceApp.AuthApi,
    });
  const runtimeRedis = createOwnedRedisClient(runtimeEnv.redis);
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
      },
      cap: {
        enabled: runtimeEnv.cap.enabled,
        siteKey: runtimeEnv.cap.siteKey,
        secret: runtimeEnv.cap.secret,
        challengeTtlMs: runtimeEnv.cap.challengeTtlMs,
        tokenTtlSeconds: runtimeEnv.cap.tokenTtlSeconds,
      },
      humanVerification: {
        imageCaptchaEnabled: runtimeEnv.humanVerification.imageCaptchaEnabled,
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
      sessionKernel: {
        namespace: runtimeEnv.sessionKernel.namespace,
        userSessionTtlSeconds: runtimeEnv.sessionKernel.userSessionTtlSeconds,
        clientSessionTtlSeconds: runtimeEnv.sessionKernel.clientSessionTtlSeconds,
      },
    },
    integrations: {
      cap: createCapClient({
        redis: runtimeRedis,
        clock: runtimeClock,
      }),
      sms: createSmsClient({
        fetch: options.integrationFetch?.sms,
        clock: runtimeClock,
        random: runtimeRandom,
        config: {
          smsUrl: runtimeEnv.integrations.sms.url,
          signatureKey: runtimeEnv.integrations.sms.signatureKey,
        },
      }),
      wechat: createWechatClient({
        fetch: options.integrationFetch?.wechat,
        redis: runtimeRedis,
        config: {
          corpId: runtimeEnv.integrations.wechat.corpId,
          corpSecret: runtimeEnv.integrations.wechat.corpSecret,
        },
      }),
    },
  };
}
