import { publicAuthenticationHandler } from "@api/middlewares/authentication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";

export default defineMiddleware([publicAuthenticationHandler]);
