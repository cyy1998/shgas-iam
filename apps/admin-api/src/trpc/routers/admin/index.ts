import { auditAdminRouter } from "@admin-api/routes/admin/audit/audit.trpc";
import { clientAdminRouter } from "@admin-api/routes/admin/client/client.trpc";
import { employmentAdminRouter } from "@admin-api/routes/admin/employment/employment.trpc";
import { organizationAdminRouter } from "@admin-api/routes/admin/organization/organization.trpc";
import { positionAdminRouter } from "@admin-api/routes/admin/position/position.trpc";
import { userAdminRouter } from "@admin-api/routes/admin/user/user.trpc";
import { router } from "@iam/api-core/trpc";

export const adminRouter = router({
  audit: auditAdminRouter,
  organization: organizationAdminRouter,
  position: positionAdminRouter,
  user: userAdminRouter,
  employment: employmentAdminRouter,
  client: clientAdminRouter,
});
