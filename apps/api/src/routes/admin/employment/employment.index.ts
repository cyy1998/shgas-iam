import { createRouter } from "@lib/core/create-app";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./employment.handlers";
import * as routes from "./employment.routes";

const router = createRouter();

router.use(`${routes.routePrefix}/*`, publicAuthenicationHandler);

router.openapi(routes.employmentsSearch, handlers.employmentsSearch)
  .openapi(routes.employmentsSet, handlers.employmentsSet);

export default router;
