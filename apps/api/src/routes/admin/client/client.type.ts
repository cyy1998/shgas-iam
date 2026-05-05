import type { PublicRouteHandler } from "@api/types/lib";
import type * as routes from "./client.routes";

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

export type ClientRouteHandler<T extends keyof RouteTypes> = PublicRouteHandler<RouteTypes[T]>;
