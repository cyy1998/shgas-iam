import type { BaseBindings } from "@/types/lib";
import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "./openapi/default-hook";

export function createRouter<TBindings extends BaseBindings = BaseBindings>() {
  return new OpenAPIHono<TBindings>({
    strict: false,
    defaultHook,
  });
}
