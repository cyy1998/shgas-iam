import type { LoginWithMobileDeps } from "@api/use-cases/authentication/login-with-mobile/login-with-mobile.port";
import type { LoginWithOaDeps } from "@api/use-cases/authentication/login-with-oa/login-with-oa.port";
import type { LoginWithPasswordDeps } from "@api/use-cases/authentication/login-with-password/login-with-password.port";
import type { LoginWithWechatDeps } from "@api/use-cases/authentication/login-with-wechat/login-with-wechat.port";
import { createLoginWithMobileUseCase } from "@api/use-cases/authentication/login-with-mobile/login-with-mobile.use-case";
import { createLoginWithOaUseCase } from "@api/use-cases/authentication/login-with-oa/login-with-oa.use-case";
import { createLoginWithPasswordUseCase } from "@api/use-cases/authentication/login-with-password/login-with-password.use-case";
import { createLoginWithWechatUseCase } from "@api/use-cases/authentication/login-with-wechat/login-with-wechat.use-case";
import { sleep } from "bun";

interface AuthenticationCompositionOptions {
  auditLogWriter: LoginWithPasswordDeps["auditLogWriter"];
  runtime: {
    clock: LoginWithOaDeps["clock"];
    config: {
      auth: LoginWithPasswordDeps["config"];
      env: LoginWithOaDeps["config"];
    };
    redis: LoginWithWechatDeps["cache"];
    integrations: { wechat: LoginWithWechatDeps["wechat"] };
  };
  services: {
    cap: LoginWithPasswordDeps["humanVerification"] & LoginWithMobileDeps["humanVerification"];
    client: LoginWithOaDeps["clients"];
    humanRisk: LoginWithPasswordDeps["humanRisk"] & LoginWithMobileDeps["humanRisk"];
    loginRestriction: LoginWithPasswordDeps["loginRestriction"] & LoginWithMobileDeps["loginRestriction"];
    mobile: LoginWithMobileDeps["verificationCodes"];
    principalSessions: LoginWithPasswordDeps["principalSessions"]
      & LoginWithMobileDeps["principalSessions"]
      & LoginWithOaDeps["principalSessions"]
      & LoginWithWechatDeps["principalSessions"];
    user: LoginWithPasswordDeps["users"] & LoginWithMobileDeps["users"]
      & LoginWithOaDeps["users"] & LoginWithWechatDeps["users"];
  };
}

export function createAuthenticationUseCases({ auditLogWriter, runtime, services }: AuthenticationCompositionOptions) {
  return {
    loginWithMobile: createLoginWithMobileUseCase({
      auditLogWriter,
      config: { magicCode: runtime.config.auth.magicCode },
      humanRisk: services.humanRisk,
      humanVerification: services.cap,
      loginRestriction: services.loginRestriction,
      principalSessions: services.principalSessions,
      users: services.user,
      verificationCodes: services.mobile,
    }),
    loginWithPassword: createLoginWithPasswordUseCase({
      auditLogWriter,
      config: { magicCode: runtime.config.auth.magicCode },
      humanRisk: services.humanRisk,
      humanVerification: services.cap,
      loginRestriction: services.loginRestriction,
      principalSessions: services.principalSessions,
      users: services.user,
    }),
    loginWithOa: createLoginWithOaUseCase({
      auditLogWriter,
      clients: services.client,
      clock: runtime.clock,
      config: { nodeEnv: runtime.config.env.nodeEnv },
      principalSessions: services.principalSessions,
      users: services.user,
    }),
    loginWithWechat: createLoginWithWechatUseCase({
      auditLogWriter,
      cache: {
        del: key => runtime.redis.del(key),
        get: key => runtime.redis.get(key),
        set: (key, value, mode, ttlSeconds) => runtime.redis.set(key, value, mode, ttlSeconds),
      },
      delay: { wait: sleep },
      principalSessions: services.principalSessions,
      users: services.user,
      wechat: runtime.integrations.wechat,
    }),
  };
}
