import type { BaseBindings } from "@iam/api-core/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "./openapi/default-hook";

export function createRouter<TBindings extends BaseBindings = BaseBindings>() {
  return new OpenAPIHono<TBindings>({
    strict: false,
    defaultHook,
  });
}
