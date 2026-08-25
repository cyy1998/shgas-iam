import type { AdminBindings } from "@admin-api/types/lib";
import type { RouteHandler } from "@hono/zod-openapi";
import type * as routes from "./authorization.routes";

export type AuthorizationRouteHandler<K extends keyof typeof routes>
  = RouteHandler<(typeof routes)[K], AdminBindings>;
