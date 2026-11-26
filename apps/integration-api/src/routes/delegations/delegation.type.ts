import type { RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { PublicBindings } from "@iam/api-core/types";
import type * as routes from "./delegation.routes";

export type PublicDelegationRouteHandler<T extends keyof typeof routes> = (typeof routes)[T] extends RouteConfig
  ? RouteHandler<(typeof routes)[T], PublicBindings>
  : never;
