import type { AdminRouteHandler } from "@admin-api/types/lib";
import type * as routes from "./organization.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type OrganizationRouteHandler<T extends keyof RouteTypes> = AdminRouteHandler<RouteTypes[T]>;
