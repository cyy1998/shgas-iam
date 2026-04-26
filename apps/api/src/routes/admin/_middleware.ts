import { defineMiddleware } from "@/lib/core/define-config";
import { publicAuthenicationHandler } from "@/middlewares/authenication.handler";

export default defineMiddleware([publicAuthenicationHandler]);
