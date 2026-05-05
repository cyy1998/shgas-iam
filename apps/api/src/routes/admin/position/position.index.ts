import type { PublicBindings } from "@api/types/lib";
import { createRouter } from "@api/lib/core/create-router";
import * as handlers from "./position.handlers";
import * as routes from "./position.routes";

const router = createRouter<PublicBindings>().basePath("/positions");

// router.use(`*`, publicAuthenicationHandler);

router
  .openapi(routes.positionsSearch, handlers.positionsSearch)
  .openapi(routes.positionDetail, handlers.positionDetail)
  .openapi(routes.positionCreate, handlers.positionCreate)
  .openapi(routes.positionUpdate, handlers.positionUpdate)
  .openapi(routes.positionStatusUpdate, handlers.positionStatusUpdate)
  .openapi(routes.positionDelete, handlers.positionDelete);

export default router;
