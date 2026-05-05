import { defineMiddleware } from "@api/lib/core/define-config";
import { internalAuthenicationHandler } from "@api/middlewares/authenication.handler";

export default defineMiddleware([internalAuthenicationHandler]);
