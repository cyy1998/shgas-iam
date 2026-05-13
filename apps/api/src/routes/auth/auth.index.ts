import { createRouter } from "@iam/api-core/core/create-router";
import * as handlers from "./auth.handlers";
import * as routes from "./auth.routes";

const router = createRouter()
  .openapi(routes.loginPassword, handlers.loginPassword)
  .openapi(routes.loginMobile, handlers.loginMobile)
  // .openapi(routes.loginWX, handlers.loginWX)
  .openapi(routes.authz, handlers.authz)
  .openapi(routes.internalAuthz, handlers.internalAuthz);

export default router;
