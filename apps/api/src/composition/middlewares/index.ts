import type { CreateAppOptions } from "@iam/api-core/core/create-app";
import type { ApiRuntimePorts } from "../runtime";
import type { ApiServices } from "../services";
import { createApiAuthenticationHandlers } from "@api/middlewares/authentication.handler";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createPublicMiddlewares } from "@api/routes/public/_middleware";

export interface CreateApiMiddlewaresOptions {
  runtime: ApiRuntimePorts;
  services: ApiServices;
}

export async function createApiMiddlewares(options: CreateApiMiddlewaresOptions): Promise<CreateAppOptions["middlewares"]> {
  const authenticationHandlers = createApiAuthenticationHandlers({
    clientService: options.services.client,
    customSsoSession: options.services.customSsoSession,
    subjectDeliveryRequests:
      options.services.customSsoSubjectDeliveryRequests,
    trafficGate: options.services.customSsoTrafficGate,
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
