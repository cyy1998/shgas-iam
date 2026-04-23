import { createRouter } from "@lib/core/create-router";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./employment.handlers";
import * as routes from "./employment.routes";

const router = createRouter();

router.use("*", publicAuthenicationHandler);

router
  .openapi(routes.employmentsSearch, handlers.employmentsSearch)
  .openapi(routes.employmentsDetail, handlers.employmentsDetail)
  .openapi(routes.employmentsCreate, handlers.employmentsCreate)
  .openapi(routes.employmentsUpdate, handlers.employmentsUpdate)
  .openapi(routes.employmentsStatusUpdate, handlers.employmentsStatusUpdate)
  .openapi(routes.employmentsDelete, handlers.employmentsDelete)
  .openapi(routes.employmentsTransfer, handlers.employmentsTransfer)
  .openapi(routes.employmentsSetPrimary, handlers.employmentsSetPrimary)
  .openapi(routes.employmentsResignUser, handlers.employmentsResignUser);

export default router;
