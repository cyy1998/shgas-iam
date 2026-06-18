import type { ApiAuthenticationHandlers } from "@api/middlewares/authentication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";

export function createInternalMiddlewares(handlers: Pick<ApiAuthenticationHandlers, "internalAuthenticationHandler">) {
  return defineMiddleware([handlers.internalAuthenticationHandler]);
}
