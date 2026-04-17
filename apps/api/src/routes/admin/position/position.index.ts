import { createRouter } from "@lib/core/create-router";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./position.handlers";
import * as routes from "./position.routes";

const router = createRouter();

router.use(`*`, publicAuthenicationHandler);

router.openapi(routes.positionsSearch, handlers.positionsSearch)
  .openapi(routes.positionsSet, handlers.positionsSet);

export default router;
