import type { AppBindings } from "@/lib/lib";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { errorHandler } from "@/middlewares/error.handler";
import { pinoLogger } from "../clients/pino";
import defaultHook from "./openapi/default-hook";

// 顶层路由
import authRouter from "@/routes/auth/auth.index";
import internalRouter from "@/routes/internal/internal.index";
import openRouter from "@/routes/open/open.index";
import publicRouter from "@/routes/public/public.index";
import ssoRouter from "@/routes/sso/sso.index";

// admin 子路由
import adminClientRouter from "@/routes/admin/client/client.index";
import adminEmploymentRouter from "@/routes/admin/employment/employment.index";
import adminOrganizationRouter from "@/routes/admin/organization/organization.index";
import adminPositionRouter from "@/routes/admin/position/position.index";
import adminUserRouter from "@/routes/admin/user/user.index";

export function createRouter() {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook,
  });
}

export default function createApp() {
  const app = new OpenAPIHono();

  app.use("/static/*", serveStatic({ root: "./" }));

  app.use(logger(
    (str: string, ...args: any[]) => {
      pinoLogger.info(`[INFO] ${new Date().toISOString()} - ${str}`, ...args);
    },
  ));

  app.onError(errorHandler);

  app.route("/", publicRouter);
  app.route("/", authRouter);
  app.route("/", internalRouter);
  app.route("/", openRouter);
  app.route("/", ssoRouter);
  app.route("/", adminClientRouter);
  app.route("/", adminEmploymentRouter);
  app.route("/", adminOrganizationRouter);
  app.route("/", adminPositionRouter);
  app.route("/", adminUserRouter);

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
