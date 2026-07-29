import type { AuditAdapter } from "@admin-api/routes/admin/audit/audit.adapter";
import type { ClientAdapter } from "@admin-api/routes/admin/client/client.adapter";
import type { EmploymentAdapter } from "@admin-api/routes/admin/employment/employment.adapter";
import type { OrganizationAdapter } from "@admin-api/routes/admin/organization/organization.adapter";
import type { PositionAdapter } from "@admin-api/routes/admin/position/position.adapter";
import type { RoleAdapter } from "@admin-api/routes/admin/role/role.adapter";
import type { SessionManagementAdapter } from "@admin-api/routes/admin/session-management/session-management.adapter";
import type { UserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { router } from "@iam/api-core/trpc";

export interface CreateAdminRouterDeps {
  audit: AuditAdapter["auditAdminRouter"];
  client: ClientAdapter["clientAdminRouter"];
  employment: EmploymentAdapter["employmentAdminRouter"];
  organization: OrganizationAdapter["organizationAdminRouter"];
  position: PositionAdapter["positionAdminRouter"];
  role: RoleAdapter["roleAdminRouter"];
  sessionManagement: SessionManagementAdapter["sessionManagementAdminRouter"];
  user: UserAdapter["userAdminRouter"];
}

export function createAdminRouter(deps: CreateAdminRouterDeps) {
  return router({
    audit: deps.audit,
    organization: deps.organization,
    position: deps.position,
    role: deps.role,
    sessionManagement: deps.sessionManagement,
    user: deps.user,
    employment: deps.employment,
    client: deps.client,
  });
}

export type AdminRouter = ReturnType<typeof createAdminRouter>;
