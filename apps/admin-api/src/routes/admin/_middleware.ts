import type { AdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";
import type { MiddlewareHandler } from "hono";

export function createAdminMiddlewares(
  handlers: Pick<AdminAuthenticationHandlers, "adminAuthenticationHandler">,
  adminAuthorizationContextHandler: MiddlewareHandler,
  adminRestAuthorizationHandler: MiddlewareHandler,
) {
  return defineMiddleware([
    handlers.adminAuthenticationHandler,
    adminAuthorizationContextHandler,
    adminRestAuthorizationHandler,
  ]);
}
