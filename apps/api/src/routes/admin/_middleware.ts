import { publicAuthenicationHandler } from "@api/middlewares/authenication.handler";
import { defineMiddleware } from "@iam/api-core/core/define-config";

export default defineMiddleware([publicAuthenicationHandler]);
