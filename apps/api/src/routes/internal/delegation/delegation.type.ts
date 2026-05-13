import type { BaseRouteHandler } from "@iam/api-core/types";
import type * as routes from "./delegation.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type DelegationRouteHandler<T extends keyof RouteTypes> = BaseRouteHandler<RouteTypes[T]>;
