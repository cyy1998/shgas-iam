import type { PublicBindings } from "@/types/lib";
import { createRouter } from "@lib/core/create-router";
import * as handlers from "./user.handlers";
import * as routes from "./user.routes";

const router = createRouter<PublicBindings>().basePath("/users");

// router.use("*", publicAuthenicationHandler);

router
  .openapi(routes.usersSearch, handlers.usersSearch)
  .openapi(routes.usersDetail, handlers.usersDetail)
  .openapi(routes.usersCreate, handlers.usersCreate)
  .openapi(routes.usersUpdate, handlers.usersUpdate)
  .openapi(routes.usersStatusUpdate, handlers.usersStatusUpdate)
  .openapi(routes.usersDelete, handlers.usersDelete)
  .openapi(routes.usersResetPassword, handlers.usersResetPassword)
  .openapi(routes.usersGeneratePassword, handlers.usersGeneratePassword);

export default router;
