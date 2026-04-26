import { defineMiddleware } from "@/lib/core/define-config";
import { internalAuthenicationHandler } from "@/middlewares/authenication.handler";

export default defineMiddleware([internalAuthenicationHandler]);
