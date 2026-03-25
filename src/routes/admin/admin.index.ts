import { createRouter } from "@lib/core/create-app";

import { authenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./admin.handlers";
import * as routes from "./admin.routes";

const router = createRouter();

router.use("/*", authenicationHandler);

// router.openapi(routes.userInfo, handlers.userInfo)
//   .openapi(routes.passwordChange, handlers.passwordChange)
//   .openapi(routes.mobileSet, handlers.mobileSet)
//   .openapi(routes.organizationsSearch, handlers.organizationsSearch)
//   .openapi(routes.usersSearch, handlers.usersSearch)
//   .openapi(routes.usersQueryByOrg, handlers.usersQueryByOrg);

export default router;
