import type { UserAdapter } from "./user.adapter";

export function createUserAdminRouter(adapter: UserAdapter) {
  return adapter.userAdminRouter;
}
