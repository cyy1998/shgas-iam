import { router } from "@iam/api-core/trpc";
import type { AdminRouter } from "./routers/admin";

export function createAppRouter(adminRouter: AdminRouter) {
  return router({
    admin: adminRouter,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
