import type { BaseRouteHandler } from "@iam/api-core/types";
import type * as routes from "./open.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type OpenRouteHandler<T extends keyof RouteTypes> = BaseRouteHandler<RouteTypes[T]>;
