import { router } from "@api/trpc/trpc";
import { adminRouter } from "./routers/admin";

export const appRouter = router({
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
