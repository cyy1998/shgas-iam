import type { AdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import type { MiddlewareHandler } from "hono";
import { defineMiddleware } from "@iam/api-core/core/define-config";

export function createTrpcMiddlewares(
  handlers: Pick<AdminAuthenticationHandlers, "adminAuthenticationHandler">,
  adminAuthorizationContextHandler: MiddlewareHandler,
) {
  return defineMiddleware([
    handlers.adminAuthenticationHandler,
    adminAuthorizationContextHandler,
  ]);
}
