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

export type AuthenticatedSubjectVariables = {
  subjectIdentifier: string;
  authenticatedClientCode: string;
  orcasId?: string;
};

export type InternalClientVariables<TClient = unknown> = {
  clientCode: string;
  clientDto: TClient;
};

export type BaseBindings = {
  Variables: BaseVariables;
};

export type AuthenticatedBindings = {
  Variables: AuthenticatedSubjectVariables & BaseVariables;
};

export type PublicBindings = AuthenticatedBindings;

export type InternalBindings<TClient = unknown> = {
  Variables: InternalClientVariables<TClient> & BaseVariables;
};

export type PublicRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, PublicBindings>;
export type BaseRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, BaseBindings>;
export type InternalRouteHandler<R extends HonoRouteConfig, TClient = unknown>
  = RouteHandler<R, InternalBindings<TClient>>;
