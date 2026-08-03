import type { AdminRouteHandler } from "@admin-api/types/lib";
import type { z } from "@hono/zod-openapi";
import type * as routes from "./role.routes";
import type { RoleAssignmentVoSchema, RoleVoSchema } from "./role.schema";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type RoleRouteHandler<T extends keyof RouteTypes> = AdminRouteHandler<RouteTypes[T]>;

export type RoleVo = z.infer<typeof RoleVoSchema>;
export type RoleAssignmentVo = z.infer<typeof RoleAssignmentVoSchema>;
