import { createRouter } from "@lib/core/create-router";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./user.handlers";
import * as routes from "./user.routes";

const router = createRouter();

router.use(`*`, publicAuthenicationHandler);

router.openapi(routes.usersSearch, handlers.usersSearch)
  .openapi(routes.usersDetail, handlers.userDetail)
  .openapi(routes.passwordReset, handlers.passwordReset)
  .openapi(routes.passwordGenerate, handlers.passwordGenerate)
  .openapi(routes.usersSet, handlers.usersSet);

export default router;
