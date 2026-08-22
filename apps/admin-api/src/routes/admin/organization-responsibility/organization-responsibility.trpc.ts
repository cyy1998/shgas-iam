import type { OrganizationResponsibilityAdapter } from "./organization-responsibility.adapter";

export function createOrganizationResponsibilityAdminRouter(
  adapter: OrganizationResponsibilityAdapter,
) {
  return adapter.organizationResponsibilityAdminRouter;
}
