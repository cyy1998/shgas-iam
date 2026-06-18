import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { AdminApiRuntimePorts } from "../runtime";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createAdminMiddlewares } from "@admin-api/routes/admin/_middleware";
import { createTrpcMiddlewares } from "@admin-api/routes/trpc/_middleware";

export interface CreateAdminApiMiddlewaresOptions {
  runtime: AdminApiRuntimePorts;
}

export async function createAdminApiMiddlewares(
  options: CreateAdminApiMiddlewaresOptions,
): Promise<CreateAppOptions["middlewares"]> {
  const authenticationHandlers = createAdminAuthenticationHandlers({
    redis: options.runtime.redis,
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
