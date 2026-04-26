import type { PublicBindings } from "@/types/lib";
import { createRouter } from "@lib/core/create-router";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./organization.handlers";
import * as routes from "./organization.routes";

const router = createRouter<PublicBindings>();

router.use(`*`, publicAuthenicationHandler);

router
  .openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.organizationsChildren, handlers.organizationsChildren)
  .openapi(routes.organizationDetail, handlers.organizationDetail)
  .openapi(routes.organizationCreate, handlers.organizationCreate)
  .openapi(routes.organizationUpdate, handlers.organizationUpdate)
  .openapi(routes.organizationStatusUpdate, handlers.organizationStatusUpdate)
  .openapi(routes.organizationDelete, handlers.organizationDelete);

export default router;
