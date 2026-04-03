import type { z } from "@hono/zod-openapi";
import type * as routes from "./user.routes";
import type { UserPaginationQueryDtoSchema, UserVoSchema } from "./user.schema";
import type { AppRouteHandler } from "@/lib/lib";

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

export type UserRouteHandler<T extends keyof RouteTypes> = AppRouteHandler<RouteTypes[T]>;

export type UserPaginationQueryDto = z.infer<typeof UserPaginationQueryDtoSchema>;
export type UserVo = z.infer<typeof UserVoSchema>;
