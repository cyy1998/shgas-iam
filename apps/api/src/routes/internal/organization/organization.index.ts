import { createRouter } from "@lib/core/create-router";
import * as handlers from "./organization.handlers";
import * as routes from "./organization.routes";

const router = createRouter().basePath("/organizations");

router
  .openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.organizationGetByCode, handlers.organizationGetByCode)
  .openapi(routes.organizationUpdate, handlers.organizationUpdate)
  .openapi(routes.purveyorRegister, handlers.purveyorRegister);

export default router;
