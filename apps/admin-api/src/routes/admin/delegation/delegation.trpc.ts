import type { DelegationAdapter } from "./delegation.adapter";
export function createDelegationAdminRouter(adapter: DelegationAdapter) {
  return adapter.delegationAdminRouter;
}
