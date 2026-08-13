import type { AdminBindings } from "@admin-api/types/lib";
import type { EmploymentAdapter } from "./employment.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./employment.routes";

export function createEmploymentRoute(adapter: EmploymentAdapter) {
  return createRouter<AdminBindings>().basePath("/employments").openapi(routes.employmentsSearch, adapter.employmentsSearch).openapi(routes.employmentsDetail, adapter.employmentsDetail).openapi(routes.employmentsCreate, adapter.employmentsCreate).openapi(routes.employmentsUpdate, adapter.employmentsUpdate).openapi(routes.employmentsPause, adapter.employmentsPause).openapi(routes.employmentsResume, adapter.employmentsResume).openapi(routes.employmentsEnd, adapter.employmentsEnd).openapi(routes.employmentsTransfer, adapter.employmentsTransfer).openapi(routes.employmentsSetPrimary, adapter.employmentsSetPrimary).openapi(routes.employmentsClearPrimary, adapter.employmentsClearPrimary).openapi(routes.employmentsResignUser, adapter.employmentsResignUser);
}
