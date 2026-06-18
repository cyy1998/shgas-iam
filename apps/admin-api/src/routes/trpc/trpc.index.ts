import type { AppRouter } from "@admin-api/trpc/trpc.router";
import type { AnyRouter } from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import { createTRPCContext } from "@iam/api-core/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

export function createTrpcRoute(appRouter: AppRouter): AnyRouter {
  return createRouter().all("/*", async (c) => {
    return await fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
    });
  }) as AnyRouter;
}
