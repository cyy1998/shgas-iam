import type { EmploymentAdapter } from "./employment.adapter";

export function createEmploymentAdminRouter(adapter: EmploymentAdapter) {
  return adapter.employmentAdminRouter;
}
