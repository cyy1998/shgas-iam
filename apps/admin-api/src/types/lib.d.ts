import type { UserDetailDto } from "@admin-api/services/user/user.type";
import type { RouteConfig as HonoRouteConfig } from "@hono/zod-openapi";
import type {
  PublicBindings as CorePublicBindings,
  PublicRouteHandler as CorePublicRouteHandler,
} from "@iam/api-core/types";

export type AdminBindings = CorePublicBindings<UserDetailDto>;
export type AdminRouteHandler<R extends HonoRouteConfig> = CorePublicRouteHandler<R, UserDetailDto>;
