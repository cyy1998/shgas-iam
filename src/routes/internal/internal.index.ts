import { createRouter } from "@lib/core/create-app";
import * as handlers from "./internal.handlers";
import * as routes from "./internal.routes";

const router = createRouter();

router
  .openapi(routes.userInfo, handlers.userInfo)
  .openapi(routes.usersQueryByOrgPosition, handlers.usersQueryByOrgPosition)
  .openapi(routes.usersSearch, handlers.usersSearch)
  .openapi(routes.usersSearchWithPrivilegeDelegation, handlers.usersSearchWithPrivilegeDelegation)
  .openapi(routes.usersQueryByOrgRole, handlers.usersQueryByOrgRole)
  .openapi(routes.usersQueryByOrg, handlers.usersQueryByOrg)
  .openapi(routes.employmentsQueryByUserPriv, handlers.employmentsQueryByUserPriv)
  .openapi(routes.purveyorRegister, handlers.purveyorRegister)
  .openapi(routes.contactRegister, handlers.contactRegister)
  .openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.organizationGetByCode, handlers.organizationGetByCode)
;

export default router;
