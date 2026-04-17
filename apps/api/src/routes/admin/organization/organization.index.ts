import { createRouter } from "@lib/core/create-router";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./organization.handlers";
import * as routes from "./organization.routes";

const router = createRouter();

router.use(`*`, publicAuthenicationHandler);

router.openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.organizationsSet, handlers.organizationsSet);

export default router;
