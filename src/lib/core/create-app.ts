import type { AppBindings } from "@/lib/lib";
import { readdirSync, statSync } from "node:fs";
import path, { join } from "node:path";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { serveStatic } from "hono/bun";
import { logger } from "hono/logger";
import { errorHandler } from "@/middlewares/error.handler";
import { pinoLogger } from "../clients/pino";
import defaultHook from "./openapi/default-hook";

export function createRouter() {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook,
  });
}

// Auto-detect and register routes from src/routes/
function registerRoutes(app: OpenAPIHono, dir: string, prefix = "") {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Recurse into subdirectories, using subdirectory name as prefix
      const routePrefix = prefix ? `${prefix}/${entry}` : entry;
      registerRoutes(app, fullPath, routePrefix);
    }
    else if (entry.endsWith(".index.ts")) {
      // Register the router with the prefix derived from relative path
      // eslint-disable-next-line ts/no-require-imports
      const routeModule = require(fullPath);
      const router = routeModule.default;

      if (router && typeof router.route === "function") {
        const routePrefix = prefix || "/";
        app.route("/", router);
        pinoLogger.info(`Registered route: ${routePrefix}`);
      }
    }
  }
}

export default function createApp() {
  const app = new OpenAPIHono();

  // const port = env.PORT

  app.use("/static/*", serveStatic({ root: "./" }));

  app.use(logger(
    (str: string, ...args: any[]) => {
      pinoLogger.info(`[INFO] ${new Date().toISOString()} - ${str}`, ...args);
      // pinoLogger.info({ type: 'query' });
    },
  ));

  app.onError(errorHandler);

  const routesDir = join(path.resolve(__dirname, "../.."), "routes");
  registerRoutes(app, routesDir);

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
