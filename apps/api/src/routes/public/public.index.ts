import type { PublicBindings } from "@iam/api-core/types";
import { createRouter } from "@iam/api-core/core/create-router";
import * as handlers from "./public.handlers";
import * as routes from "./public.routes";

const router = createRouter<PublicBindings>();

// router.use(`*`, publicAuthenticationHandler);

router.openapi(routes.userInfo, handlers.userInfo)
  .openapi(routes.passwordChange, handlers.passwordChange)
  .openapi(routes.mobileSet, handlers.mobileSet)
  .openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.usersSearch, handlers.usersSearch);

export default router;
