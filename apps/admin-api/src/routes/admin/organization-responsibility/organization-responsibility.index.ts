import type { AdminBindings } from "@admin-api/types/lib";
import type { OrganizationResponsibilityAdapter } from "./organization-responsibility.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./organization-responsibility.routes";

export function createOrganizationResponsibilityRoute(
  adapter: OrganizationResponsibilityAdapter,
) {
  return createRouter<AdminBindings>()
    .openapi(
      routes.organizationResponsibilityTypesList,
      adapter.organizationResponsibilityTypesList,
    )
    .openapi(
      routes.organizationResponsibilityAssignmentsList,
      adapter.organizationResponsibilityAssignmentsList,
    )
    .openapi(
      routes.organizationResponsibilityAssignmentsSearch,
      adapter.organizationResponsibilityAssignmentsSearch,
    )
    .openapi(
      routes.organizationResponsibilityAssignmentDetail,
      adapter.organizationResponsibilityAssignmentDetail,
    )
    .openapi(
      routes.organizationResponsibilityGlobalAssignmentDetail,
      adapter.organizationResponsibilityGlobalAssignmentDetail,
    )
    .openapi(
      routes.organizationResponsibilityAssignmentCreate,
      adapter.organizationResponsibilityAssignmentCreate,
    )
    .openapi(
      routes.organizationResponsibilityAssignmentPause,
      adapter.organizationResponsibilityAssignmentPause,
    )
    .openapi(
      routes.organizationResponsibilityAssignmentResume,
      adapter.organizationResponsibilityAssignmentResume,
    )
    .openapi(
      routes.organizationResponsibilityAssignmentEnd,
      adapter.organizationResponsibilityAssignmentEnd,
    );
}
