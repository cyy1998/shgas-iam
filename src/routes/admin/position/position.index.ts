import { createRouter } from "@lib/core/create-app";
import { authenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./position.handlers";
import * as routes from "./position.routes";

const router = createRouter();

router.use("/*", authenicationHandler);

router.openapi(routes.positionsSearch, handlers.positionsSearch);

export default router;
