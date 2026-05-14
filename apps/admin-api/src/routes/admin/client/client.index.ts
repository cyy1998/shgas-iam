import type { PublicBindings } from "@iam/api-core/types";
import { createRouter } from "@iam/api-core/core/create-router";
import * as handlers from "./client.handlers";
import * as routes from "./client.routes";

const router = createRouter<PublicBindings>().basePath("/clients");

// router.use(`*`, publicAuthenticationHandler);

router.openapi(routes.clientCreate, handlers.clientCreate);
router.openapi(routes.clientUpdate, handlers.clientUpdate);

export default router;
