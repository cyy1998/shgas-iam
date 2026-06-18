import type { RedisPort } from "@admin-api/composition/runtime";
import { UserDetailDtoSchema } from "@admin-api/services/user/user.schema";
import { createAdminAuthenticationHandler } from "@iam/api-core/middlewares";

export interface CreateAdminAuthenticationHandlersDeps {
  redis: RedisPort;
  config: {
    allowedClientCodes: string[];
    adminRoleCodes: string[];
  };
}

export function createAdminAuthenticationHandlers(deps: CreateAdminAuthenticationHandlersDeps) {
  return {
    adminAuthenticationHandler: createAdminAuthenticationHandler({
      redis: deps.redis,
      userSchema: UserDetailDtoSchema,
      allowedClientCodes: deps.config.allowedClientCodes,
      adminRoleCodes: deps.config.adminRoleCodes,
    }),
  };
}

export type AdminAuthenticationHandlers = ReturnType<typeof createAdminAuthenticationHandlers>;
