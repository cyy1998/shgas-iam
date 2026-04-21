import { router } from "../../trpc";
import { positionAdminRouter } from "./position.router";

export const adminRouter = router({
  position: positionAdminRouter,
});
