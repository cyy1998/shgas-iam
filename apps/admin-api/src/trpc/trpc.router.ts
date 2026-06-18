import type { AdminRouter } from "./routers/admin";
import { router } from "@iam/api-core/trpc";

export function createAppRouter(adminRouter: AdminRouter) {
  return router({
    admin: adminRouter,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
