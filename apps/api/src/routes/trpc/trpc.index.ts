import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createRouter } from "@/lib/core/create-router";
import { createTRPCContext } from "@/trpc/trpc";
import { appRouter } from "@/trpc/trpc.router";

const router = createRouter().all("/*", async (c) => {
  return await fetchRequestHandler({
    endpoint: "/rpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createTRPCContext({ honoCtx: c }),
  });
});

export default router;
