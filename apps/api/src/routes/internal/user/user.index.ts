import { createRouter } from "@/lib/core/create-router";
import * as handlers from "./user.handlers";
import * as routes from "./user.routes";

const router = createRouter().basePath("/users");

router
  .openapi(routes.userInfo, handlers.userInfo)
  .openapi(routes.usersSearch, handlers.usersSearch)
  .openapi(routes.usersSearchWithPrivilegeDelegation, handlers.usersSearchWithPrivilegeDelegation)
  .openapi(routes.contactRegister, handlers.contactRegister);

export default router;
