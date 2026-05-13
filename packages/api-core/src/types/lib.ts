import type { RouteConfig as HonoRouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { Logger } from "pino";

export type BaseVariables = {
  /** Logger / 日志记录器 */
  logger: Logger;
  /** Request ID / 请求 ID */
  requestId: string;
  /** Current tier's basePath, auto-injected by framework / 当前 tier 的 basePath，由框架自动注入 */
  tierBasePath: string;
};

export type UserVariables<TUserDetail = unknown> = {
  userId: number;
  username: string;
  userDetailDto: TUserDetail;
};

export type BaseBindings = {
  Variables: BaseVariables;
};

export type AuthenticatedBindings<TUserDetail = unknown> = {
  Variables: UserVariables<TUserDetail> & BaseVariables;
};

export type PublicBindings<TUserDetail = unknown> = AuthenticatedBindings<TUserDetail>;

export type PublicRouteHandler<R extends HonoRouteConfig, TUserDetail = unknown>
  = RouteHandler<R, PublicBindings<TUserDetail>>;
export type BaseRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, BaseBindings>;
