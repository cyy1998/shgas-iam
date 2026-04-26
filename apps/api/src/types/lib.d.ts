import type { RouteConfig as HonoRouteConfig, RouteHandler } from "@hono/zod-openapi";

export type BaseVariables = {
  /** Logger / 日志记录器 */
  logger: PinoLogger;
  /** Request ID / 请求 ID */
  requestId: string;
  /** Current tier's basePath, auto-injected by framework / 当前 tier 的 basePath，由框架自动注入 */
  tierBasePath: string;
};

export type UserVariables = {
  userId: number;
  username: string;
  userDetailDto: UserDetailDto;
};

export type BaseBindings = {
  Variables: BaseVariables;
};

export type PublicBindings = {
  Variables: UserVariables & BaseVariables;
};

export type PublicRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, PublicBindings>;
export type BaseRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, BaseBindings>;
