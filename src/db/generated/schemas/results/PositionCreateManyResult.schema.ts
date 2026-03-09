import { z } from '@hono/zod-openapi';
export const PositionCreateManyResultSchema = z.object({
  count: z.number()
});