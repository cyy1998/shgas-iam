import type { RouteConfig as HonoRouteConfig } from "@hono/zod-openapi";
import type {
  PublicBindings as CorePublicBindings,
  PublicRouteHandler as CorePublicRouteHandler,
} from "@iam/api-core/types";

export type AdminBindings = CorePublicBindings;
export type AdminRouteHandler<R extends HonoRouteConfig> = CorePublicRouteHandler<R>;
