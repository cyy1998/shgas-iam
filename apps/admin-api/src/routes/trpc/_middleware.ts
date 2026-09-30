import type { AdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";
import type { MiddlewareHandler } from "hono";

export function createTrpcMiddlewares(
  handlers: Pick<AdminAuthenticationHandlers, "adminAuthenticationHandler">,
  adminAuthorizationContextHandler: MiddlewareHandler,
) {
  return defineMiddleware([handlers.adminAuthenticationHandler, adminAuthorizationContextHandler]);
}
