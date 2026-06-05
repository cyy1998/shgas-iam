import { adminClientCodes, adminRoleCodes } from "@admin-api/env";
import redis from "@admin-api/lib/infra/redis";
import { UserDetailDtoSchema } from "@admin-api/services/user/user.schema";
import { createAdminAuthenticationHandler } from "@iam/api-core/middlewares";

export const adminAuthenticationHandler = createAdminAuthenticationHandler({
  redis,
  userSchema: UserDetailDtoSchema,
  allowedClientCodes: adminClientCodes,
  adminRoleCodes,
});
