import type { PublicRouteHandler } from "@iam/api-core/types";
import type * as routes from "./position.routes";

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

export type PositionRouteHandler<T extends keyof RouteTypes> = PublicRouteHandler<RouteTypes[T]>;
