import type { BaseRouteHandler } from "@api/types/lib";
import type * as routes from "./user.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type UserRouteHandler<T extends keyof RouteTypes> = BaseRouteHandler<RouteTypes[T]>;
