import type { RouteConfig as HonoRouteConfig, RouteHandler } from '@hono/zod-openapi';

export interface AppBindings {
  Variables: {
    userId: number;
    username: string;
    userDetailDto: UserDetailDto;
  };
};

export type AppRouteHandler<R extends HonoRouteConfig> = RouteHandler<R, AppBindings>;
