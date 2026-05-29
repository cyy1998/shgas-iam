import type { RouteHandler } from "@hono/zod-openapi";
import type { PublicBindings } from "@iam/api-core/types";
import type * as routes from "./audit.routes";

export type AuditRouteHandler<K extends keyof typeof routes> = RouteHandler<
  (typeof routes)[K],
  PublicBindings
>;
