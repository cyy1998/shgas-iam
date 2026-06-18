import type { AdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";

export function createTrpcMiddlewares(handlers: Pick<AdminAuthenticationHandlers, "adminAuthenticationHandler">) {
  return defineMiddleware([handlers.adminAuthenticationHandler]);
}
