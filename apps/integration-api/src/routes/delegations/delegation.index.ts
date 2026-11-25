import { createRouter } from "@iam/api-core/core/create-router";
import type { PublicBindings } from "@iam/api-core/types";
import type { MiddlewareHandler } from "hono";
import type { PublicDelegationHandlers } from "./delegation.handlers";
import * as routes from "./delegation.routes";

export function createPublicDelegationRoute(handlers: PublicDelegationHandlers, authenticate: MiddlewareHandler) {
  const router = createRouter<PublicBindings>();
  router.openAPIRegistry.registerComponent("securitySchemes", "IamRootSessionAuthorization", {
    type: "apiKey",
    in: "header",
    name: "Authorization",
    description: "Raw IAM root session token. Send the value without a Bearer prefix.",
  });
  router.openAPIRegistry.registerComponent("securitySchemes", "IamRootSessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: "global_session",
  });
  router.use("/delegations/*", authenticate);
  return router
    .openapi(routes.create, handlers.create)
    .openapi(routes.search, handlers.search)
    .openapi(routes.update, handlers.update)
    .openapi(routes.userChoices, handlers.userChoices)
    .openapi(routes.clientChoices, handlers.clientChoices)
    .openapi(routes.organizationChoices, handlers.organizationChoices);
}
