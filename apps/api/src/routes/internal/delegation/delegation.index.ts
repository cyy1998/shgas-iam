import { createRouter } from "@/lib/core/create-router";
import * as handlers from "./delegation.handlers";
import * as routes from "./delegation.routes";

const router = createRouter().basePath("/delegations");

router
  .openapi(routes.privilegeDelegationsQuery, handlers.privilegeDelegationsQuery)
  .openapi(routes.privilegeDelegationUpdate, handlers.privilegeDelegationUpdate)
  .openapi(routes.privilegeDelegationSet, handlers.privilegeDelegationSet);

export default router;
