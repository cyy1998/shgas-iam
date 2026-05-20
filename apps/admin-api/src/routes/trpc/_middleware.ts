import { adminClientCodes, adminRoleCodes } from "@admin-api/env";
import redis from "@admin-api/lib/infra/redis";
import { UserDetailDtoSchema } from "@admin-api/services/user/user.schema";
import { defineMiddleware } from "@iam/api-core/core/define-config";
import { createAdminAuthenticationHandler } from "@iam/api-core/middlewares";

export default defineMiddleware([
  createAdminAuthenticationHandler({
    redis,
    userSchema: UserDetailDtoSchema,
    allowedClientCodes: adminClientCodes,
    adminRoleCodes,
  }),
]);
