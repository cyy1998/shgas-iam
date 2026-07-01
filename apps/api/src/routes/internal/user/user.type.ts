import type { BaseRouteHandler } from "@iam/api-core/types";
import type * as routes from "./user.routes";

type RouteTypes = {
  [K in keyof typeof routes as typeof routes[K] extends (...args: any[]) => any ? never : K]: typeof routes[K];
};

export type UserRouteHandler<T extends keyof RouteTypes> = BaseRouteHandler<RouteTypes[T]>;
