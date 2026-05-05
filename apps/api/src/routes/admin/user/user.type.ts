import type { PublicRouteHandler } from "@api/types/lib";
import type { z } from "@hono/zod-openapi";
import type * as routes from "./user.routes";
import type { UserVoSchema } from "./user.schema";

// export type UserTokenInfo = {
//   id: string | number;
//   roles: string[];
// };

// export type ValidateLoginResult
//   = | { success: true; user: UserTokenInfo }
//     | { success: false; error: string; status: "unauthorized" | "forbidden" };

type RouteTypes = {
  [K in keyof typeof routes]: typeof routes[K];
};

export type UserRouteHandler<T extends keyof RouteTypes> = PublicRouteHandler<RouteTypes[T]>;

export type UserVo = z.infer<typeof UserVoSchema>;
