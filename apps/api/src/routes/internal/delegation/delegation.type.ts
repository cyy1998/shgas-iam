import type * as routes from "./delegation.routes";
import type { BaseRouteHandler } from "@/types/lib";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type DelegationRouteHandler<T extends keyof RouteTypes> = BaseRouteHandler<RouteTypes[T]>;
