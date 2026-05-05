import type { PublicBindings } from "@api/types/lib";
import { createRouter } from "@api/lib/core/create-router";
import * as handlers from "./public.handlers";
import * as routes from "./public.routes";

const router = createRouter<PublicBindings>();

// router.use(`*`, publicAuthenicationHandler);

router.openapi(routes.userInfo, handlers.userInfo)
  .openapi(routes.passwordChange, handlers.passwordChange)
  .openapi(routes.mobileSet, handlers.mobileSet)
  .openapi(routes.organizationsSearch, handlers.organizationsSearch)
  .openapi(routes.usersSearch, handlers.usersSearch)
  .openapi(routes.usersQueryByOrg, handlers.usersQueryByOrg);

export default router;
