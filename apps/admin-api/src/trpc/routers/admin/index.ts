import { employmentAdminRouter } from "@admin-api/routes/admin/employment/employment.trpc";
import { organizationAdminRouter } from "@admin-api/routes/admin/organization/organization.trpc";
import { positionAdminRouter } from "@admin-api/routes/admin/position/position.trpc";
import { userAdminRouter } from "@admin-api/routes/admin/user/user.trpc";
import { router } from "@iam/api-core/trpc";

export const adminRouter = router({
  organization: organizationAdminRouter,
  position: positionAdminRouter,
  user: userAdminRouter,
  employment: employmentAdminRouter,
});
