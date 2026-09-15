import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";

export interface CreateApiMiddlewaresOptions {
  runtime: ApiRuntimePorts;
  services: ApiServices;
}

export async function createApiMiddlewares(
  options: CreateApiMiddlewaresOptions,
): Promise<CreateAppOptions["middlewares"]> {
  const authenticationHandlers = {
    internalAuthenticationHandler: createInternalAuthenticationHandler({
      getClientBySecret: options.services.client.getClientBySecret,
    }),
  };

  return {
    "./src/routes/internal/_middleware.ts": { default: createInternalMiddlewares(authenticationHandlers) },
  };
}
