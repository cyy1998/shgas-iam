import { createRouter } from "@iam/api-core/core/create-router";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { UserProfileFilterValidationError } from "@iam/user-profile-read-model/query";
import type { UserHandlers } from "./user.handlers";
import * as routes from "./user.routes";

export function createUserRoute(handlers: UserHandlers) {
  const router = createRouter().basePath("/users");
  router.use("/search-dsl", async (c, next) => {
    if (c.req.raw.body === null) throw new UserProfileFilterValidationError();
    await next();
    if (c.res.status === HttpStatusCodes.BAD_REQUEST) throw new UserProfileFilterValidationError();
  });
  return router
    .openapi(routes.userInfo, handlers.userInfo)
    .openapi(routes.usersSearchDsl, handlers.usersSearchDsl)
    .openapi(routes.contactRegister, handlers.contactRegister);
}
