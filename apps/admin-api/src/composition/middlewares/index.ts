import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { SessionKernelRedis } from "@iam/api-core/session/kernel";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiServices } from "../services";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createAdminMiddlewares } from "@admin-api/routes/admin/_middleware";
import { createTrpcMiddlewares } from "@admin-api/routes/trpc/_middleware";
import { createSessionKernel } from "@iam/api-core/session/kernel";

export interface CreateAdminApiMiddlewaresOptions {
  runtime: AdminApiRuntimePorts;
  services: AdminApiServices;
}

export async function createAdminApiMiddlewares(
  options: CreateAdminApiMiddlewaresOptions,
): Promise<CreateAppOptions["middlewares"]> {
  const sessionKernel = createSessionKernel({
    redis: options.runtime.redis as SessionKernelRedis,
    config: {
      ...options.runtime.config.sessionKernel,
      clock: options.runtime.clock,
    },
    logger: options.runtime.logger,
  });
  const authenticationHandlers = createAdminAuthenticationHandlers({
    redis: options.runtime.redis,
    sessionKernel,
    userService: options.services.user,
    config: {
      allowedClientCodes: options.runtime.config.auth.adminClientCodes,
      adminRoleCodes: options.runtime.config.auth.adminRoleCodes,
    },
  });

  return {
    "./src/routes/admin/_middleware.ts": { default: createAdminMiddlewares(authenticationHandlers) },
    "./src/routes/trpc/_middleware.ts": { default: createTrpcMiddlewares(authenticationHandlers) },
  };
}
