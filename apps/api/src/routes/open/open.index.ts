import { createRouter } from "@/lib/core/create-router";
import * as handlers from "./open.handlers";
import * as routes from "./open.routes";

const router = createRouter();

router.openapi(routes.clientStatus, handlers.clientStatus)
  .openapi(routes.userInfo, handlers.userInfo)
  .openapi(routes.codeSend, handlers.codeSend)
  .openapi(routes.codeVerify, handlers.codeVerify)
  .openapi(routes.passwordReset, handlers.passwordReset);

export default router;
