import type { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiReferenceConfiguration } from "@scalar/hono-api-reference";
import type { Context, MiddlewareHandler } from "hono";
import type { Logger } from "pino";
import type { AppConfig, MiddlewareWithExcept, OpenAPIConfig, TierConfig, TierMiddleware } from "./define-config";
import { Scalar as ScalarHonoAPIReference } from "@scalar/hono-api-reference";
import { pinoLogger } from "hono-pino";
import { serveStatic } from "hono/bun";
import { except } from "hono/combine";
import { requestId } from "hono/request-id";
import { buildHttpRequestLogFields, getStatusLogLevel, LoggerSourceApp } from "../logger";
import { createErrorHandler } from "../middlewares/error-handler";
import notFound from "../middlewares/not-found-handler";
import { createRouter } from "./create-router";

export type AnyRouter = OpenAPIHono<any>;
type TierApps = Array<{ tierApp: AnyRouter; tier: TierConfig; basePath: string }>;

export type CreateAppOptions = {
  env: Record<string, unknown>;
  logger: Logger;
  routes: Record<string, { default: AnyRouter }>;
  middlewares: Record<string, { default: TierMiddleware[] }>;
};

function resolveTierBasePath(tier: TierConfig, config: AppConfig): string {
  if (tier.basePath) {
    return tier.basePath;
  }

  const prefix = config.prefix ?? "/api";
  // const version = config.version ? `/${config.version}` : "";
  return `${prefix}/${tier.name}`;
}

/** Route matching (three modes) / 路由匹配（三种模式） */
function resolveTierRoutes(tier: TierConfig, allRoutes: Record<string, { default: AnyRouter }>) {
  if (tier.routes)
    return tier.routes;
  const dirName = tier.routeDir ?? tier.name;
  return Object.fromEntries(Object.entries(allRoutes).filter(([path]) => {
    const match = path.match(/[/\\]+routes[/\\]+([^/\\]+)[/\\]+/);
    return match?.[1] === dirName;
  }));
}

/** Middleware loading / 中间件加载 */
function resolveTierMiddlewares(
  tier: TierConfig,
  allMiddlewares: Record<string, { default: TierMiddleware[] }>,
): TierMiddleware[] {
  if (tier.middlewares) {
    return tier.middlewares;
  }
  const dirName = tier.routeDir ?? tier.name;
  return Object.values(Object.fromEntries(Object.entries(allMiddlewares).filter(([path]) => {
    const match = path.match(/[/\\]+routes[/\\]+([^/\\]+)[/\\]+/);
    return match?.[1] === dirName;
  }))).flatMap(mod => mod.default);
}

/** Type guard / 类型守卫 */
function isMiddlewareWithExcept(mw: TierMiddleware): mw is MiddlewareWithExcept {
  return typeof mw === "object" && "handler" in mw && "except" in mw;
}

/** OpenAPI enabled resolution / OpenAPI enabled 解析 */
function resolveEnabled(enabled: OpenAPIConfig["enabled"], env: Record<string, unknown>): boolean {
  if (typeof enabled === "function")
    return enabled(env);
  if (typeof enabled === "boolean")
    return enabled;
  return env.NODE_ENV !== "production";
}

function getHeader(c: Context, name: string): string | undefined {
  return c.req.header(name) ?? c.req.header(name.toLowerCase());
}

function getSourceApp(logger: Logger) {
  const sourceApp = logger.bindings?.().sourceApp;
  return typeof sourceApp === "string" ? sourceApp : LoggerSourceApp.Api;
}

function getRoutePath(c: Context) {
  const request = c.req as typeof c.req & { routePath?: string };
  return request.routePath ?? c.req.path;
}

function getResponseStatus(c: Context) {
  return (c.res as { status?: number }).status ?? 200;
}

function createIamRequestLogger(rootLogger: Logger, sourceApp: string): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - startedAt);
    const statusCode = getResponseStatus(c);
    const logger = c.get("logger" as never) as Pick<Logger, "info" | "warn" | "error">;
    const level = getStatusLogLevel(statusCode);

    logger[level](buildHttpRequestLogFields({
      sourceApp,
      requestId: c.get("requestId" as never),
      readHeader: name => getHeader(c, name),
      method: c.req.method,
      path: c.req.path,
      route: getRoutePath(c),
      statusCode,
      durationMs,
    }), "HTTP request completed");
  };
}

/** Configure OpenAPI doc for a single tier / 配置单个 tier 的 OpenAPI 文档 */
function configureAppDoc(router: AnyRouter, tier: TierConfig, config: AppConfig, docEndpoint: string) {
  const version = config.openapi?.version ?? "3.1.0";
  const docConfig = {
    openapi: version,
    info: { version: config.version ?? "1.0.0", title: tier.title },
  };

  if (tier.token) {
    const securityName = `${tier.name}Bearer`;
    router.openAPIRegistry.registerComponent("securitySchemes", securityName, {
      type: "http",
      scheme: "bearer",
    });
    router.doc31(docEndpoint, { ...docConfig, security: [{ [securityName]: [] }] });
  }
  else {
    router.doc31(docEndpoint, docConfig);
  }
}

/** Configure Scalar documentation homepage / 配置 Scalar 文档主页 */
function configureScalarUI(app: AnyRouter, tierApps: TierApps, config: AppConfig, docEndpoint: string) {
  const scalarConfig = config.openapi?.scalar ?? {};
  app.get("/", ScalarHonoAPIReference({
    ...scalarConfig as Partial<ApiReferenceConfiguration>,
    sources: tierApps.map(({ tier, basePath }, i) => ({
      title: tier.title,
      slug: tier.name,
      url: `${basePath}${docEndpoint}`,
      default: i === 0,
    })),
    authentication: {
      securitySchemes: Object.fromEntries(tierApps.filter(({ tier }) => tier.token)
        .map(({ tier }) => [`${tier.name}Bearer`, { token: tier.token! }])),
    },
  }));
}

export default function createApp(config: AppConfig, options: CreateAppOptions) {
  const app = createRouter();
  const allMiddlewares = options.middlewares;
  const allRoutes = options.routes;

  app.use("/static/*", serveStatic({ root: "./" }));

  app.use(requestId());
  app.use(pinoLogger({ pino: options.logger, http: false }));
  app.use(createIamRequestLogger(options.logger, getSourceApp(options.logger)));

  app.notFound(notFound);
  app.onError(createErrorHandler(options.logger));

  const openapiEnabled = resolveEnabled(config.openapi?.enabled, options.env);
  const docEndpoint = config.openapi?.docEndpoint ?? "/doc";

  const tierApps: TierApps = [];
  for (const tier of config.tiers) {
    const basePath = resolveTierBasePath(tier, config);
    const tierApp = createRouter().basePath(basePath);
    // OpenAPI docs (registered before middlewares to avoid auth interception) / OpenAPI 文档（在中间件之前注册，避免被认证拦截）
    if (openapiEnabled) {
      configureAppDoc(tierApp, tier, config, docEndpoint);
    }

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

  if (openapiEnabled) {
    configureScalarUI(app, tierApps, config, docEndpoint);
  }

  // Mount in tiers order / 按 tiers 顺序挂载
  for (const { tierApp } of tierApps) {
    app.route("/", tierApp);
  }

  return app;
}
