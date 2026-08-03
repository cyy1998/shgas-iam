import type { AdminBindings } from "@admin-api/types/lib";
import type { RouteHandler } from "@hono/zod-openapi";
import type * as routes from "./audit.routes";

export type AuditRouteHandler<K extends keyof typeof routes> = RouteHandler<
  (typeof routes)[K],
  AdminBindings
>;
