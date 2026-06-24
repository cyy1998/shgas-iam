import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { AdminApiRuntimePorts } from "../runtime";
import { createAdminSessionRevocationLogger } from "@admin-api/services/session-revocation/session-revocation.logger";
import { createAdminSessionRevocationPort } from "@admin-api/services/session-revocation/session-revocation.port";
import { LoggerSourceApp } from "@iam/api-core/logger";
import { createSessionKernel } from "@iam/api-core/session/kernel";

export interface CreateAdminApiSessionOptions {
  runtime: AdminApiRuntimePorts;
}

export function createAdminApiSession(options: CreateAdminApiSessionOptions) {
  const sessionKernel = createSessionKernel({
    redis: options.runtime.redis as SessionKernelRedis,
    config: {
      ...options.runtime.config.sessionKernel,
      clock: options.runtime.clock,
    },
    logger: options.runtime.logger,
    sourceApp: LoggerSourceApp.AdminApi,
  });
  const revocationLogger = createAdminSessionRevocationLogger({ logger: options.runtime.logger });
  const revocation = createAdminSessionRevocationPort({
    sessionKernel,
    oidcInvalidation: options.runtime.integrations.oidcInvalidation,
    logger: revocationLogger,
  });

  return {
    kernel: sessionKernel,
    revocation,
  };
}

export type AdminApiSession = ReturnType<typeof createAdminApiSession>;
