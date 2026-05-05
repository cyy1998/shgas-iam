import { defineMiddleware } from "@api/lib/core/define-config";
import { publicAuthenicationHandler } from "@api/middlewares/authenication.handler";

export default defineMiddleware([publicAuthenicationHandler]);
