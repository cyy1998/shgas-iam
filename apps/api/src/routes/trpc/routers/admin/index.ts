import { employmentAdminRouter } from "@/routes/admin/employment/employment.trpc";
import { organizationAdminRouter } from "@/routes/admin/organization/organization.trpc";
import { positionAdminRouter } from "@/routes/admin/position/position.trpc";
import { userAdminRouter } from "@/routes/admin/user/user.trpc";
import { router } from "@/routes/trpc/trpc";

export const adminRouter = router({
  organization: organizationAdminRouter,
  position: positionAdminRouter,
  user: userAdminRouter,
  employment: employmentAdminRouter,
});
