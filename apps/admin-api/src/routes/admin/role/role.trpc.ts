import type { RoleAdapter } from "./role.adapter";

export function createRoleAdminRouter(adapter: RoleAdapter) {
  return adapter.roleAdminRouter;
}
