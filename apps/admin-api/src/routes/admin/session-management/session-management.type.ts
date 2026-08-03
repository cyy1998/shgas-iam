import type { AdminRouteHandler } from "@admin-api/types/lib";
import type * as routes from "./session-management.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type SessionManagementRouteHandler<T extends keyof RouteTypes> = AdminRouteHandler<RouteTypes[T]>;
