import { z } from '@hono/zod-openapi';

function createSuccessResponseSchema<T extends z.ZodSchema>(dataSchema: T) {
  return z.object({
    code: z.int().openapi({ example: 200 }),
    message: z.string().openapi({ example: 'success' }),
    data: dataSchema,
  });
}

export default createSuccessResponseSchema;
