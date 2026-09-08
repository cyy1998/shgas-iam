import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createPublicMiddlewares } from "@api/routes/public/_middleware";
import { createApiOperationAuthenticationHandlers } from "../custom-sso-operation.adapter";

export interface CreateApiMiddlewaresOptions {
  runtime: ApiRuntimePorts;
  services: ApiServices;
}

export async function createApiMiddlewares(options: CreateApiMiddlewaresOptions): Promise<CreateAppOptions["middlewares"]> {
  const authenticationHandlers = createApiOperationAuthenticationHandlers({
    clientService: options.services.client,
    customSsoOperations: options.services.customSsoOperations,
    subjectAccessOperations: options.services.subjectAccessOperations,
    subjectDeliveryRequests:
      options.services.customSsoSubjectDeliveryRequests,

    config: {
      projectionRetryAfterSeconds:
        options.runtime.config.env.sso.projectionRetryAfterSeconds,
    },
  });

  return {
    "./src/routes/internal/_middleware.ts": { default: createInternalMiddlewares(authenticationHandlers) },
    "./src/routes/public/_middleware.ts": { default: createPublicMiddlewares(authenticationHandlers) },
  };
}
