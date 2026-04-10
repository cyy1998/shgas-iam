import { createRouter } from "@lib/core/create-app";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./client.handlers";
import * as routes from "./client.routes";

const router = createRouter();

router.use("/*", publicAuthenicationHandler);

router.openapi(routes.clientCreate, handlers.clientCreate);
router.openapi(routes.clientUpdate, handlers.clientUpdate);

export default router;
