import type { AdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import type { AdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import type { AdminRestOperationSurface } from "@admin-api/services/admin-authorization/admin-rest-operation.surface";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import type { AdminApiRuntimePorts } from "../runtime";
import type { AdminApiServices } from "../services";
import { createAdminMiddlewares } from "@admin-api/routes/admin/_middleware";
import { createTrpcMiddlewares } from "@admin-api/routes/trpc/_middleware";
import {
  createAdminAuthorizationContextHandler,
  createAdminRestAuthorizationHandler,
} from "@admin-api/services/admin-authorization/admin-authorization.context";

export interface CreateAdminApiMiddlewaresOptions {
  runtime: AdminApiRuntimePorts;
  subjectAccess: Pick<ReturnType<typeof createSubjectAccessOperations>, "run">;
  services: AdminApiServices;
  authorizationPolicy: AdminAuthorizationPolicy;
  restOperationSurface: AdminRestOperationSurface;
}

export async function createAdminApiMiddlewares(
  options: CreateAdminApiMiddlewaresOptions,
): Promise<CreateAppOptions["middlewares"]> {
  return assembleAdminMiddlewares(options, options.services.rootSecurity.authentication);
}

function assembleAdminMiddlewares(
  options: Pick<CreateAdminApiMiddlewaresOptions, "authorizationPolicy" | "restOperationSurface">,
  authenticationHandlers: AdminAuthenticationHandlers,
): CreateAppOptions["middlewares"] {
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
