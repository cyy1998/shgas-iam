import type { z } from "@hono/zod-openapi";
import type { PublicRouteHandler } from "@iam/api-core/types";
import type * as routes from "./user.routes";
import type { UserVoSchema } from "./user.schema";

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type UserRouteHandler<T extends keyof RouteTypes> = PublicRouteHandler<RouteTypes[T]>;

export type UserVo = z.infer<typeof UserVoSchema>;
