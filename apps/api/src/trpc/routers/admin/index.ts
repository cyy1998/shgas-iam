import { employmentAdminRouter } from "@api/routes/admin/employment/employment.trpc";
import { organizationAdminRouter } from "@api/routes/admin/organization/organization.trpc";
import { positionAdminRouter } from "@api/routes/admin/position/position.trpc";
import { userAdminRouter } from "@api/routes/admin/user/user.trpc";
import { router } from "@api/trpc/trpc";

export const adminRouter = router({
  organization: organizationAdminRouter,
  position: positionAdminRouter,
  user: userAdminRouter,
  employment: employmentAdminRouter,
});
