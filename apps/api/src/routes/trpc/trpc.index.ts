import { appRouter } from "@api/trpc/trpc.router";
import { createRouter } from "@iam/api-core/core/create-router";
import { createTRPCContext } from "@iam/api-core/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

const router = createRouter().all("/*", async (c) => {
  return await fetchRequestHandler({
    endpoint: "/rpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createTRPCContext({ honoCtx: c }),
  });
});

export default router;
