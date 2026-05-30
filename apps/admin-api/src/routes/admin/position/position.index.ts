import type { PublicBindings } from "@iam/api-core/types";
import { createRouter } from "@iam/api-core/core/create-router";
import * as handlers from "./position.adapter";
import * as routes from "./position.routes";

const router = createRouter<PublicBindings>().basePath("/positions");

// router.use(`*`, publicAuthenticationHandler);

router
  .openapi(routes.positionsSearch, handlers.positionsSearch)
  .openapi(routes.positionDetail, handlers.positionDetail)
  .openapi(routes.positionCreate, handlers.positionCreate)
  .openapi(routes.positionUpdate, handlers.positionUpdate)
  .openapi(routes.positionStatusUpdate, handlers.positionStatusUpdate)
  .openapi(routes.positionDelete, handlers.positionDelete);

export default router;
