import { positionAdminRouter } from "@/routes/admin/position/position.trpc";
import { router } from "@/trpc/trpc";

export const adminRouter = router({
  position: positionAdminRouter,
});
