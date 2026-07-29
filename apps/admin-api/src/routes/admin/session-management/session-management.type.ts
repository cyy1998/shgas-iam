import type { PublicRouteHandler } from "@iam/api-core/types";
import type * as routes from "./session-management.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type SessionManagementRouteHandler<T extends keyof RouteTypes> = PublicRouteHandler<RouteTypes[T]>;
