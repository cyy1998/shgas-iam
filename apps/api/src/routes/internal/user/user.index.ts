import type { UserHandlers } from "./user.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { V3UserProfileFilterValidationError } from "@iam/user-profile-read-model/v3";
import * as routes from "./user.routes";

export function createUserRoute(handlers: UserHandlers) {
  const router = createRouter().basePath("/users");
  router.use("/search-dsl", async (c, next) => {
    if (c.req.raw.body === null)
      throw new V3UserProfileFilterValidationError();
    await next();
    if (c.res.status === HttpStatusCodes.BAD_REQUEST)
      throw new V3UserProfileFilterValidationError();
  });
  return router
    .openapi(routes.userInfo, handlers.userInfo)
    .openapi(routes.usersSearch, handlers.usersSearch)
    .openapi(routes.usersSearchDsl, handlers.usersSearchDsl)
    .openapi(routes.usersSearchWithPrivilegeDelegation, handlers.usersSearchWithPrivilegeDelegation)
    .openapi(routes.contactRegister, handlers.contactRegister);
}
