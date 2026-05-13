import type { PublicRouteHandler as Public2RouteHandler } from "@iam/api-core/types";
import type * as routes from "./public.routes";

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

export type PublicRouteHandler<T extends keyof RouteTypes> = Public2RouteHandler<RouteTypes[T]>;
