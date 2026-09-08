import type { AdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import type { AdminRestOperationSurface } from "@admin-api/services/admin-authorization/admin-rest-operation.surface";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { SessionKernel } from "@iam/session-kernel";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiServices } from "../services";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createAdminMiddlewares } from "@admin-api/routes/admin/_middleware";
import { createTrpcMiddlewares } from "@admin-api/routes/trpc/_middleware";
import {
  createAdminAuthorizationContextHandler,
  createAdminRestAuthorizationHandler,
} from "@admin-api/services/admin-authorization/admin-authorization.context";

export interface CreateAdminApiMiddlewaresOptions {
  runtime: AdminApiRuntimePorts;
  sessionKernel: Pick<SessionKernel, "resolvePrincipalSession">;
  services: AdminApiServices;
  authorizationPolicy: AdminAuthorizationPolicy;
  restOperationSurface: AdminRestOperationSurface;
}

export async function createAdminApiMiddlewares(
  options: CreateAdminApiMiddlewaresOptions,
): Promise<CreateAppOptions["middlewares"]> {
  const authenticationHandlers = createAdminAuthenticationHandlers({
    sessionKernel: options.sessionKernel,
    userService: options.services.user,
    config: {
      allowedClientCodes: options.runtime.config.auth.adminClientCodes,
    },
  });
  const authorizationContextHandler = createAdminAuthorizationContextHandler(
    options.authorizationPolicy,
  );
  const restAuthorizationHandler = createAdminRestAuthorizationHandler(
    options.restOperationSurface,
  );

  return {
    "./src/routes/admin/_middleware.ts": {
      default: createAdminMiddlewares(
        authenticationHandlers,
        authorizationContextHandler,
        restAuthorizationHandler,
      ),
    },
    "./src/routes/trpc/_middleware.ts": {
      default: createTrpcMiddlewares(
        authenticationHandlers,
        authorizationContextHandler,
      ),
    },
  };
}
