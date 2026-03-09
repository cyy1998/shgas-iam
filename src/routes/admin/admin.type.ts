import type { AppRouteHandler } from '@schemas/lib';
import type * as routes from './admin.routes';

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

export type AdminRouteHandler<T extends keyof RouteTypes> = AppRouteHandler<RouteTypes[T]>;
