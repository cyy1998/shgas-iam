import { defineMiddleware } from "@iam/api-core/core/define-config";
import type { createInternalAuthenticationHandler } from "@iam/api-core/middlewares/internal-client-authentication";
import type { GenericClientRuntimeDto } from "@iam/domain/client";

export function createInternalMiddlewares(handlers: {
  internalAuthenticationHandler: ReturnType<typeof createInternalAuthenticationHandler<GenericClientRuntimeDto>>;
}) {
  return defineMiddleware([handlers.internalAuthenticationHandler]);
}
