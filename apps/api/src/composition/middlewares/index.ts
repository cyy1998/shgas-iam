import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";

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
