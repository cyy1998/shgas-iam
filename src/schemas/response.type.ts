import { z } from "@hono/zod-openapi";

export const ResponseSchema = z.object({
  code: z.int().openapi({ example: 200 }),
  data: z.unknown().openapi({ example: {} }),
  message: z.string().openapi({ example: "success" }),
}).openapi("ResponseSchema");

export function createResponseSchema<T extends z.ZodSchema>(dataSchema: T) {
  return z.object({
    code: z.int().openapi({ example: 200 }),
    message: z.string().openapi({ example: "success" }),
    data: dataSchema,
  });
}
