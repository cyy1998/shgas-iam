import { createRouter } from "@lib/core/create-app";
import { authenicationHandler } from "@middlewares/authenication.handler";
import * as handlers from "./employment.handlers";
import * as routes from "./employment.routes";

const router = createRouter();

router.use("/*", authenicationHandler);

router.openapi(routes.employmentsSearch, handlers.employmentsSearch);

export default router;
