import type { OpenHandlers } from "./open.handlers";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./open.routes";

export function createOpenRoute(handlers: OpenHandlers) {
  return createRouter()
    .openapi(routes.clientStatus, handlers.clientStatus)
    .openapi(routes.capChallenge, handlers.capChallenge)
    .openapi(routes.capRedeem, handlers.capRedeem)
    .openapi(routes.maskedMobile, handlers.maskedMobile)
    .openapi(routes.codeSend, handlers.codeSend)
    .openapi(routes.codeVerify, handlers.codeVerify)
    .openapi(routes.passwordReset, handlers.passwordReset);
}
