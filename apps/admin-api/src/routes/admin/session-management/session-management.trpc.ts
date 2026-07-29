import type { SessionManagementAdapter } from "./session-management.adapter";

export function createSessionManagementAdminRouter(adapter: SessionManagementAdapter) {
  return adapter.sessionManagementAdminRouter;
}
