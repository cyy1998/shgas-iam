import { OpenAPIHono } from "@hono/zod-openapi";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import { Scalar } from "@scalar/hono-api-reference";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { errorHandler } from "@/middlewares/error.handler";
// admin 子路由
import adminClientRouter from "@/routes/admin/client/client.index";
import adminEmploymentRouter from "@/routes/admin/employment/employment.index";
import adminOrganizationRouter from "@/routes/admin/organization/organization.index";
import adminPositionRouter from "@/routes/admin/position/position.index";
import adminUserRouter from "@/routes/admin/user/user.index";
// 顶层路由
import authRouter from "@/routes/auth/auth.index";
import internalRouter from "@/routes/internal/internal.index";

import openRouter from "@/routes/open/open.index";
import publicRouter from "@/routes/public/public.index";
import ssoRouter from "@/routes/sso/sso.index";
import { appRouter } from "@/trpc/app.router";
import { createTRPCContext } from "@/trpc/trpc";

import { pinoLogger } from "../clients/pino";

export default function createApp() {
  const app = new OpenAPIHono();

  app.use("/static/*", serveStatic({ root: "./" }));

  app.use(logger(
    (str: string, ...args: any[]) => {
      pinoLogger.info(`[INFO] ${new Date().toISOString()} - ${str}`, ...args);
    },
  ));

  app.onError(errorHandler);

  app.use("/rpc/*", publicAuthenicationHandler);
  app.all("/rpc/*", async (c) => {
    return await fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
    });
  });

  app.route("/public", publicRouter);
  app.route("/auth", authRouter);
  app.route("/internal", internalRouter);
  app.route("/open", openRouter);
  app.route("/sso", ssoRouter);
  app.route("/admin/clients", adminClientRouter);
  app.route("/admin/employments", adminEmploymentRouter);
  app.route("/admin/organizations", adminOrganizationRouter);
  app.route("/admin/positions", adminPositionRouter);
  app.route("/admin/users", adminUserRouter);

  app.doc("/doc", {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "IAM Service",
    },
  });

  app.get("/doc/scalar", Scalar({
    content: {
      openapi: "3.0.0",
      info: { version: "1.0.0", title: "IAM Service" },
    },
    url: "/doc",
    cdn: "/static/scalar/api-reference.js",
  }));

  return app;
}
