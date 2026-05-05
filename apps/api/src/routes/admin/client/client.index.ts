import type { PublicBindings } from "@api/types/lib";
import { createRouter } from "@api/lib/core/create-router";
import * as handlers from "./client.handlers";
import * as routes from "./client.routes";

const router = createRouter<PublicBindings>().basePath("/clients");

// router.use(`*`, publicAuthenicationHandler);

router.openapi(routes.clientCreate, handlers.clientCreate);
router.openapi(routes.clientUpdate, handlers.clientUpdate);

export default router;
