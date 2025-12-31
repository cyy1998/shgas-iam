import { z } from "@hono/zod-openapi";

export const ResponseSchema = z.object({
    code: z.int().openapi({ example: 200 }),
    data: z.unknown().openapi({ example: {} }),
    message: z.string().openapi({ example: 'success' })
}).openapi('ResponseSchema')
