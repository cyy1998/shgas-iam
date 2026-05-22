import type { PublicBindings } from "@iam/api-core/types";
import { createRouter } from "@iam/api-core/core/create-router";
import * as handlers from "./client.handlers";
import * as routes from "./client.routes";

const router = createRouter<PublicBindings>().basePath("/clients");

// router.use(`*`, publicAuthenticationHandler);

router
  .openapi(routes.clientsSearch, handlers.clientsSearch)
  .openapi(routes.clientCreate, handlers.clientCreate)
  .openapi(routes.clientDetail, handlers.clientDetail)
  .openapi(routes.clientUpdate, handlers.clientUpdate)
  .openapi(routes.clientStatusUpdate, handlers.clientStatusUpdate)
  .openapi(routes.clientDelete, handlers.clientDelete)
  .openapi(routes.clientCreateLegacy, handlers.clientCreateLegacy)
  .openapi(routes.clientUpdateLegacy, handlers.clientUpdateLegacy);

export default router;
