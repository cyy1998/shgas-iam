import type { OrganizationAdapter } from "./organization.adapter";

export function createOrganizationAdminRouter(adapter: OrganizationAdapter) {
  return adapter.organizationAdminRouter;
}
