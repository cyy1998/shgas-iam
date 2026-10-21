import type { AdminBindings } from "@admin-api/types/lib";
import type { RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type * as routes from "./delegation.routes";

export type DelegationRouteHandler<T extends keyof typeof routes> = (typeof routes)[T] extends RouteConfig
  ? RouteHandler<(typeof routes)[T], AdminBindings>
  : never;
