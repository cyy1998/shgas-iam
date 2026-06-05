import type { PublicRouteHandler } from "@iam/api-core/types";
import type * as routes from "./position.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type PositionRouteHandler<T extends keyof RouteTypes> = PublicRouteHandler<RouteTypes[T]>;
