import { router } from "@/trpc/trpc";
import { positionAdminRouter } from "./position.router";

export const adminRouter = router({
  position: positionAdminRouter,
});
