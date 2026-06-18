import type { PublicBindings } from "@iam/api-core/types";
import type { PositionAdapter } from "./position.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./position.routes";

export function createPositionRoute(adapter: PositionAdapter) {
  return createRouter<PublicBindings>().basePath("/positions").openapi(routes.positionsSearch, adapter.positionsSearch).openapi(routes.positionDetail, adapter.positionDetail).openapi(routes.positionCreate, adapter.positionCreate).openapi(routes.positionUpdate, adapter.positionUpdate).openapi(routes.positionStatusUpdate, adapter.positionStatusUpdate).openapi(routes.positionDelete, adapter.positionDelete);
}
