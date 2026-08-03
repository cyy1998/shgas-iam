import type { UserDetailDto } from "@admin-api/services/user/user.type";
import type { RouteConfig as HonoRouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { BaseVariables } from "@iam/api-core/types";

export type AdminBindings = {
  Variables: BaseVariables & {
    userId: number;
    username: string;
    userDetailDto: UserDetailDto;
    principalSessionId: string;
  };
};

export type AdminRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, AdminBindings>;
