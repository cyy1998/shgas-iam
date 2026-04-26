/* eslint-disable antfu/no-top-level-await */
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppConfig, MiddlewareWithExcept, TierConfig, TierMiddleware } from "./define-config";
import { publicAuthenicationHandler } from "@middlewares/authenication.handler";
import { Scalar } from "@scalar/hono-api-reference";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { pinoLogger } from "hono-pino";
import { serveStatic } from "hono/bun";
import { except } from "hono/combine";
import { requestId } from "hono/request-id";
import { errorHandler } from "@/middlewares/error.handler";
// admin 子路由

// 顶层路由

import { appRouter } from "@/trpc/app.router";
import { createTRPCContext } from "@/trpc/trpc";
import { globImport } from "@/utils/tools/glob";
import { logger } from "../logger";
import { createRouter } from "./create-router";

type AnyRouter = OpenAPIHono<any>;
type TierApps = Array<{ tierApp: AnyRouter; tier: TierConfig; basePath: string }>;

const allMiddlewares = await globImport<{ default: TierMiddleware[] }>("./src/routes/*/_middleware.ts");
const allRoutes = await globImport<{ default: AnyRouter }>("./src/routes/**/*.index.ts");
// console.log(allRoutes);

function resolveTierBasePath(tier: TierConfig, config: AppConfig): string {
  if (tier.basePath) {
    return tier.basePath;
  }

  const prefix = config.prefix ?? "/api";
  const version = config.version ? `/${config.version}` : "";
  return `${prefix}${version}/${tier.name}`;
}

/** Route matching (three modes) / 路由匹配（三种模式） */
function resolveTierRoutes(tier: TierConfig, _allRoutes: ParamsType<{ default: AnyRouter }>) {
  if (tier.routes)
    return tier.routes;
  const dirName = tier.routeDir ?? tier.name;
  return Object.fromEntries(Object.entries(_allRoutes).filter(([path]) => {
    // eslint-disable-next-line e18e/prefer-static-regex
    const match = path.match(/[/\\]+routes[/\\]+([^/\\]+)[/\\]+/);
    return match?.[1] === dirName;
  }));
}

/** Middleware loading / 中间件加载 */
function resolveTierMiddlewares(
  tier: TierConfig,
  _allMiddlewares: ParamsType<{ default: TierMiddleware[] }>,
): TierMiddleware[] {
  if (tier.middlewares) {
    return tier.middlewares;
  }
  const dirName = tier.routeDir ?? tier.name;
  return Object.values(Object.fromEntries(Object.entries(_allMiddlewares).filter(([path]) => {
    // eslint-disable-next-line e18e/prefer-static-regex
    const match = path.match(/[/\\]+routes[/\\]+([^/\\]+)[/\\]+/);
    return match?.[1] === dirName;
  }))).flatMap(mod => mod.default);
  // const key = Object.keys(_allMiddlewares).find(k => k.includes(`/routes/${dirName}/_middleware.ts`));
  // const mod = key ? _allMiddlewares[key]?.default : [];
  // return mod ?? [];
}

/** Type guard / 类型守卫 */
function isMiddlewareWithExcept(mw: TierMiddleware): mw is MiddlewareWithExcept {
  return typeof mw === "object" && "handler" in mw && "except" in mw;
}

export default function createApp(config: AppConfig) {
  const app = createRouter();

  app.use("/static/*", serveStatic({ root: "./" }));

  const requestLogger = pinoLogger({ pino: logger });
  app.use(requestLogger);

  app.onError(errorHandler);
  app.use(requestId());

  app.use("/rpc/*", publicAuthenicationHandler);
  app.all("/rpc/*", async (c) => {
    return await fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
    });
  });

  const tierApps: TierApps = [];
  for (const tier of config.tiers) {
    const basePath = resolveTierBasePath(tier, config);
    const tierApp = createRouter().basePath(basePath);
    // OpenAPI docs (registered before middlewares to avoid auth interception) / OpenAPI 文档（在中间件之前注册，避免被认证拦截）
    // if (openapiEnabled) {
    //   configureAppDoc(tierApp, tier, config, docEndpoint);
    // }

    // Inject tier basePath for downstream middleware use / 注入 tier basePath 供下游中间件使用
    tierApp.use("/*", async (c, next) => {
      c.set("tierBasePath", basePath);
      await next();
    });

    // Register middlewares / 注册中间件
    const middlewares = resolveTierMiddlewares(tier, allMiddlewares);
    // console.log(`Registering middlewares for tier ${tier.name}:`, middlewares);
    for (const mw of middlewares) {
      tierApp.use("/*", isMiddlewareWithExcept(mw) ? except(mw.except, mw.handler) : mw);
    }

    // Register routes / 注册路由
    const routes = resolveTierRoutes(tier, allRoutes);
    for (const mod of Object.values(routes)) {
      tierApp.route("/", mod.default);
    }

    tierApps.push({ tierApp, tier, basePath });
  }

  // app.route("/public", publicRouter);
  // app.route("/auth", authRouter);
  // app.route("/internal", internalRouter);
  // app.route("/open", openRouter);
  // app.route("/sso", ssoRouter);
  // app.route("/admin/clients", adminClientRouter);
  // app.route("/admin/employments", adminEmploymentRouter);
  // app.route("/admin/organizations", adminOrganizationRouter);
  // app.route("/admin/positions", adminPositionRouter);
  // app.route("/admin/users", adminUserRouter);

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

  // Mount in tiers order / 按 tiers 顺序挂载
  for (const { tierApp } of tierApps) {
    app.route("/", tierApp);
  }

  return app;
}
