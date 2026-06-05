import { adminAuthenticationHandler } from "@admin-api/middlewares/authentication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";

export default defineMiddleware([adminAuthenticationHandler]);
