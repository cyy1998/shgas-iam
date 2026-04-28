import type * as routes from "./organization.routes";
import type { BaseRouteHandler } from "@/types/lib";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type OrganizationRouteHandler<T extends keyof RouteTypes> = BaseRouteHandler<RouteTypes[T]>;
