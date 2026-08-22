import type { AdminRouteHandler } from "@admin-api/types/lib";
import type * as routes from "./organization-responsibility.routes";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type OrganizationResponsibilityRouteHandler<T extends keyof RouteTypes>
  = AdminRouteHandler<RouteTypes[T]>;
