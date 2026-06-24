import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { SessionKernel } from "@iam/api-core/session/kernel";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiServices } from "../services";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createAdminMiddlewares } from "@admin-api/routes/admin/_middleware";
import { createTrpcMiddlewares } from "@admin-api/routes/trpc/_middleware";

export interface CreateAdminApiMiddlewaresOptions {
  runtime: AdminApiRuntimePorts;
  sessionKernel: Pick<SessionKernel, "resolvePrincipalSession">;
  services: AdminApiServices;
}

export async function createAdminApiMiddlewares(
  options: CreateAdminApiMiddlewaresOptions,
): Promise<CreateAppOptions["middlewares"]> {
  const authenticationHandlers = createAdminAuthenticationHandlers({
    redis: options.runtime.redis,
    sessionKernel: options.sessionKernel,
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
