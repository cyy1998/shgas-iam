import type { PublicBindings } from "@iam/api-core/types";
import { createRouter } from "@iam/api-core/core/create-router";
import * as handlers from "./organization.adapter";
import * as routes from "./organization.routes";

const router = createRouter<PublicBindings>().basePath("/organizations");

// router.use(`*`, publicAuthenticationHandler);

router
  .openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.organizationsChildren, handlers.organizationsChildren)
  .openapi(routes.organizationsSelector, handlers.organizationsSelector)
  .openapi(routes.organizationDetail, handlers.organizationDetail)
  .openapi(routes.organizationCreate, handlers.organizationCreate)
  .openapi(routes.organizationUpdate, handlers.organizationUpdate)
  .openapi(routes.organizationStatusUpdate, handlers.organizationStatusUpdate)
  .openapi(routes.organizationDelete, handlers.organizationDelete);

export default router;
