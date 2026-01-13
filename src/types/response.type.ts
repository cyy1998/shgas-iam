import { z } from "@hono/zod-openapi";

export const ResponseSchema = z.object({
    code: z.int().openapi({ example: 200 }),
    data: z.unknown().openapi({ example: {} }),
    message: z.string().openapi({ example: 'success' })
}).openapi('ResponseSchema')

export const createResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    code: z.int().openapi({ example: 200 }),
    message: z.string().openapi({ example: 'success' }),
    data: dataSchema, // 这里是“抽象”的，由调用者决定具体结构
})
