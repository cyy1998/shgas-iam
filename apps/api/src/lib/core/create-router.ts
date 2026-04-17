import type { AppBindings } from "@/lib/lib";
import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "./openapi/default-hook";

export function createRouter() {
  return new OpenAPIHono<AppBindings>({
    strict: false,
    defaultHook,
  });
}
