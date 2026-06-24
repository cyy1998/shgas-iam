import type { ClientAdapter } from "./client.adapter";

export function createClientAdminRouter(adapter: ClientAdapter) {
  return adapter.clientAdminRouter;
}
