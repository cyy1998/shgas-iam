import type * as routes from "./user.routes";
import type { BaseRouteHandler } from "@/types/lib";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type UserRouteHandler<T extends keyof RouteTypes> = BaseRouteHandler<RouteTypes[T]>;
