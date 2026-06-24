import type { PublicBindings } from "@iam/api-core/types";
import type { EmploymentAdapter } from "./employment.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./employment.routes";

export function createEmploymentRoute(adapter: EmploymentAdapter) {
  return createRouter<PublicBindings>().basePath("/employments").openapi(routes.employmentsSearch, adapter.employmentsSearch).openapi(routes.employmentsDetail, adapter.employmentsDetail).openapi(routes.employmentsCreate, adapter.employmentsCreate).openapi(routes.employmentsUpdate, adapter.employmentsUpdate).openapi(routes.employmentsStatusUpdate, adapter.employmentsStatusUpdate).openapi(routes.employmentsDelete, adapter.employmentsDelete).openapi(routes.employmentsTransfer, adapter.employmentsTransfer).openapi(routes.employmentsSetPrimary, adapter.employmentsSetPrimary).openapi(routes.employmentsResignUser, adapter.employmentsResignUser);
}
