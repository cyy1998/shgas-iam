import type { PublicRouteHandler as Public2RouteHandler } from "@iam/api-core/types";
import type * as routes from "./public.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type PublicRouteHandler<T extends keyof RouteTypes> = Public2RouteHandler<RouteTypes[T]>;
