import type { ApiAuthenticationHandlers } from "@api/middlewares/authentication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";

export function createPublicMiddlewares(handlers: Pick<ApiAuthenticationHandlers, "publicAuthenticationHandler">) {
  return defineMiddleware([handlers.publicAuthenticationHandler]);
}
