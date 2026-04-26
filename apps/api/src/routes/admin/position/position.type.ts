import type * as routes from "./position.routes";
import type { AppRouteHandler } from "@/types/lib";

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

export type PositionRouteHandler<T extends keyof RouteTypes> = AppRouteHandler<RouteTypes[T]>;
